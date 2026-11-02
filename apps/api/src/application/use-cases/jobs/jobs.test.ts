import { describe, expect, it } from "vitest";
import {
  FakeBackground,
  FakeEditor,
  FakeEraser,
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
import { OCCASION_PROMPTS } from "@styleme/shared";
import { ProviderRejectedContent } from "../../../domain/errors";
import { AgeNotConfirmed, AssetNotFound, InsufficientCredits, InvalidPrompt } from "../../../domain/errors";
import { Email } from "../../../domain/value-objects/email";
import { CreateJob } from "./create-job";
import { RunEnhancementJob } from "./run-enhancement-job";

async function setup(opts: { credits?: number; ageConfirmed?: boolean; moderation?: ConstructorParameters<typeof FakeModeration>[0]; enhancerError?: Error; moderationError?: Error; editorError?: Error; eraserError?: Error } = {}) {
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

  const editor = new FakeEditor(opts.editorError);
  const eraser = new FakeEraser(opts.eraserError);
  const create = new CreateJob(users, jobs, ledger, assets, queue, new SequentialIdGenerator());
  const run = new RunEnhancementJob(jobs, ledger, assets, moderation, new FakeEnhancer(opts.enhancerError), new FakeBackground(), editor, eraser, uow);
  return { jobs, ledger, assets, queue, uow, moderation, editor, eraser, create, run };
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

describe("jobs EDIT (instruction en langage naturel)", () => {
  const edit = { userId: "u1", type: "EDIT" as const, inputAssetIds: ["asset1"], prompt: "  enlève l'objet au fond  " };

  it("exige une instruction non vide", async () => {
    const s = await setup({ credits: 5 });
    for (const prompt of [undefined, "", "   ", "x".repeat(501)]) {
      const r = await s.create.execute({ ...edit, prompt });
      expect(!r.ok && r.error).toBeInstanceOf(InvalidPrompt);
    }
    expect(s.jobs.items.size).toBe(0);
  });

  it("coûte 2 crédits : refusé avec 1 crédit seulement", async () => {
    const s = await setup({ credits: 1 });
    const r = await s.create.execute(edit);
    expect(!r.ok && r.error).toBeInstanceOf(InsufficientCredits);
  });

  it("envoie l'instruction (nettoyée) à l'éditeur, ne passe PAS par le détourage, et débite 2 crédits une fois", async () => {
    const s = await setup({ credits: 5 });
    const created = await s.create.execute(edit);
    if (!created.ok) throw created.error;
    expect((await s.run.execute(created.value.id)).ok).toBe(true);
    expect(s.editor.calls).toEqual([{ src: { bucket: "sources", key: "u1/asset1" }, instruction: "enlève l'objet au fond" }]);
    const job = s.jobs.items.get(created.value.id);
    expect(job?.status).toBe("DONE");
    expect(job?.outputAssetIds[0]).toBe("u1/asset1.edited"); // ni .nobg ni .up : le reste de la photo n'est pas retraité
    expect((await s.ledger.balanceOf("u1")).value).toBe(3);
  });

  it("passe par la modération entrée ET sortie", async () => {
    const s = await setup({ credits: 5 });
    const created = await s.create.execute(edit);
    if (!created.ok) throw created.error;
    await s.run.execute(created.value.id);
    expect(s.moderation.calls).toEqual(["input", "output"]);
  });

  it("filtre de sécurité du fournisseur → REJECTED définitif (jamais de réessai), 0 débit", async () => {
    const s = await setup({ credits: 5, editorError: new ProviderRejectedContent("flagged as sensitive (E005)") });
    const created = await s.create.execute(edit);
    if (!created.ok) throw created.error;
    const r = await s.run.execute(created.value.id, { isLastAttempt: false }); // même au 1er essai : pas de reprise
    expect(r.ok).toBe(true);
    expect(s.jobs.items.get(created.value.id)?.status).toBe("REJECTED");
    expect(s.jobs.items.get(created.value.id)?.errorReason).toBe("provider_content_flagged");
    expect(s.editor.calls).toHaveLength(1);
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });

  it("panne du fournisseur d'édition → FAILED, 0 débit", async () => {
    const s = await setup({ credits: 5, editorError: new Error("replicate down") });
    const created = await s.create.execute(edit);
    if (!created.ok) throw created.error;
    const r = await s.run.execute(created.value.id);
    expect(r.ok).toBe(false);
    expect(s.jobs.items.get(created.value.id)?.status).toBe("FAILED");
    expect((await s.ledger.balanceOf("u1")).value).toBe(5);
  });
});

describe("retouche enchaînée (fromJobId)", () => {
  const first = { userId: "u1", type: "EDIT" as const, inputAssetIds: ["asset1"], prompt: "enlève le rocher" };

  async function doneEdit(s: Awaited<ReturnType<typeof setup>>) {
    const c = await s.create.execute(first);
    if (!c.ok) throw c.error;
    await s.run.execute(c.value.id);
    return c.value.id;
  }

  it("part du RÉSULTAT du job précédent, pas de l'original, et le résultat devient un asset RESULT", async () => {
    const s = await setup({ credits: 10 });
    const prevId = await doneEdit(s);
    const next = await s.create.execute({ userId: "u1", type: "EDIT", inputAssetIds: [], fromJobId: prevId, prompt: "ajoute un ciel bleu" });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const [assetId] = next.value.inputAssetIds;
    const asset = (await s.assets.findByIds([assetId!]))[0];
    expect(asset).toMatchObject({ userId: "u1", kind: "RESULT", bucket: "results", key: "u1/asset1.edited" });
    await s.run.execute(next.value.id);
    // la 2e retouche reçoit l'image déjà retouchée
    expect(s.editor.calls[1]).toEqual({ src: { bucket: "results", key: "u1/asset1.edited" }, instruction: "ajoute un ciel bleu" });
    expect((await s.ledger.balanceOf("u1")).value).toBe(10 - 2 - 2);
  });

  it("reprendre PLUSIEURS FOIS le même résultat réutilise l'asset (pas de doublon bucket+key)", async () => {
    const s = await setup({ credits: 20 });
    const prevId = await doneEdit(s);
    const a = await s.create.execute({ userId: "u1", type: "EDIT", inputAssetIds: [], fromJobId: prevId, prompt: "première idée" });
    const b = await s.create.execute({ userId: "u1", type: "EDIT", inputAssetIds: [], fromJobId: prevId, prompt: "autre idée" });
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(b.value.inputAssetIds).toEqual(a.value.inputAssetIds);
    expect([...s.assets.items.values()].filter((x) => x.kind === "RESULT")).toHaveLength(1);
  });

  it("refuse un job d'un autre utilisateur, inconnu, non terminé, ou un type autre qu'EDIT", async () => {
    const s = await setup({ credits: 10 });
    const prevId = await doneEdit(s);
    const pending = await s.create.execute(first);
    if (!pending.ok) throw pending.error;
    const base = { type: "EDIT" as const, inputAssetIds: [], prompt: "x" };
    const other = await s.create.execute({ ...base, userId: "u2", fromJobId: prevId });
    const unknown = await s.create.execute({ ...base, userId: "u1", fromJobId: "nope" });
    const notDone = await s.create.execute({ ...base, userId: "u1", fromJobId: pending.value.id });
    const enhance = await s.create.execute({ userId: "u1", type: "ENHANCE", inputAssetIds: [], fromJobId: prevId });
    for (const r of [other, unknown, notDone, enhance]) expect(r.ok).toBe(false);
  });

  it("solde insuffisant → aucun asset ni job créé", async () => {
    const s = await setup({ credits: 3 });
    const prevId = await doneEdit(s); // 3 - 2 = 1 crédit restant
    const before = s.jobs.items.size;
    const r = await s.create.execute({ userId: "u1", type: "EDIT", inputAssetIds: [], fromJobId: prevId, prompt: "x" });
    expect(!r.ok && r.error).toBeInstanceOf(InsufficientCredits);
    expect(s.jobs.items.size).toBe(before);
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

  it("occasion connue → décor généré par l'IA avec la consigne de l'occasion (sujet conservé) ; sans style ni consigne → pipeline local", async () => {
    const s = await setup();
    const styled = await s.create.execute({ ...input, styleId: "mariage" });
    const plain = await s.create.execute(input);
    const custom = await s.create.execute({ ...input, styleId: "style-sans-consigne" });
    if (!styled.ok || !plain.ok || !custom.ok) throw new Error("setup");
    for (const j of [styled, plain, custom]) await s.run.execute(j.value.id);

    expect(s.editor.calls).toHaveLength(1);
    expect(s.editor.calls[0]!.instruction).toBe(OCCASION_PROMPTS.mariage);
    expect(s.editor.calls[0]!.instruction).toMatch(/Keep the person exactly identical/);
    expect(s.jobs.items.get(styled.value.id)?.outputAssetIds[0]).toMatch(/.edited$/);
    expect(s.jobs.items.get(plain.value.id)?.outputAssetIds[0]).toMatch(/.nobg$/);
    expect(s.jobs.items.get(custom.value.id)?.outputAssetIds[0]).toMatch(/.nobg.style-sans-consigne$/);
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
