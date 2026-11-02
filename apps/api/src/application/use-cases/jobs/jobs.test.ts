import { describe, expect, it } from "vitest";
import {
  FakeBackground,
  FakeEnhancer,
  FakeJobQueue,
  FakeModeration,
  InMemoryAssetRepository,
  InMemoryCreditLedger,
  InMemoryJobRepository,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from "../../__fakes__";
import { User } from "../../../domain/entities/user";
import { AgeNotConfirmed, AssetNotFound, InsufficientCredits } from "../../../domain/errors";
import { Email } from "../../../domain/value-objects/email";
import { CreateJob } from "./create-job";
import { RunEnhancementJob } from "./run-enhancement-job";

async function setup(opts: { credits?: number; ageConfirmed?: boolean; moderation?: ConstructorParameters<typeof FakeModeration>[0]; enhancerError?: Error; moderationError?: Error } = {}) {
  const users = new InMemoryUserRepository();
  const jobs = new InMemoryJobRepository();
  const ledger = new InMemoryCreditLedger();
  const queue = new FakeJobQueue();
  const uow = new InMemoryUnitOfWork();
  const moderation = new FakeModeration(opts.moderation, opts.moderationError);
  const user = User.create({ id: "u1", email: Email.of("u1@test.com"), passwordHash: "x" });
  if (opts.ageConfirmed ?? true) user.confirmAge(new Date());
  await users.save(user);
  if ((opts.credits ?? 5) > 0) await ledger.append({ userId: "u1", amount: opts.credits ?? 5, reason: "seed" });

  const assets = new InMemoryAssetRepository();
  await assets.save({ id: "asset1", userId: "u1", kind: "SOURCE", bucket: "sources", key: "u1/asset1" });
  await assets.save({ id: "foreign", userId: "u2", kind: "SOURCE", bucket: "sources", key: "u2/foreign" });

  const create = new CreateJob(users, jobs, ledger, assets, queue, new SequentialIdGenerator());
  const run = new RunEnhancementJob(jobs, ledger, assets, moderation, new FakeEnhancer(opts.enhancerError), new FakeBackground(), uow);
  return { jobs, ledger, queue, uow, moderation, create, run };
}

const input = { userId: "u1", type: "ENHANCE" as const, inputAssetIds: ["asset1"] };

describe("CreateJob", () => {
  it("crée un job PENDING et l'enqueue", async () => {
    const s = await setup();
    const r = await s.create.execute(input);
    expect(r.ok).toBe(true);
    expect(s.jobs.items.size).toBe(1);
    expect(s.queue.enqueued).toEqual(["id_1"]);
  });
  it("solde insuffisant → InsufficientCredits, aucun job créé", async () => {
    const s = await setup({ credits: 0 });
    const r = await s.create.execute(input);
    expect(!r.ok && r.error).toBeInstanceOf(InsufficientCredits);
    expect(s.jobs.items.size).toBe(0);
    expect(s.queue.enqueued).toEqual([]);
  });
  it("asset d'un autre utilisateur ou inconnu → AssetNotFound, aucun job créé", async () => {
    const s = await setup();
    const foreign = await s.create.execute({ ...input, inputAssetIds: ["foreign"] });
    const unknown = await s.create.execute({ ...input, inputAssetIds: ["nope"] });
    expect(!foreign.ok && foreign.error).toBeInstanceOf(AssetNotFound);
    expect(!unknown.ok && unknown.error).toBeInstanceOf(AssetNotFound);
    expect(s.jobs.items.size).toBe(0);
  });
  it("âge non confirmé → AgeNotConfirmed, aucun job créé", async () => {
    const s = await setup({ ageConfirmed: false });
    const r = await s.create.execute(input);
    expect(!r.ok && r.error).toBeInstanceOf(AgeNotConfirmed);
    expect(s.jobs.items.size).toBe(0);
  });
});

describe("RunEnhancementJob", () => {
  async function created(s: Awaited<ReturnType<typeof setup>>) {
    const r = await s.create.execute(input);
    if (!r.ok) throw r.error;
    return r.value.id;
  }

  it("succès → DONE et exactement un débit, dans une transaction", async () => {
    const s = await setup();
    const id = await created(s);
    const r = await s.run.execute(id);
    expect(r.ok).toBe(true);
    expect(s.jobs.items.get(id)?.status).toBe("DONE");
    expect(s.jobs.items.get(id)?.outputAssetIds).toHaveLength(1);
    expect((await s.ledger.balanceOf("u1")).value).toBe(4);
    expect(s.ledger.entries.filter((e) => e.amount < 0)).toHaveLength(1);
    expect(s.uow.runs).toBe(1);
  });

  it("modération entrée rejetée → REJECTED, 0 débit", async () => {
    const s = await setup({ moderation: { input: { approved: false } } });
    const id = await created(s);
    await s.run.execute(id);
    expect(s.jobs.items.get(id)?.status).toBe("REJECTED");
    expect(s.jobs.items.get(id)?.errorReason).toBe("moderation_input");
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });

  it("risque mineur en entrée → REJECTED, 0 débit", async () => {
    const s = await setup({ moderation: { input: { minorRisk: true } } });
    const id = await created(s);
    await s.run.execute(id);
    expect(s.jobs.items.get(id)?.status).toBe("REJECTED");
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });

  it("modération sortie rejetée → REJECTED, 0 débit, aucune livraison", async () => {
    const s = await setup({ moderation: { output: { approved: false } } });
    const id = await created(s);
    await s.run.execute(id);
    const job = s.jobs.items.get(id);
    expect(job?.status).toBe("REJECTED");
    expect(job?.errorReason).toBe("moderation_output");
    expect(job?.outputAssetIds).toEqual([]);
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
    expect(s.uow.runs).toBe(0);
  });

  it("échec provider → FAILED, 0 débit", async () => {
    const s = await setup({ enhancerError: new Error("gpu down") });
    const id = await created(s);
    const r = await s.run.execute(id);
    expect(r.ok).toBe(false);
    expect(s.jobs.items.get(id)?.status).toBe("FAILED");
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });

  it("échec provider non définitif → job reste PROCESSING, puis la reprise réussit (1 seul débit)", async () => {
    const s = await setup({ enhancerError: new Error("gpu down") });
    const id = await created(s);
    const first = await s.run.execute(id, { isLastAttempt: false });
    expect(first.ok).toBe(false);
    expect(s.jobs.items.get(id)?.status).toBe("PROCESSING");
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });

  it("panne du service de modération → FAILED (jamais livré sans modération), 0 débit", async () => {
    const s = await setup({ moderationError: new Error("moderation 503") });
    const id = await created(s);
    const r = await s.run.execute(id);
    expect(r.ok).toBe(false);
    expect(s.jobs.items.get(id)?.status).toBe("FAILED");
    expect(s.jobs.items.get(id)?.outputAssetIds).toEqual([]);
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });

  it("panne de modération non définitive → reste PROCESSING pour la reprise", async () => {
    const s = await setup({ moderationError: new Error("moderation 503") });
    const id = await created(s);
    await s.run.execute(id, { isLastAttempt: false });
    expect(s.jobs.items.get(id)?.status).toBe("PROCESSING");
  });

  it("job déjà traité → erreur de transition, pas de double débit", async () => {
    const s = await setup();
    const id = await created(s);
    await s.run.execute(id);
    const again = await s.run.execute(id);
    expect(again.ok).toBe(false);
    expect(s.ledger.entries.filter((e) => e.amount < 0)).toHaveLength(1);
  });

  it("job inconnu → JobNotFound", async () => {
    const s = await setup();
    const r = await s.run.execute("nope");
    expect(r.ok).toBe(false);
  });
});
