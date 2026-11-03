import { HAIR_CLEAR_PROMPT, HAIRSTYLES, JOB_BASE_COST, hairstylePrompt } from "@styleme/shared";
import { describe, expect, it } from "vitest";
import { Job } from "../../../domain/entities/job";
import { CreditAmount } from "../../../domain/value-objects/credit-amount";
import { User } from "../../../domain/entities/user";
import { Email } from "../../../domain/value-objects/email";
import {
  FakeBackground, FakeEditor, FakeEnhancer, FakeEraser, FakeFaceLock, FakeJobQueue, FakeModeration, InMemoryAssetRepository, InMemoryCreditLedger,
  InMemoryJobRepository, InMemoryUnitOfWork, InMemoryUserRepository, SequentialIdGenerator,
} from "../../__fakes__";
import type { ImageRef } from "../../../domain/value-objects/image-ref";
import { CreateJob } from "./create-job";
import { RunEnhancementJob } from "./run-enhancement-job";

async function setup(opts: { lockError?: Error; credits?: number; withLock?: boolean } = {}) {
  const users = new InMemoryUserRepository();
  const u = User.create({ id: "u1", email: Email.of("a@b.com"), passwordHash: "x" });
  u.confirmAge(new Date());
  await users.save(u);
  const jobs = new InMemoryJobRepository();
  const ledger = new InMemoryCreditLedger();
  await ledger.append({ userId: "u1", amount: opts.credits ?? 10, reason: "test" });
  const assets = new InMemoryAssetRepository();
  await assets.save({ id: "photo", userId: "u1", kind: "SOURCE", bucket: "sources", key: "u1/photo" });
  const editor = new FakeEditor();
  const discarded: ImageRef[] = [];
  const lock = new FakeFaceLock(opts.lockError);
  const create = new CreateJob(users, jobs, ledger, assets, new FakeJobQueue(), new SequentialIdGenerator());
  const run = new RunEnhancementJob(
    jobs, ledger, assets, new FakeModeration(), new FakeEnhancer(), new FakeBackground(), editor, new FakeEraser(), new InMemoryUnitOfWork(), {},
    undefined, opts.withLock === false ? undefined : { faceLock: lock, discard: async (ref) => { discarded.push(ref); } },
  );
  return { jobs, ledger, editor, lock, create, run, discarded };
}

const ID = HAIRSTYLES[0]!.id;

describe("coiffure (HAIRSTYLE)", () => {
  it("édite les cheveux avec la consigne du catalogue, recolle le visage d'origine, débite 2 crédits", async () => {
    const s = await setup();
    const created = await s.create.execute({ userId: "u1", type: "HAIRSTYLE", hairstyleId: ID, inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    expect(created.value.creditCost.value).toBe(JOB_BASE_COST.HAIRSTYLE);
    expect((await s.run.execute(created.value.id)).ok).toBe(true);
    // Deux passes : crâne dégagé, puis coiffure sur le résultat de la première ; le visage est recollé depuis la photo d'origine.
    expect(s.editor.calls.map((c) => c.instruction)).toEqual([HAIR_CLEAR_PROMPT, hairstylePrompt(HAIRSTYLES[0]!)]);
    expect(s.editor.calls[1]!.src.key).toBe("u1/photo.edited");
    expect(s.lock.calls).toEqual([{ original: { bucket: "sources", key: "u1/photo" }, edited: { bucket: "results", key: "u1/photo.edited.edited" } }]);
    expect(s.discarded).toEqual([{ bucket: "results", key: "u1/photo.edited" }]);
    const job = (await s.jobs.findById(created.value.id))!;
    expect(job.status).toBe("DONE");
    expect(job.outputAssetIds).toEqual(["u1/photo.edited.edited.locked"]);
    expect((await s.ledger.balanceOf("u1")).value).toBe(10 - JOB_BASE_COST.HAIRSTYLE);
  });

  it("enchaînée après un essayage : part du résultat et garde la tenue du look", async () => {
    const s = await setup();
    const tryon = Job.create({ id: "t1", userId: "u1", type: "TRYON", garmentId: "wax", creditCost: CreditAmount.of(3), inputAssetIds: ["photo"] });
    tryon.markProcessing();
    tryon.markDone(["u1/tryon.png"]);
    await s.jobs.save(tryon);
    const created = await s.create.execute({ userId: "u1", type: "HAIRSTYLE", hairstyleId: ID, inputAssetIds: [], fromJobId: "t1" });
    if (!created.ok) throw created.error;
    expect(created.value.garmentId).toBe("wax");
    expect(created.value.hairstyleId).toBe(ID);
  });

  it("refuse une coiffure inconnue ou un solde insuffisant", async () => {
    const s = await setup({ credits: JOB_BASE_COST.HAIRSTYLE - 1 });
    expect((await s.create.execute({ userId: "u1", type: "HAIRSTYLE", hairstyleId: "nope", inputAssetIds: ["photo"] })).ok).toBe(false);
    expect((await s.create.execute({ userId: "u1", type: "HAIRSTYLE", hairstyleId: ID, inputAssetIds: ["photo"] })).ok).toBe(false);
  });

  it("aucun visage détecté : le job échoue, rien n'est livré ni débité", async () => {
    const s = await setup({ lockError: new Error("face_not_found") });
    const created = await s.create.execute({ userId: "u1", type: "HAIRSTYLE", hairstyleId: ID, inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    expect((await s.run.execute(created.value.id)).ok).toBe(false);
    expect((await s.jobs.findById(created.value.id))!.status).toBe("FAILED");
    expect((await s.ledger.balanceOf("u1")).value).toBe(10);
  });

  it("sans verrou du visage configuré, refuse de livrer (identité non garantie)", async () => {
    const s = await setup({ withLock: false });
    const created = await s.create.execute({ userId: "u1", type: "HAIRSTYLE", hairstyleId: ID, inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    expect((await s.run.execute(created.value.id)).ok).toBe(false);
    expect(s.editor.calls).toHaveLength(0);
    expect((await s.ledger.balanceOf("u1")).value).toBe(10);
  });
});
