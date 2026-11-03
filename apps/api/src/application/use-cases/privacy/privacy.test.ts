import { describe, expect, it } from "vitest";
import { RESULT_RETENTION_DAYS, SOURCE_RETENTION_DAYS } from "@styleme/shared";
import {
  FakePasswordHasher,
  FakeStorage,
  FixedClock,
  InMemoryAccountData,
  InMemoryAssetRepository,
  InMemoryJobRepository,
  InMemoryUserRepository,
} from "../../__fakes__";
import { Job } from "../../../domain/entities/job";
import { User } from "../../../domain/entities/user";
import { PasswordMismatch, UserNotFound } from "../../../domain/errors";
import { CreditAmount } from "../../../domain/value-objects/credit-amount";
import { Email } from "../../../domain/value-objects/email";
import { DeleteAccount } from "./delete-account";
import { PurgeExpiredData } from "./purge-expired-data";

const NOW = new Date("2026-06-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function purgeSetup() {
  const assets = new InMemoryAssetRepository();
  const jobs = new InMemoryJobRepository();
  const storage = new FakeStorage();
  const purge = new PurgeExpiredData(assets, jobs, storage, new FixedClock(NOW));
  return { assets, jobs, storage, purge };
}

const asset = (id: string, kind: "SOURCE" | "RESULT", ageDays: number) => ({
  id, userId: "u1", kind, bucket: kind === "SOURCE" ? "sources" : "results", key: `u1/${id}`, createdAt: daysAgo(ageDays),
});

const job = (id: string, status: "DONE" | "FAILED" | "PENDING", ageDays: number, outputs: string[] = []) =>
  Job.restore({
    id, userId: "u1", type: "ENHANCE", creditCost: CreditAmount.of(1), status,
    inputAssetIds: [], outputAssetIds: outputs, createdAt: daysAgo(ageDays),
  });

describe("PurgeExpiredData", () => {
  it("supprime les photos source plus vieilles que la rétention, garde les récentes", async () => {
    const s = purgeSetup();
    await s.assets.save(asset("old", "SOURCE", SOURCE_RETENTION_DAYS + 1));
    await s.assets.save(asset("fresh", "SOURCE", SOURCE_RETENTION_DAYS - 1));

    const report = await s.purge.execute();

    expect(report.sources).toBe(1);
    expect(s.storage.deletes.map((r) => r.key)).toEqual(["u1/old"]);
    expect(await s.assets.findByIds(["old"])).toEqual([]); // marquée supprimée : plus visible
    expect(await s.assets.findByIds(["fresh"])).toHaveLength(1);
  });

  it("supprime les résultats et l'historique après la rétention des résultats, pas avant", async () => {
    const s = purgeSetup();
    await s.jobs.save(job("old", "DONE", RESULT_RETENTION_DAYS + 1, ["u1/out-old.png"]));
    await s.jobs.save(job("recent", "DONE", SOURCE_RETENTION_DAYS + 5, ["u1/out-recent.png"]));
    await s.assets.save(asset("mask", "RESULT", RESULT_RETENTION_DAYS + 1));

    const report = await s.purge.execute();

    expect(report.jobs).toBe(1);
    expect(report.results).toBe(1);
    expect(s.jobs.items.has("old")).toBe(false);
    expect(s.jobs.items.has("recent")).toBe(true);
    expect(s.storage.deletes.map((r) => r.key).sort()).toEqual(["u1/mask", "u1/out-old.png"]);
  });

  it("ne touche jamais un job encore en cours", async () => {
    const s = purgeSetup();
    await s.jobs.save(job("running", "PENDING", RESULT_RETENTION_DAYS + 10));
    const report = await s.purge.execute();
    expect(report.jobs).toBe(0);
    expect(s.jobs.items.has("running")).toBe(true);
  });

  it("garde en file ce que le stockage n'a pas pu supprimer, et le retente au passage suivant", async () => {
    const s = purgeSetup();
    await s.assets.save(asset("a", "SOURCE", 10));
    await s.assets.save(asset("b", "SOURCE", 10));
    s.storage.failDeleteFor.add("u1/a");

    const first = await s.purge.execute();
    expect(first.sources).toBe(1);
    expect(first.failures).toBe(1);
    expect(await s.assets.findByIds(["a"])).toHaveLength(1); // toujours enregistrée : sera retentée

    s.storage.failDeleteFor.clear();
    const second = await s.purge.execute();
    expect(second.sources).toBe(1);
    expect(await s.assets.findByIds(["a"])).toEqual([]);
  });

  it("un job dont un fichier n'a pas pu être supprimé n'est pas effacé de la base", async () => {
    const s = purgeSetup();
    await s.jobs.save(job("j", "DONE", RESULT_RETENTION_DAYS + 1, ["u1/ok.png", "u1/ko.png"]));
    s.storage.failDeleteFor.add("u1/ko.png");

    const report = await s.purge.execute();

    expect(report.jobs).toBe(0);
    expect(s.jobs.items.has("j")).toBe(true); // on garde la trace pour retenter
  });
});

function deleteSetup() {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const storage = new FakeStorage();
  const data = new InMemoryAccountData();
  const useCase = new DeleteAccount(users, hasher, storage, data, new FixedClock(NOW));
  return { users, storage, data, useCase };
}

describe("DeleteAccount", () => {
  async function withUser() {
    const s = deleteSetup();
    await s.users.save(User.create({ id: "u1", email: Email.of("a@b.com"), passwordHash: "hashed:secret123" }));
    return s;
  }

  it("efface les fichiers de tous les buckets photo puis les données du compte", async () => {
    const s = await withUser();
    const r = await s.useCase.execute({ userId: "u1", password: "secret123" });
    expect(r.ok).toBe(true);
    expect(s.storage.deletedPrefixes).toEqual([
      { bucket: "sources", prefix: "u1/" },
      { bucket: "results", prefix: "u1/" },
      { bucket: "selfies-training", prefix: "u1/" },
    ]);
    expect(s.data.erased).toEqual(["u1"]);
  });

  it("refuse un mauvais mot de passe sans rien supprimer", async () => {
    const s = await withUser();
    const r = await s.useCase.execute({ userId: "u1", password: "wrong" });
    expect(!r.ok && r.error).toBeInstanceOf(PasswordMismatch);
    expect(s.storage.deletedPrefixes).toEqual([]);
    expect(s.data.erased).toEqual([]);
  });

  it("refuse un compte inconnu", async () => {
    const s = deleteSetup();
    const r = await s.useCase.execute({ userId: "ghost", password: "x" });
    expect(!r.ok && r.error).toBeInstanceOf(UserNotFound);
  });

  it("n'anonymise pas la base si la suppression des fichiers échoue (l'utilisateur peut réessayer)", async () => {
    const s = await withUser();
    s.storage.deletePrefix = async () => {
      throw new Error("storage down");
    };
    await expect(s.useCase.execute({ userId: "u1", password: "secret123" })).rejects.toThrow("storage down");
    expect(s.data.erased).toEqual([]);
  });
});
