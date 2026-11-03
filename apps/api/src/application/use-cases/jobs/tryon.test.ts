import { describe, expect, it } from "vitest";
import { JOB_BASE_COST } from "@styleme/shared";
import {
  FakeBackground,
  FakeEditor,
  FakeEnhancer,
  FakeEraser,
  FakeJobQueue,
  FakeModeration,
  FakeStorage,
  FakeTryOn,
  InMemoryAssetRepository,
  InMemoryCreditLedger,
  InMemoryGarmentRepository,
  InMemoryJobRepository,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from "../../__fakes__";
import { User } from "../../../domain/entities/user";
import { GarmentNotFound, InsufficientCredits } from "../../../domain/errors";
import { Email } from "../../../domain/value-objects/email";
import { CreateJob } from "./create-job";
import { ListGarments } from "./list-garments";
import { RunEnhancementJob } from "./run-enhancement-job";

const GARMENT = { id: "wax", name: "Robe pagne", category: "DRESSES" as const, description: "Robe en pagne", bucket: "garments", key: "wax.png" };

async function setup(opts: { tryOnError?: Error; credits?: number } = {}) {
  const users = new InMemoryUserRepository();
  const u = User.create({ id: "u1", email: Email.of("a@b.com"), passwordHash: "x" });
  u.confirmAge(new Date());
  await users.save(u);
  const jobs = new InMemoryJobRepository();
  const ledger = new InMemoryCreditLedger();
  await ledger.append({ userId: "u1", amount: opts.credits ?? 10, reason: "test" });
  const assets = new InMemoryAssetRepository();
  await assets.save({ id: "photo", userId: "u1", kind: "SOURCE", bucket: "sources", key: "u1/photo" });
  await assets.save({ id: "other", userId: "u2", kind: "SOURCE", bucket: "sources", key: "u2/photo" });
  const garments = new InMemoryGarmentRepository([{ ...GARMENT }, { ...GARMENT, id: "old", key: "old.png", active: false }]);
  const tryOn = new FakeTryOn(opts.tryOnError);
  const moderation = new FakeModeration();
  const create = new CreateJob(users, jobs, ledger, assets, new FakeJobQueue(), new SequentialIdGenerator(), garments);
  const run = new RunEnhancementJob(
    jobs, ledger, assets, moderation, new FakeEnhancer(), new FakeBackground(), new FakeEditor(), new FakeEraser(), new InMemoryUnitOfWork(), {},
    { garments, engine: tryOn },
  );
  return { jobs, ledger, tryOn, moderation, create, run, garments };
}

describe("essayage virtuel (TRYON)", () => {
  it("crée le job avec la tenue, l'exécute avec la bonne catégorie, livre le résultat et débite le coût", async () => {
    const s = await setup();
    const created = await s.create.execute({ userId: "u1", type: "TRYON", garmentId: "wax", inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    expect(created.value.garmentId).toBe("wax");
    expect(created.value.creditCost.value).toBe(JOB_BASE_COST.TRYON);

    expect((await s.run.execute(created.value.id)).ok).toBe(true);
    expect(s.tryOn.calls).toEqual([
      { person: { bucket: "sources", key: "u1/photo" }, garment: { bucket: "garments", key: "wax.png" }, category: "DRESSES", description: "Robe en pagne" },
    ]);
    const job = (await s.jobs.findById(created.value.id))!;
    expect(job.status).toBe("DONE");
    expect(job.outputAssetIds).toEqual(["u1/photo.tryon"]);
    expect((await s.ledger.balanceOf("u1")).value).toBe(10 - JOB_BASE_COST.TRYON);
    expect(s.moderation.calls).toEqual(["input", "output"]); // la photo de la personne ET le résultat sont modérés
  });

  it("refuse une tenue absente, inconnue ou retirée du catalogue", async () => {
    const s = await setup();
    for (const garmentId of [undefined, "inconnue", "old"]) {
      const r = await s.create.execute({ userId: "u1", type: "TRYON", garmentId, inputAssetIds: ["photo"] });
      expect(!r.ok && r.error).toBeInstanceOf(GarmentNotFound);
    }
    expect(s.jobs.items.size).toBe(0);
  });

  it("exige exactement une photo, et qu'elle appartienne à l'utilisateur", async () => {
    const s = await setup();
    const two = await s.create.execute({ userId: "u1", type: "TRYON", garmentId: "wax", inputAssetIds: ["photo", "photo2"] });
    expect(two.ok).toBe(false);
    const foreign = await s.create.execute({ userId: "u1", type: "TRYON", garmentId: "wax", inputAssetIds: ["other"] });
    expect(foreign.ok).toBe(false);
  });

  it("refuse si les crédits sont insuffisants", async () => {
    const s = await setup({ credits: JOB_BASE_COST.TRYON - 1 });
    const r = await s.create.execute({ userId: "u1", type: "TRYON", garmentId: "wax", inputAssetIds: ["photo"] });
    expect(!r.ok && r.error).toBeInstanceOf(InsufficientCredits);
  });

  it("n'est pas débité si le fournisseur échoue", async () => {
    const s = await setup({ tryOnError: new Error("replicate down") });
    const created = await s.create.execute({ userId: "u1", type: "TRYON", garmentId: "wax", inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    expect((await s.run.execute(created.value.id, { isLastAttempt: true })).ok).toBe(false);
    expect((await s.jobs.findById(created.value.id))!.status).toBe("FAILED");
    expect((await s.ledger.balanceOf("u1")).value).toBe(10);
  });

  it("échoue proprement (0 crédit) si la tenue a été retirée entre la création et l'exécution", async () => {
    const s = await setup();
    const created = await s.create.execute({ userId: "u1", type: "TRYON", garmentId: "wax", inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    s.garments.items.find((g) => g.id === "wax")!.active = false;
    expect((await s.run.execute(created.value.id)).ok).toBe(false);
    expect((await s.ledger.balanceOf("u1")).value).toBe(10);
  });
});

describe("ListGarments", () => {
  it("liste les tenues actives avec une miniature signée", async () => {
    const garments = new InMemoryGarmentRepository([{ ...GARMENT }, { ...GARMENT, id: "old", key: "old.png", active: false }]);
    const r = await new ListGarments(garments, new FakeStorage()).execute();
    if (!r.ok) throw r.error;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]).toMatchObject({ id: "wax", category: "DRESSES", previewUrl: "https://storage.test/dl/garments/wax.png" });
  });
});
