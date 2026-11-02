import { CLEANUP_STYLES, OCCASION_PROMPTS } from "@styleme/shared";
import { describe, expect, it } from "vitest";
import {
  FakeBackground,
  FakeEditor,
  FakeEnhancer,
  FakeEraser,
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
import { Email } from "../../../domain/value-objects/email";
import { CreateJob } from "./create-job";
import { RunEnhancementJob } from "./run-enhancement-job";

describe("Nettoyage & Studio (photo de profil)", () => {
  it("chaque fond propose une consigne qui conserve le visage ET les vêtements et nettoie le flou", () => {
    expect(CLEANUP_STYLES.map((c) => c.id)).toEqual(["studio-blanc", "studio-gris", "studio-bleu", "studio-beige"]);
    for (const c of CLEANUP_STYLES) {
      const prompt = OCCASION_PROMPTS[c.id]!;
      expect(prompt).toContain(c.backdrop);
      expect(prompt).toMatch(/Fix blur and noise/);
      expect(prompt).toMatch(/same face/);
      expect(prompt).toMatch(/do not change, restyle or recolor any clothing/);
      expect(prompt).toMatch(/Do not beautify/);
    }
  });

  it("à la différence des occasions, la consigne ne remplace pas la scène par un décor d'événement", () => {
    for (const c of CLEANUP_STYLES) expect(OCCASION_PROMPTS[c.id]).toMatch(/plain .* studio backdrop/);
    expect(OCCASION_PROMPTS.mariage).not.toMatch(/studio backdrop/);
  });

  it("un job avec un fond « Nettoyage » envoie sa consigne à l'éditeur ; 1 crédit débité", async () => {
    const users = new InMemoryUserRepository();
    const jobs = new InMemoryJobRepository();
    const ledger = new InMemoryCreditLedger();
    const assets = new InMemoryAssetRepository();
    const editor = new FakeEditor();
    const user = User.create({ id: "u1", email: Email.of("u1@test.com"), passwordHash: "x" });
    user.confirmAge(new Date());
    await users.save(user);
    await ledger.append({ userId: "u1", amount: 3, reason: "seed" });
    await assets.save({ id: "photo", userId: "u1", kind: "SOURCE", bucket: "sources", key: "u1/photo" });

    const create = new CreateJob(users, jobs, ledger, assets, new FakeJobQueue(), new SequentialIdGenerator());
    const run = new RunEnhancementJob(jobs, ledger, assets, new FakeModeration(), new FakeEnhancer(), new FakeBackground(), editor, new FakeEraser(), new InMemoryUnitOfWork());

    const created = await create.execute({ userId: "u1", type: "ENHANCE", styleId: "studio-blanc", inputAssetIds: ["photo"] });
    if (!created.ok) throw created.error;
    expect((await run.execute(created.value.id)).ok).toBe(true);

    expect(editor.calls).toHaveLength(1);
    expect(editor.calls[0]!.instruction).toBe(OCCASION_PROMPTS["studio-blanc"]);
    expect(jobs.items.get(created.value.id)?.status).toBe("DONE");
    expect((await ledger.balanceOf("u1")).value).toBe(2);
  });
});
