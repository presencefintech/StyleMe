import {
  CanActivate,
  ArgumentsHost,
  BadRequestException,
  Catch,
  createParamDecorator,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CallHandler,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, from, of, switchMap, tap } from "rxjs";
import type { Result } from "@styleme/shared";
import type { ZodTypeAny, z } from "zod";
import * as E from "../../domain/errors";
import type { Job } from "../../domain/entities/job";

export const T = {
  JOBS: "JobRepository",
  LEDGER: "CreditLedgerRepository",
  PAYMENTS: "PaymentRepository",
  USERS: "UserRepository",
  ASSETS: "AssetRepository",
  STYLES: "StyleRepository",
  MODERATION: "ModerationService",
  ENHANCER: "ImageEnhancer",
  BACKGROUND: "BackgroundService",
  STORAGE: "StorageService",
  GATEWAY: "PaymentGateway",
  PASSWORD: "PasswordHasher",
  TOKEN_ISSUER: "TokenService",
  TOKEN_VERIFIER: "TokenVerifier",
  QUEUE: "JobQueue",
  UOW: "UnitOfWork",
  IDS: "IdGenerator",
  CLOCK: "Clock",
  PUSH: "PushService",
  IDEMPOTENCY: "IdempotencyStore",
} as const;

export interface TokenVerifier {
  verify(token: string): Promise<{ userId: string }>;
}
export interface IdempotencyStore {
  get(userId: string, key: string): Promise<{ statusCode: number; body: unknown } | null>;
  set(userId: string, key: string, value: { statusCode: number; body: unknown }): Promise<void>;
}
export interface AuthUser {
  id: string;
}

// --- Auth ---------------------------------------------------------------

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(@Inject(T.TOKEN_VERIFIER) private readonly verifier: TokenVerifier) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException();
    try {
      req.user = { id: (await this.verifier.verify(header.slice(7))).userId };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});

// --- Helpers --------------------------------------------------------------

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ message: "Validation failed", issues: r.error.issues });
  return r.data;
}

/** Result → valeur, ou lève l'erreur domaine (traduite en HTTP par le filtre). */
export function unwrap<T>(r: Result<T, E.DomainError>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

export const jobView = (job: Job, outputUrls?: string[]) => ({
  id: job.id,
  type: job.type,
  status: job.status,
  createdAt: job.createdAt ?? null,
  ...(outputUrls ? { outputs: outputUrls.map((url) => ({ url })) } : {}),
  ...(job.errorReason ? { errorReason: job.errorReason } : {}),
});

// --- Mapping erreur domaine → HTTP (une seule table) ---------------------

const HTTP_BY_ERROR: [new (...a: never[]) => E.DomainError, number][] = [
  [E.InsufficientCredits, 402],
  [E.ModerationRejected, 422],
  [E.JobNotFound, 404],
  [E.PaymentNotFound, 404],
  [E.PackNotFound, 404],
  [E.AssetNotFound, 404],
  [E.UserNotFound, 404],
  [E.InvalidJobTransition, 409],
  [E.InvalidPaymentTransition, 409],
  [E.AgeNotConfirmed, 403],
  [E.InvalidCredentials, 401],
  [E.EmailAlreadyUsed, 409],
  [E.InvalidEmail, 400],
  [E.WeakPassword, 400],
  [E.InvalidPaymentSignature, 401],
  [E.ProviderFailure, 502],
];

export function statusOf(error: E.DomainError): number {
  return HTTP_BY_ERROR.find(([cls]) => error instanceof cls)?.[1] ?? 400;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("HTTP");
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof E.DomainError) {
      return res.status(statusOf(exception)).json({ error: exception.name, message: exception.message });
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      return res.status(exception.getStatus()).json(typeof body === "string" ? { message: body } : body);
    }
    this.log.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(500).json({ error: "InternalServerError" });
  }
}

// --- Idempotency-Key ---------------------------------------------------------

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(T.IDEMPOTENCY) private readonly store: IdempotencyStore) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthUser }>();
    const res = http.getResponse<Response>();
    const key = req.header("idempotency-key");
    const userId = req.user?.id;
    if (!key || !userId) return next.handle();

    return from(this.store.get(userId, key)).pipe(
      switchMap((hit) => {
        if (hit) {
          res.status(hit.statusCode);
          return of(hit.body);
        }
        return next.handle().pipe(tap((body) => void this.store.set(userId, key, { statusCode: res.statusCode, body })));
      }),
    );
  }
}
