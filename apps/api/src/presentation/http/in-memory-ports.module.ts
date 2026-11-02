import { Global, Module, type DynamicModule } from "@nestjs/common";
import {
  FakeBackground,
  FakeEnhancer,
  FakeJobQueue,
  FakeModeration,
  FakePasswordHasher,
  FakePaymentGateway,
  FakePush,
  FakeStorage,
  FakeTokenService,
  FixedClock,
  InMemoryAssetRepository,
  InMemoryCreditLedger,
  InMemoryJobRepository,
  InMemoryPaymentRepository,
  InMemoryStyleRepository,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from "../../application/__fakes__";
import { T, type IdempotencyStore } from "./common";

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly items = new Map<string, { statusCode: number; body: unknown }>();
  async get(userId: string, key: string) { return this.items.get(`${userId}:${key}`) ?? null; }
  async set(userId: string, key: string, v: { statusCode: number; body: unknown }) { this.items.set(`${userId}:${key}`, v); }
}

/** Ports en mémoire (tests e2e HTTP, démos sans infra). Retourne le module ET les instances pour piloter les tests. */
export function createInMemoryPorts() {
  const fakes = {
    jobs: new InMemoryJobRepository(),
    ledger: new InMemoryCreditLedger(),
    payments: new InMemoryPaymentRepository(),
    users: new InMemoryUserRepository(),
    assets: new InMemoryAssetRepository(),
    styles: new InMemoryStyleRepository([{ id: "wedding", name: "Mariage", kind: "OCCASION", creditCost: 1 }]),
    moderation: new FakeModeration(),
    enhancer: new FakeEnhancer(),
    background: new FakeBackground(),
    storage: new FakeStorage(),
    gateway: new FakePaymentGateway(),
    password: new FakePasswordHasher(),
    tokens: new FakeTokenService(),
    queue: new FakeJobQueue(),
    uow: new InMemoryUnitOfWork(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(),
    push: new FakePush(),
    idempotency: new InMemoryIdempotencyStore(),
  };
  const verifier = {
    async verify(token: string) {
      if (!token.startsWith("token_")) throw new Error("bad token");
      return { userId: token.slice("token_".length) };
    },
  };
  const providers = [
    [T.JOBS, fakes.jobs], [T.LEDGER, fakes.ledger], [T.PAYMENTS, fakes.payments], [T.USERS, fakes.users],
    [T.ASSETS, fakes.assets], [T.STYLES, fakes.styles], [T.MODERATION, fakes.moderation], [T.ENHANCER, fakes.enhancer],
    [T.BACKGROUND, fakes.background], [T.STORAGE, fakes.storage], [T.GATEWAY, fakes.gateway], [T.PASSWORD, fakes.password],
    [T.TOKEN_ISSUER, fakes.tokens], [T.TOKEN_VERIFIER, verifier], [T.QUEUE, fakes.queue], [T.UOW, fakes.uow],
    [T.IDS, fakes.ids], [T.CLOCK, fakes.clock], [T.PUSH, fakes.push], [T.IDEMPOTENCY, fakes.idempotency],
  ].map(([provide, useValue]) => ({ provide: provide as string, useValue }));

  @Global()
  @Module({ providers, exports: providers.map((p) => p.provide) })
  class InMemoryPortsModule {}

  return { module: InMemoryPortsModule as unknown as DynamicModule, fakes };
}
