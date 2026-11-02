import type {
  AssetRecord,
  AssetRepository,
  Page,
  PageRequest,
  PushService,
  StorageService,
  StyleRepository,
  StyleSummary,
  BackgroundService,
  Clock,
  CreditLedgerRepository,
  IdGenerator,
  ImageEnhancer,
  InitiatePaymentRequest,
  JobQueue,
  JobRepository,
  ModerationResult,
  ModerationService,
  PasswordHasher,
  PaymentGateway,
  PaymentRepository,
  TokenService,
  UnitOfWork,
  UserRepository,
} from "../../domain/ports";
import type { Job } from "../../domain/entities/job";
import type { Payment } from "../../domain/entities/payment";
import type { User } from "../../domain/entities/user";
import { CreditAmount } from "../../domain/value-objects/credit-amount";
import type { ImageRef } from "../../domain/value-objects/image-ref";

export class InMemoryJobRepository implements JobRepository {
  readonly items = new Map<string, Job>();
  async save(job: Job) { this.items.set(job.id, job); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async listByUser(userId: string, page: PageRequest): Promise<Page<Job>> {
    // Ordre d'insertion inversé = plus récents d'abord.
    const all = [...this.items.values()].filter((j) => j.userId === userId).reverse();
    const start = page.cursor ? all.findIndex((j) => j.id === page.cursor) + 1 : 0;
    const items = all.slice(start, start + page.limit);
    const hasMore = start + page.limit < all.length;
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
  }
}

export class InMemoryAssetRepository implements AssetRepository {
  readonly items = new Map<string, AssetRecord>();
  async save(a: AssetRecord) { this.items.set(a.id, a); }
  async findByIds(ids: string[]) { return ids.flatMap((id) => this.items.get(id) ?? []); }
}

export class InMemoryStyleRepository implements StyleRepository {
  constructor(private styles: StyleSummary[] = []) {}
  async listActive() { return this.styles; }
}

export class FakeStorage implements StorageService {
  readonly puts: ImageRef[] = [];
  async presignUpload(ref: ImageRef) { return { url: `https://storage.test/upload/${ref.bucket}/${ref.key}` }; }
  async presignDownload(ref: ImageRef) { return { url: `https://storage.test/dl/${ref.bucket}/${ref.key}` }; }
  async put(ref: ImageRef) { this.puts.push(ref); }
  async delete() {}
}

export class FakePush implements PushService {
  readonly notified: string[] = [];
  async notifyJobReady(jobId: string) { this.notified.push(jobId); }
}

export class InMemoryCreditLedger implements CreditLedgerRepository {
  readonly entries: { userId: string; amount: number; reason: string; paymentId?: string }[] = [];
  async balanceOf(userId: string) {
    return CreditAmount.of(this.entries.filter((e) => e.userId === userId).reduce((s, e) => s + e.amount, 0));
  }
  async append(tx: { userId: string; amount: number; reason: string; paymentId?: string }) {
    this.entries.push(tx);
  }
}

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly items = new Map<string, Payment>();
  async save(p: Payment) { this.items.set(p.id, p); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async findByProviderRef(ref: string) {
    return [...this.items.values()].find((p) => p.providerRef === ref) ?? null;
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly items = new Map<string, User>();
  async save(u: User) { this.items.set(u.id, u); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async findByEmail(email: string) {
    return [...this.items.values()].find((u) => u.email.value === email) ?? null;
  }
}

export class FakeModeration implements ModerationService {
  readonly calls: ("input" | "output")[] = [];
  constructor(
    private results: Partial<Record<"input" | "output", Partial<ModerationResult>>> = {},
    private failWith?: Error,
  ) {}
  async check(_src: ImageRef, stage: "input" | "output"): Promise<ModerationResult> {
    this.calls.push(stage);
    if (this.failWith) throw this.failWith;
    return { approved: true, nsfwScore: 0, minorRisk: false, faceCount: 1, ...this.results[stage] };
  }
}

export class FakeEnhancer implements ImageEnhancer {
  constructor(private failWith?: Error) {}
  async upscale(src: ImageRef): Promise<ImageRef> {
    if (this.failWith) throw this.failWith;
    return { bucket: "results", key: `${src.key}.up` };
  }
  async restoreFace(src: ImageRef): Promise<ImageRef> {
    return { bucket: "results", key: `${src.key}.face` };
  }
}

export class FakeBackground implements BackgroundService {
  async remove(src: ImageRef): Promise<ImageRef> { return { bucket: "results", key: `${src.key}.nobg` }; }
  async applyTemplate(src: ImageRef, templateId: string): Promise<ImageRef> {
    return { bucket: "results", key: `${src.key}.${templateId}` };
  }
}

export class FakePaymentGateway implements PaymentGateway {
  readonly initiated: InitiatePaymentRequest[] = [];
  validSignature = "valid-sig";
  async initiate(p: InitiatePaymentRequest) {
    this.initiated.push(p);
    return { providerRef: `ref_${p.paymentId}` };
  }
  verifySignature(_payload: unknown, signature: string) { return signature === this.validSignature; }
  parseWebhook(payload: unknown) {
    return (typeof payload === "string" ? JSON.parse(payload) : payload) as { providerRef: string; success: boolean };
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string) { return `hashed:${plain}`; }
  async verify(plain: string, hash: string) { return hash === `hashed:${plain}`; }
}

export class FakeTokenService implements TokenService {
  async issue(userId: string) { return `token_${userId}`; }
}

export class FakeJobQueue implements JobQueue {
  readonly enqueued: string[] = [];
  async enqueue(jobId: string) { this.enqueued.push(jobId); }
}

/** Exécute directement ; compte les appels pour vérifier l'usage transactionnel. */
export class InMemoryUnitOfWork implements UnitOfWork {
  runs = 0;
  async run<T>(work: () => Promise<T>) { this.runs++; return work(); }
}

export class FixedClock implements Clock {
  constructor(private date = new Date("2026-01-01T00:00:00Z")) {}
  now() { return this.date; }
}

export class SequentialIdGenerator implements IdGenerator {
  private n = 0;
  next() { return `id_${++this.n}`; }
}
