import { describe, expect, it } from "vitest";
import {
  FakeBackground,
  FakeEditor,
  FakeEnhancer,
  FakeEraser,
  FakeJobQueue,
  FakeModeration,
  FakeObjectSelector,
  FakeStorage,
  InMemoryAssetRepository,
  InMemoryCreditLedger,
  InMemoryJobRepository,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from "../../__fakes__";
import { User } from "../../../domain/entities/user";
import {
  AgeNotConfirmed,
  AssetNotFound,
  InsufficientCredits,
  NoObjectFound,
  ProviderRejectedContent,
  SelectionExpired,
} from "../../../domain/errors";
import { Email } from "../../../domain/value-objects/email";
import { CommitSelection } from "./commit-selection";
import { CreateJob } from "./create-job";
import { GetJobResultAsset } from "./get-job-result-asset";
import { PrepareObject } from "./prepare-object";
import { RunEnhancementJob } from "./run-enhancement-job";
import { SegmentObject } from "./segment-object";

async function setup(opts: { credits?: number; ageConfirmed?: boolean; selectorError?: Error; eraserError?: Error } = {}) {
  const users = new InMemoryUserRepository();
  const jobs = new InMemoryJobRepository();
  const ledger = new InMemoryCreditLedger();
  const assets = new InMemoryAssetRepository();
  const storage = new FakeStorage();
  const ids = new SequentialIdGenerator();
  const moderation = new FakeModeration();
  const selector = new FakeObjectSelector(opts.selectorError);
  const eraser = new FakeEraser(opts.eraserError);
  const uow = new InMemoryUnitOfWork();

  const user = User.create({ id: "u1", email: Email.of("u1@test.com"), passwordHash: "x" });
  if (opts.ageConfirmed ?? true) user.confirmAge(new Date());
  await users.save(user);
  const credits = opts.credits ?? 5;
  if (credits > 0) await ledger.append({ userId: "u1", amount: credits, reason: "seed" });
  await assets.save({ id: "photo", userId: "u1", kind: "SOURCE", bucket: "sources", key: "u1/photo" });
  await assets.save({ id: "other", userId: "u2", kind: "SOURCE", bucket: "sources", key: "u2/other" });
  await assets.save({ id: "selfie", userId: "u1", kind: "SELFIE_TRAINING", bucket: "selfies-training", key: "u1/selfie" });

  return {
    jobs, ledger, assets, selector, eraser, moderation,
    segment: new SegmentObject(users, assets, selector),
    commit: new CommitSelection(users, assets, selector, ids),
    prepare: new PrepareObject(users, assets, selector),
    create: new CreateJob(users, jobs, ledger, assets, new FakeJobQueue(), ids),
    run: new RunEnhancementJob(jobs, ledger, assets, moderation, new FakeEnhancer(), new FakeBackground(), new FakeEditor(), eraser, uow),
    resultAsset: new GetJobResultAsset(jobs, assets, storage, ids),
  };
}

type S = Awaited<ReturnType<typeof setup>>;

/** Parcours complet de la gomme côté utilisateur : toucher l'objet (aperçu), puis confirmer. */
async function selectAndConfirm(s: S, assetId = "photo", x = 0.4, y = 0.6) {
  const seg = await s.segment.execute({ userId: "u1", assetId, x, y });
  if (!seg.ok) throw seg.error;
  const com = await s.commit.execute({ userId: "u1", assetId, selectionId: seg.value.selectionId });
  if (!com.ok) throw com.error;
  return { ...com.value, overlayUrl: seg.value.overlayUrl };
}

describe("SegmentObject (aperçu instantané : toucher ou survoler l'objet)", () => {
  it("transmet le clic et renvoie l'aperçu inline, SANS rien enregistrer (appelable à chaque mouvement de souris)", async () => {
    const s = await setup();
    const r = await s.segment.execute({ userId: "u1", assetId: "photo", x: 0.4, y: 0.6 });
    expect(r.ok && r.value.overlayUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(s.selector.calls).toEqual([{ src: { bucket: "sources", key: "u1/photo" }, x: 0.4, y: 0.6 }]);
    expect([...s.assets.items.values()].filter((a) => a.kind === "RESULT")).toHaveLength(0);
  });

  it("un rectangle tracé à la main est transmis au service, sans rien enregistrer", async () => {
    const s = await setup();
    const box = { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.6 };
    const r = await s.segment.execute({ userId: "u1", assetId: "photo", box });
    expect(r.ok).toBe(true);
    expect(s.selector.calls).toEqual([{ src: { bucket: "sources", key: "u1/photo" }, box }]);
    expect([...s.assets.items.values()].filter((a) => a.kind === "RESULT")).toHaveLength(0);
  });

  it("ni clic ni rectangle → refusé sans appeler le service", async () => {
    const s = await setup();
    const r = await s.segment.execute({ userId: "u1", assetId: "photo" });
    expect(!r.ok && r.error).toBeInstanceOf(NoObjectFound);
    expect(s.selector.calls).toHaveLength(0);
  });

  it("aucun objet sous le clic → NoObjectFound (cas attendu)", async () => {
    const s = await setup({ selectorError: new NoObjectFound("rien ici") });
    const r = await s.segment.execute({ userId: "u1", assetId: "photo", x: 0.1, y: 0.1 });
    expect(!r.ok && r.error).toBeInstanceOf(NoObjectFound);
  });

  it("refuse l'asset d'autrui, inconnu, une photo d'entraînement, ou un compte sans âge confirmé", async () => {
    const s = await setup();
    for (const assetId of ["other", "nope", "selfie"]) {
      const r = await s.segment.execute({ userId: "u1", assetId, x: 0.5, y: 0.5 });
      expect(!r.ok && r.error).toBeInstanceOf(AssetNotFound);
    }
    const minor = await setup({ ageConfirmed: false });
    const r = await minor.segment.execute({ userId: "u1", assetId: "photo", x: 0.5, y: 0.5 });
    expect(!r.ok && r.error).toBeInstanceOf(AgeNotConfirmed);
    expect(s.selector.calls).toHaveLength(0);
  });
});

describe("CommitSelection (confirmer la sélection)", () => {
  it("enregistre la photo normalisée et le masque comme assets", async () => {
    const s = await setup();
    const out = await selectAndConfirm(s);
    const [image, mask] = await s.assets.findByIds([out.imageAssetId, out.maskAssetId]);
    expect(image).toMatchObject({ userId: "u1", kind: "RESULT", bucket: "results" });
    expect(mask?.key).toMatch(/\.mask\.png$/);
  });

  it("plusieurs confirmations sur la même photo : la photo normalisée n'est enregistrée qu'une fois", async () => {
    const s = await setup();
    const a = await selectAndConfirm(s, "photo", 0.2, 0.2);
    const b = await selectAndConfirm(s, "photo", 0.8, 0.8);
    expect(a.imageAssetId).toBe(b.imageAssetId);
    expect(a.maskAssetId).not.toBe(b.maskAssetId);
    expect([...s.assets.items.values()].filter((x) => x.key.endsWith(".base.jpg"))).toHaveLength(1);
  });

  it("sélection expirée → SelectionExpired ; photo d'autrui → AssetNotFound ; rien n'est enregistré", async () => {
    const s = await setup();
    const expired = await s.commit.execute({ userId: "u1", assetId: "photo", selectionId: "inconnue" });
    expect(!expired.ok && expired.error).toBeInstanceOf(SelectionExpired);
    const foreign = await s.commit.execute({ userId: "u1", assetId: "other", selectionId: "sel1" });
    expect(!foreign.ok && foreign.error).toBeInstanceOf(AssetNotFound);
    expect([...s.assets.items.values()].filter((a) => a.kind === "RESULT")).toHaveLength(0);
  });
});

describe("job ERASE (gomme, étape 3 : effacer)", () => {
  it("exige exactement [photo, masque] et des assets à soi", async () => {
    const s = await setup();
    const sel = await selectAndConfirm(s);
    const bad = [[], [sel.imageAssetId], [sel.imageAssetId, sel.maskAssetId, "photo"], [sel.imageAssetId, "other"]];
    for (const inputAssetIds of bad) {
      const r = await s.create.execute({ userId: "u1", type: "ERASE", inputAssetIds });
      expect(!r.ok && r.error).toBeInstanceOf(AssetNotFound);
    }
    const fromJob = await s.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [sel.imageAssetId, sel.maskAssetId], fromJobId: "x" });
    expect(fromJob.ok).toBe(false);
  });

  it("efface l'objet : l'éditeur reçoit la photo ET le masque, modération entrée/sortie, 1 crédit débité une fois", async () => {
    const s = await setup();
    const sel = await selectAndConfirm(s);
    const created = await s.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [sel.imageAssetId, sel.maskAssetId] });
    if (!created.ok) throw created.error;
    expect((await s.run.execute(created.value.id)).ok).toBe(true);

    expect(s.eraser.calls).toHaveLength(1);
    expect(s.eraser.calls[0]!.image.key).toMatch(/\.base\.jpg$/);
    expect(s.eraser.calls[0]!.mask.key).toMatch(/\.mask\.png$/);
    expect(s.moderation.calls).toEqual(["input", "output"]);
    expect(s.jobs.items.get(created.value.id)?.status).toBe("DONE");
    expect((await s.ledger.balanceOf("u1")).value).toBe(4);
  });

  it("le job part du masque de la sélection CONFIRMÉE (pas d'un survol précédent)", async () => {
    const s = await setup();
    await s.segment.execute({ userId: "u1", assetId: "photo", x: 0.2, y: 0.2 }); // survol non confirmé
    const sel = await selectAndConfirm(s, "photo", 0.8, 0.8);
    const created = await s.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [sel.imageAssetId, sel.maskAssetId] });
    if (!created.ok) throw created.error;
    await s.run.execute(created.value.id);
    expect(s.eraser.calls[0]!.mask.key).toMatch(/sel2\.mask\.png$/);
  });

  it("solde insuffisant → refusé ; panne du fournisseur → FAILED sans débit ; filtre de sécurité → REJECTED sans réessai", async () => {
    const poor = await setup({ credits: 0 });
    const selP = await selectAndConfirm(poor);
    const r = await poor.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [selP.imageAssetId, selP.maskAssetId] });
    expect(!r.ok && r.error).toBeInstanceOf(InsufficientCredits);

    const down = await setup({ eraserError: new Error("replicate down") });
    const selD = await selectAndConfirm(down);
    const jd = await down.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [selD.imageAssetId, selD.maskAssetId] });
    if (!jd.ok) throw jd.error;
    await down.run.execute(jd.value.id);
    expect(down.jobs.items.get(jd.value.id)?.status).toBe("FAILED");
    expect((await down.ledger.balanceOf("u1")).value).toBe(5);

    const flagged = await setup({ eraserError: new ProviderRejectedContent("E005") });
    const selF = await selectAndConfirm(flagged);
    const jf = await flagged.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [selF.imageAssetId, selF.maskAssetId] });
    if (!jf.ok) throw jf.error;
    await flagged.run.execute(jf.value.id, { isLastAttempt: false });
    expect(flagged.jobs.items.get(jf.value.id)?.status).toBe("REJECTED");
  });

  it("enchaîner : le résultat d'une gomme devient une photo sur laquelle on peut gommer un autre objet", async () => {
    const s = await setup();
    const sel = await selectAndConfirm(s);
    const created = await s.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [sel.imageAssetId, sel.maskAssetId] });
    if (!created.ok) throw created.error;
    await s.run.execute(created.value.id);

    const a = await s.resultAsset.execute({ userId: "u1", jobId: created.value.id });
    const again = await s.resultAsset.execute({ userId: "u1", jobId: created.value.id });
    if (!a.ok || !again.ok) throw new Error("setup");
    expect(again.value.assetId).toBe(a.value.assetId); // idempotent
    expect(a.value.url).toContain("/dl/results/");

    const next = await s.segment.execute({ userId: "u1", assetId: a.value.assetId, x: 0.2, y: 0.2 });
    expect(next.ok).toBe(true);
    expect(s.selector.calls.at(-1)!.src.key).toMatch(/\.erased$/); // le clic suivant porte sur l'image déjà gommée
  });

  it("le résultat d'un job d'autrui ou non terminé n'est pas accessible", async () => {
    const s = await setup();
    const sel = await selectAndConfirm(s);
    const created = await s.create.execute({ userId: "u1", type: "ERASE", inputAssetIds: [sel.imageAssetId, sel.maskAssetId] });
    if (!created.ok) throw created.error;
    expect((await s.resultAsset.execute({ userId: "u1", jobId: created.value.id })).ok).toBe(false); // pas encore DONE
    await s.run.execute(created.value.id);
    expect((await s.resultAsset.execute({ userId: "u2", jobId: created.value.id })).ok).toBe(false);
  });
});

describe("PrepareObject (préchauffage)", () => {
  it("lance l'analyse de la photo de l'utilisateur", async () => {
    const s = await setup();
    expect((await s.prepare.execute({ userId: "u1", assetId: "photo" })).ok).toBe(true);
    expect(s.selector.prepared).toEqual([{ bucket: "sources", key: "u1/photo" }]);
  });

  it("refuse la photo d'autrui, inconnue ou d'entraînement, et un compte sans âge confirmé", async () => {
    const s = await setup();
    for (const assetId of ["other", "nope", "selfie"]) {
      const r = await s.prepare.execute({ userId: "u1", assetId });
      expect(!r.ok && r.error).toBeInstanceOf(AssetNotFound);
    }
    const minor = await setup({ ageConfirmed: false });
    expect((await minor.prepare.execute({ userId: "u1", assetId: "photo" })).ok).toBe(false);
    expect(s.selector.prepared).toHaveLength(0);
  });

  it("une panne du service d'analyse n'est pas bloquante (au mieux)", async () => {
    const s = await setup({ selectorError: new Error("service IA arrêté") });
    expect((await s.prepare.execute({ userId: "u1", assetId: "photo" })).ok).toBe(true);
  });
});
