import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown, OnModuleInit, type DynamicModule, type Provider } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";
import type { Worker } from "bullmq";
import { PurgeExpiredData, RunEnhancementJob } from "../application";
import type { BackgroundService, GarmentRepository, ImageEditor, ImageEnhancer, ModerationService, ObjectEraser, ObjectSelector, PushService, UnitOfWork, VirtualTryOn } from "../domain/ports";
import { T, type IdempotencyStore, type TokenVerifier } from "../presentation/http/common";
import { RemoveBgBackground, ReplicateEditor, ReplicateEnhancer, ReplicateEraser, ReplicateTryOn, SightengineModeration, UnconfiguredEditor, UnconfiguredEraser, UnconfiguredTryOn } from "./ai/api-ai";
import { LocalBackground, LocalEnhancer, LocalModeration, LocalObjectSelector } from "./ai/local-ai";
import { JwtTokenService, ScryptPasswordHasher } from "./auth/auth-adapters";
import { LogPushService, SystemClock, UuidGenerator } from "./common/common";
import type { Env } from "./config/env";
import { FlexpayGateway } from "./payment/flexpay-gateway";
import { reportError } from "./observability/sentry";
import {
  PrismaAccountDataRepository,
  PrismaAssetRepository,
  PrismaCreditLedgerRepository,
  PrismaGarmentRepository,
  PrismaJobRepository,
  PrismaPaymentRepository,
  PrismaStyleRepository,
  PrismaUserRepository,
} from "./persistence/prisma-repositories";
import { PrismaService, PrismaUnitOfWork } from "./persistence/prisma.service";
import { BullJobQueue, createEnhancementWorker } from "./queue/bull-queue";
import { InlineJobQueue } from "./queue/inline-queue";
import { SupabaseStorageService } from "./storage/supabase-storage.service";

class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}
  async get(userId: string, key: string) {
    const r = await this.prisma.db.idempotencyRecord.findUnique({ where: { userId_key: { userId, key } } });
    return r ? { statusCode: r.statusCode, body: r.body } : null;
  }
  async set(userId: string, key: string, v: { statusCode: number; body: unknown }) {
    await this.prisma.db.idempotencyRecord.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, statusCode: v.statusCode, body: v.body as object },
      update: {},
    });
  }
}

/** Démarre le consumer BullMQ et ferme proprement queue/worker/redis à l'arrêt. */
@Injectable()
class QueueRuntime implements OnApplicationShutdown {
  private readonly log = new Logger("Queue");
  private worker?: Worker;
  constructor(
    @Inject("REDIS") private readonly redis: Redis,
    @Inject(T.QUEUE) private readonly queue: BullJobQueue,
    @Inject("RUN_JOB") runJob: RunEnhancementJob,
    @Inject(T.PUSH) push: PushService,
  ) {
    // BullMQ exige maxRetriesPerRequest=null pour les Workers : connexion dédiée.
    this.worker = createEnhancementWorker(redis.duplicate({ maxRetriesPerRequest: null }), runJob, push, (m) => this.log.warn(m));
    this.worker.on("failed", (job, e) => {
      this.log.error(`job ${job?.id} failed: ${e.message}`);
      // Un échec provider qui sera retenté n'est pas encore une alerte : on signale seulement le dernier essai.
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) reportError(e, { jobId: String(job.id), attempts: String(job.attemptsMade) });
    });
  }
  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue.close();
    this.redis.disconnect();
  }
}

const RETENTION_FIRST_RUN_MS = 60_000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/** Purge de rétention : une minute après le démarrage, puis toutes les heures. Idempotent, un seul réplica suffit. */
@Injectable()
class RetentionRuntime implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger("Retention");
  private first?: NodeJS.Timeout;
  private every?: NodeJS.Timeout;
  private running = false;
  constructor(@Inject("PURGE") private readonly purge: PurgeExpiredData) {}

  onModuleInit() {
    this.first = setTimeout(() => void this.run(), RETENTION_FIRST_RUN_MS);
    this.every = setInterval(() => void this.run(), RETENTION_INTERVAL_MS);
    this.first.unref();
    this.every.unref();
  }
  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.purge.execute();
    } catch (e) {
      this.log.error(`purge échouée : ${e instanceof Error ? e.message : String(e)}`);
      reportError(e, { phase: "retention" });
    } finally {
      this.running = false;
    }
  }
  onApplicationShutdown() {
    clearTimeout(this.first);
    clearInterval(this.every);
  }
}

/** Seul endroit qui choisit les implémentations des ports (config → adapters). */
@Global()
@Module({})
export class InfrastructureModule {
  static register(env: Env): DynamicModule {
    const prisma = (p: PrismaService) => p;
    const providers: Provider[] = [
      PrismaService,
      ...(env.REDIS_URL ? [{ provide: "REDIS", useFactory: () => new Redis(env.REDIS_URL as string, { maxRetriesPerRequest: null }) }] : []),
      { provide: T.UOW, useFactory: (p: PrismaService) => new PrismaUnitOfWork(prisma(p)), inject: [PrismaService] },
      { provide: T.JOBS, useFactory: (p: PrismaService) => new PrismaJobRepository(p), inject: [PrismaService] },
      { provide: T.LEDGER, useFactory: (p: PrismaService) => new PrismaCreditLedgerRepository(p), inject: [PrismaService] },
      { provide: T.PAYMENTS, useFactory: (p: PrismaService) => new PrismaPaymentRepository(p), inject: [PrismaService] },
      { provide: T.USERS, useFactory: (p: PrismaService) => new PrismaUserRepository(p), inject: [PrismaService] },
      { provide: T.ASSETS, useFactory: (p: PrismaService) => new PrismaAssetRepository(p), inject: [PrismaService] },
      { provide: T.ACCOUNT_DATA, useFactory: (p: PrismaService) => new PrismaAccountDataRepository(p), inject: [PrismaService] },
      { provide: T.GARMENTS, useFactory: (p: PrismaService) => new PrismaGarmentRepository(p), inject: [PrismaService] },
      { provide: T.STYLES, useFactory: (p: PrismaService) => new PrismaStyleRepository(p), inject: [PrismaService] },
      {
        provide: "PURGE",
        useFactory: (assets: PrismaAssetRepository, jobs: PrismaJobRepository, storage: SupabaseStorageService) => {
          const log = new Logger("Retention");
          return new PurgeExpiredData(assets, jobs, storage, new SystemClock(), (m) => log.log(m));
        },
        inject: [T.ASSETS, T.JOBS, T.STORAGE],
      },
      { provide: T.IDEMPOTENCY, useFactory: (p: PrismaService) => new PrismaIdempotencyStore(p), inject: [PrismaService] },
      { provide: T.IDS, useValue: new UuidGenerator() },
      { provide: T.CLOCK, useValue: new SystemClock() },
      { provide: T.PUSH, useValue: new LogPushService() },
      {
        provide: T.STORAGE,
        useValue: new SupabaseStorageService(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })),
      },
      env.REDIS_URL
        ? { provide: T.QUEUE, useFactory: (redis: Redis) => new BullJobQueue(redis), inject: ["REDIS"] }
        : {
            provide: T.QUEUE,
            useFactory: (run: RunEnhancementJob, push: PushService) => {
              const log = new Logger("InlineQueue");
              log.warn("REDIS_URL absent : file de jobs EN MÉMOIRE (dev uniquement, non persistée).");
              return new InlineJobQueue(run, push, (m) => log.warn(m));
            },
            inject: ["RUN_JOB", T.PUSH],
          },
      {
        provide: T.ENHANCER,
        useFactory: (storage: SupabaseStorageService): ImageEnhancer =>
          env.AI_MODE === "local"
            ? new LocalEnhancer(env.LOCAL_AI_URL!)
            : new ReplicateEnhancer(env.REPLICATE_TOKEN!, env.REPLICATE_UPSCALE_MODEL!, env.REPLICATE_FACE_MODEL!, storage),
        inject: [T.STORAGE],
      },
      {
        provide: T.EDITOR,
        useFactory: (storage: SupabaseStorageService): ImageEditor =>
          env.REPLICATE_TOKEN ? new ReplicateEditor(env.REPLICATE_TOKEN, env.REPLICATE_EDIT_MODEL, storage) : new UnconfiguredEditor(),
        inject: [T.STORAGE],
      },
      {
        provide: T.TRYON,
        useFactory: (storage: SupabaseStorageService): VirtualTryOn =>
          env.REPLICATE_TOKEN ? new ReplicateTryOn(env.REPLICATE_TOKEN, env.REPLICATE_TRYON_VERSION, storage) : new UnconfiguredTryOn(),
        inject: [T.STORAGE],
      },
      {
        provide: T.ERASER,
        useFactory: (storage: SupabaseStorageService): ObjectEraser =>
          env.REPLICATE_TOKEN ? new ReplicateEraser(env.REPLICATE_TOKEN, env.REPLICATE_ERASE_MODEL, storage) : new UnconfiguredEraser(),
        inject: [T.STORAGE],
      },
      {
        provide: T.SELECTOR,
        // La sélection par clic (SAM) tourne dans le service IA local, quel que soit AI_MODE.
        useFactory: (): ObjectSelector => new LocalObjectSelector(env.LOCAL_AI_URL ?? "http://127.0.0.1:8000"),
      },
      {
        provide: T.BACKGROUND,
        useFactory: (storage: SupabaseStorageService): BackgroundService =>
          env.AI_MODE === "local" ? new LocalBackground(env.LOCAL_AI_URL!) : new RemoveBgBackground(env.REMOVEBG_KEY!, storage),
        inject: [T.STORAGE],
      },
      {
        provide: T.MODERATION,
        useFactory: (storage: SupabaseStorageService): ModerationService =>
          env.MODERATION_PROVIDER === "local"
            ? new LocalModeration(env.LOCAL_AI_URL!)
            : new SightengineModeration(env.SIGHTENGINE_USER!, env.SIGHTENGINE_SECRET!, storage),
        inject: [T.STORAGE],
      },
      {
        provide: T.GATEWAY,
        useValue: new FlexpayGateway({
          apiUrl: env.PAYMENT_API_URL,
          apiKey: env.PAYMENT_API_KEY,
          merchant: env.PAYMENT_MERCHANT,
          callbackUrl: env.PAYMENT_CALLBACK_URL,
          webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
        }),
      },
      { provide: T.PASSWORD, useValue: new ScryptPasswordHasher() },
      { provide: T.TOKEN_ISSUER, useFactory: (jwt: JwtService) => new JwtTokenService(jwt), inject: [JwtService] },
      {
        provide: T.TOKEN_VERIFIER,
        // Un jeton reste valide 30 jours : on vérifie aussi que le compte n'a pas été supprimé (résultat gardé 30 s).
        useFactory: (jwt: JwtService, p: PrismaService): TokenVerifier => {
          const activeUntil = new Map<string, number>();
          return {
            verify: async (token) => {
              const userId = (await jwt.verifyAsync<{ sub: string }>(token)).sub;
              if ((activeUntil.get(userId) ?? 0) > Date.now()) return { userId };
              const user = await p.root.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
              if (!user) throw new Error("account deleted or unknown");
              if (activeUntil.size > 5000) activeUntil.clear();
              activeUntil.set(userId, Date.now() + 30_000);
              return { userId };
            },
          };
        },
        inject: [JwtService, PrismaService],
      },
      {
        provide: "RUN_JOB",
        useFactory: (
          jobs: PrismaJobRepository,
          ledger: PrismaCreditLedgerRepository,
          assets: PrismaAssetRepository,
          ...rest: [ModerationService, ImageEnhancer, BackgroundService, ImageEditor, ObjectEraser, UnitOfWork, VirtualTryOn, GarmentRepository]
        ) => {
          const [moderation, enhancer, background, editor, eraser, uow, engine, garments] = rest;
          return new RunEnhancementJob(jobs, ledger, assets, moderation, enhancer, background, editor, eraser, uow, { upscaleResults: env.UPSCALE_RESULTS === "true" }, { garments, engine });
        },
        inject: [T.JOBS, T.LEDGER, T.ASSETS, T.MODERATION, T.ENHANCER, T.BACKGROUND, T.EDITOR, T.ERASER, T.UOW, T.TRYON, T.GARMENTS],
      },
      ...(env.REDIS_URL ? [QueueRuntime] : []),
      ...(env.RETENTION_ENABLED === "true" ? [RetentionRuntime] : []),
    ];
    const exported = [
      PrismaService, T.UOW, T.JOBS, T.LEDGER, T.PAYMENTS, T.USERS, T.ASSETS, T.ACCOUNT_DATA, T.GARMENTS, T.STYLES, T.IDEMPOTENCY, T.IDS, T.CLOCK, T.PUSH,
      T.STORAGE, T.QUEUE, T.ENHANCER, T.BACKGROUND, T.EDITOR, T.ERASER, T.SELECTOR, T.MODERATION, T.GATEWAY, T.PASSWORD, T.TOKEN_ISSUER, T.TOKEN_VERIFIER,
    ];
    return {
      module: InfrastructureModule,
      imports: [JwtModule.register({ secret: env.JWT_SECRET })],
      providers,
      exports: exported,
    };
  }
}
