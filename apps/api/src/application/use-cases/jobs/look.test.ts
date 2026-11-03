import { ACCESSORIES, BACKGROUND_PRESETS, COLLECTIONS, HAIR_CLEAR_PROMPT, HAIRSTYLES, MAKEUPS, OCCASION_PROMPTS, accessoriesPrompt, hairstylePrompt, lookCost, makeupPrompt } from "@styleme/shared";
import { describe, expect, it } from "vitest";
import { User } from "../../../domain/entities/user";
import type { ImageRef } from "../../../domain/value-objects/image-ref";
import { Email } from "../../../domain/value-objects/email";
import {
  FakeBackground, FakeEditor, FakeEnhancer, FakeEraser, FakeFaceLock, FakeJobQueue, FakeMakeupBlender, FakeModeration, FakeTryOn, InMemoryAssetRepository,
  InMemoryCreditLedger, InMemoryGarmentRepository, InMemoryJobRepository, InMemoryUnitOfWork, InMemoryUserRepository, SequentialIdGenerator,
} from "../../__fakes__";
import { CreateJob } from "./create-job";
import { RunEnhancementJob } from "./run-enhancement-job";

async function setup(opts: { blendError?: Error; credits?: number } = {}) {
  const users = new InMemoryUserRepository();
  const u = User.create({ id: "u1", email: Email.of("a@b.com"), passwordHash: "x" });
  u.confirmAge(new Date());
  await users.save(u);
  const jobs = new InMemoryJobRepository();
  const ledger = new InMemoryCreditLedger();
  await ledger.append({ userId: "u1", amount: opts.credits ?? 30, reason: "test" });
  const assets = new InMemoryAssetRepository();
  await assets.save({ id: "photo", userId: "u1", kind: "SOURCE", bucket: "sources", key: "u1/photo" });
  const garments = new InMemoryGarmentRepository([{ id: "wax", name: "Robe pagne", category: "DRESSES", bucket: "garments", key: "wax.png" }]);
  const editor = new FakeEditor();
  const tryOn = new FakeTryOn();
  const lock = new FakeFaceLock();
  const blender = new FakeMakeupBlender();
  if (opts.blendError) blender.blend = async () => { throw opts.blendError; };
  const discarded: ImageRef[] = [];
  const create = new CreateJob(users, jobs, ledger, assets, new FakeJobQueue(), new SequentialIdGenerator(), garments);
  const run = new RunEnhancementJob(
    jobs, ledger, assets, new FakeModeration(), new FakeEnhancer(), new FakeBackground(), editor, new FakeEraser(), new InMemoryUnitOfWork(), {},
    { garments, engine: tryOn }, { faceLock: lock, makeupBlender: blender, discard: async (ref) => { discarded.push(ref); } },
  );
  return { jobs, ledger, editor, tryOn, lock, blender, discarded, create, run };
}

const FULL = { type: "LOOK" as const, garmentId: "wax", hairstyleId: "cornrows", makeupId: "glamour", accessoryIds: ["collier-or", "creoles-or"], styleId: "mariage", inputAssetIds: ["photo"] };

describe("catalogues du look", () => {
  it("le prix est la somme des étapes choisies", () => {
    expect(lookCost({})).toBe(0);
    expect(lookCost({ makeupId: "nude" })).toBe(2);
    expect(lookCost({ garmentId: "wax", hairstyleId: "afro" })).toBe(5);
    expect(lookCost({ garmentId: "wax", hairstyleId: "afro", makeupId: "nude", accessoryIds: ["sac-luxe"], styleId: "mariage" })).toBe(11);
    expect(lookCost({ accessoryIds: [] })).toBe(0);
  });

  it("chaque collection ne référence que des éléments qui existent", () => {
    for (const c of COLLECTIONS) {
      if (c.styleId) expect(c.styleId in BACKGROUND_PRESETS, c.id).toBe(true);
      if (c.hairstyleId) expect(HAIRSTYLES.some((h) => h.id === c.hairstyleId), c.id).toBe(true);
      if (c.makeupId) expect(MAKEUPS.some((m) => m.id === c.makeupId), c.id).toBe(true);
      for (const a of c.accessoryIds ?? []) expect(ACCESSORIES.some((x) => x.id === a), c.id).toBe(true);
    }
  });
});

describe("look composé (LOOK)", () => {
  it("enchaîne tenue, coiffure, maquillage, accessoires puis fond ; débite la somme ; supprime les intermédiaires", async () => {
    const s = await setup();
    const created = await s.create.execute({ userId: "u1", ...FULL });
    if (!created.ok) throw created.error;
    expect(created.value.creditCost.value).toBe(lookCost(FULL));
    expect((await s.run.execute(created.value.id)).ok).toBe(true);

    expect(s.tryOn.calls).toHaveLength(1);
    expect(s.editor.calls.map((c) => c.instruction)).toEqual([
      HAIR_CLEAR_PROMPT,
      hairstylePrompt(HAIRSTYLES.find((h) => h.id === "cornrows")!),
      makeupPrompt(MAKEUPS.find((m) => m.id === "glamour")!),
      accessoriesPrompt(ACCESSORIES.filter((a) => ["collier-or", "creoles-or"].includes(a.id))),
      OCCASION_PROMPTS.mariage,
    ]);
    expect(s.blender.calls).toHaveLength(1);
    expect(s.lock.calls).toHaveLength(3); // coiffure, accessoires, fond

    const job = (await s.jobs.findById(created.value.id))!;
    expect(job.status).toBe("DONE");
    expect(s.discarded.map((r) => r.key)).not.toContain(job.outputAssetIds[0]); // le résultat final est gardé
    expect(s.discarded.length).toBeGreaterThanOrEqual(4);
    expect((await s.ledger.balanceOf("u1")).value).toBe(30 - lookCost(FULL));
  });

  it("n'exécute que les étapes choisies (un maquillage seul = une retouche + le fondu)", async () => {
    const s = await setup();
    const created = await s.create.execute({ userId: "u1", type: "LOOK", makeupId: "nude", inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    await s.run.execute(created.value.id);
    expect(s.tryOn.calls).toHaveLength(0);
    expect(s.editor.calls).toHaveLength(1);
    expect(s.blender.calls).toHaveLength(1);
    expect(s.lock.calls).toHaveLength(0);
    expect(created.value.creditCost.value).toBe(2);
  });

  it("une étape qui échoue : rien n'est livré ni débité, et les fichiers déjà produits sont supprimés", async () => {
    const s = await setup({ blendError: new Error("face_not_found") });
    const created = await s.create.execute({ userId: "u1", ...FULL });
    if (!created.ok) throw created.error;
    expect((await s.run.execute(created.value.id)).ok).toBe(false);
    expect((await s.jobs.findById(created.value.id))!.status).toBe("FAILED");
    expect((await s.ledger.balanceOf("u1")).value).toBe(30);
    expect(s.discarded.length).toBeGreaterThan(0);
  });

  it("refuse : aucune étape, élément inconnu, accessoire en double, plus d'une photo, tenue retirée, solde insuffisant", async () => {
    const s = await setup({ credits: 5 });
    const base = { userId: "u1", type: "LOOK" as const, inputAssetIds: ["photo"] };
    expect((await s.create.execute({ ...base })).ok).toBe(false);
    expect((await s.create.execute({ ...base, makeupId: "nope" })).ok).toBe(false);
    expect((await s.create.execute({ ...base, hairstyleId: "nope" })).ok).toBe(false);
    expect((await s.create.execute({ ...base, accessoryIds: ["nope"] })).ok).toBe(false);
    expect((await s.create.execute({ ...base, accessoryIds: ["sac-luxe", "sac-luxe"] })).ok).toBe(false);
    expect((await s.create.execute({ ...base, styleId: "cv-inconnu" })).ok).toBe(false);
    expect((await s.create.execute({ ...base, garmentId: "retiree" })).ok).toBe(false);
    expect((await s.create.execute({ ...base, makeupId: "nude", inputAssetIds: ["photo", "photo"] })).ok).toBe(false);
    expect((await s.create.execute({ ...base, makeupId: "nude", inputAssetIds: [], fromJobId: "x" })).ok).toBe(false);
    expect((await s.create.execute({ ...FULL, userId: "u1" })).ok).toBe(false); // 11 crédits demandés, 5 au compte
  });
});
