import { REPORT_HIDE_THRESHOLD } from "@styleme/shared";
import { describe, expect, it } from "vitest";
import { Job } from "../../../domain/entities/job";
import { User } from "../../../domain/entities/user";
import { CreditAmount } from "../../../domain/value-objects/credit-amount";
import { Email } from "../../../domain/value-objects/email";
import { FakeStorage, InMemoryJobRepository, InMemoryPostRepository, InMemoryUserRepository, SequentialIdGenerator } from "../../__fakes__";
import { GetPost, ListFeed, ListMyPosts, PublishPost, ReportPost, SetPostLike, UnpublishPost } from "./posts";

async function setup() {
  const users = new InMemoryUserRepository();
  for (const id of ["u1", "u2", "u3", "u4", "u5"]) {
    const u = User.create({ id, email: Email.of(`${id}@b.com`), passwordHash: "x" });
    u.confirmAge(new Date());
    await users.save(u);
  }
  const minor = User.create({ id: "young", email: Email.of("young@b.com"), passwordHash: "x" }); // âge non confirmé
  await users.save(minor);

  const jobs = new InMemoryJobRepository();
  const done = Job.create({ id: "j1", userId: "u1", type: "HAIRSTYLE", garmentId: "wax", hairstyleId: "cornrows", creditCost: CreditAmount.of(2), inputAssetIds: ["a"] });
  done.markProcessing();
  done.markDone(["u1/out.png"]);
  await jobs.save(done);
  const pending = Job.create({ id: "j2", userId: "u1", type: "TRYON", garmentId: "wax", creditCost: CreditAmount.of(3), inputAssetIds: ["a"] });
  await jobs.save(pending);

  const posts = new InMemoryPostRepository();
  const storage = new FakeStorage();
  return {
    jobs, posts, storage,
    publish: new PublishPost(users, jobs, posts, storage, new SequentialIdGenerator()),
    unpublish: new UnpublishPost(posts, storage),
    feed: new ListFeed(users, posts, storage),
    mine: new ListMyPosts(posts, storage),
    get: new GetPost(posts, storage),
    like: new SetPostLike(posts),
    report: new ReportPost(posts),
  };
}

const ok = <T>(r: { ok: boolean; value?: T; error?: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value as T;
};

describe("publier un look", () => {
  it("copie l'image dans le dossier de l'auteure et expose le look (tenue + coiffure) sans identité", async () => {
    const s = await setup();
    const v = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC", caption: "  Mariage de ma cousine  " }));
    expect(s.storage.copies).toEqual([{ from: { bucket: "results", key: "u1/out.png" }, to: { bucket: "results", key: "u1/post-id_1.png" } }]);
    expect(v).toMatchObject({ caption: "Mariage de ma cousine", mine: true, likeCount: 0, look: { garmentId: "wax", hairstyleId: "cornrows", hairstyleName: "Cornrows" } });
    expect(JSON.stringify(v)).not.toContain("u1@b.com");
  });

  it("republier le même job met à jour sans recopier ni dupliquer", async () => {
    const s = await setup();
    const a = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC" }));
    const b = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "UNLISTED", caption: "v2" }));
    expect(b.id).toBe(a.id);
    expect(b).toMatchObject({ visibility: "UNLISTED", caption: "v2" });
    expect(s.storage.copies).toHaveLength(1);
    expect(s.posts.items.size).toBe(1);
  });

  it("refuse un job inconnu, non terminé, d'une autre personne, une légende trop longue, ou un compte non majeur", async () => {
    const s = await setup();
    expect((await s.publish.execute({ userId: "u1", jobId: "nope", visibility: "PUBLIC" })).ok).toBe(false);
    expect((await s.publish.execute({ userId: "u1", jobId: "j2", visibility: "PUBLIC" })).ok).toBe(false);
    expect((await s.publish.execute({ userId: "u2", jobId: "j1", visibility: "PUBLIC" })).ok).toBe(false);
    expect((await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC", caption: "x".repeat(141) })).ok).toBe(false);
    expect((await s.publish.execute({ userId: "young", jobId: "j1", visibility: "PUBLIC" })).ok).toBe(false);
    expect(s.storage.copies).toHaveLength(0);
  });
});

describe("fil et visibilité", () => {
  it("le fil n'affiche que les looks PUBLIC ; un look non listé reste accessible par lien", async () => {
    const s = await setup();
    const pub = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC" }));
    expect(ok(await s.feed.execute({ userId: "u2" })).items.map((p) => p.id)).toEqual([pub.id]);
    await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "UNLISTED" });
    expect(ok(await s.feed.execute({ userId: "u2" })).items).toHaveLength(0);
    expect(ok(await s.get.execute({ userId: "u2", postId: pub.id })).id).toBe(pub.id); // par lien
    expect(ok(await s.mine.execute({ userId: "u1" })).items).toHaveLength(1);
    expect(ok(await s.mine.execute({ userId: "u2" })).items).toHaveLength(0);
  });

  it("un compte dont l'âge n'est pas confirmé ne peut pas voir le fil", async () => {
    const s = await setup();
    expect((await s.feed.execute({ userId: "young" })).ok).toBe(false);
  });
});

describe("likes", () => {
  it("un like par personne, idempotent, et réversible", async () => {
    const s = await setup();
    const p = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC" }));
    await s.like.execute({ userId: "u2", postId: p.id, liked: true });
    await s.like.execute({ userId: "u2", postId: p.id, liked: true });
    await s.like.execute({ userId: "u3", postId: p.id, liked: true });
    expect(ok(await s.get.execute({ userId: "u2", postId: p.id }))).toMatchObject({ likeCount: 2, likedByMe: true });
    expect(ok(await s.get.execute({ userId: "u4", postId: p.id }))).toMatchObject({ likeCount: 2, likedByMe: false });
    await s.like.execute({ userId: "u2", postId: p.id, liked: false });
    expect(ok(await s.get.execute({ userId: "u2", postId: p.id }))).toMatchObject({ likeCount: 1, likedByMe: false });
    expect((await s.like.execute({ userId: "u2", postId: "nope", liked: true })).ok).toBe(false);
  });
});

describe("signalement et retrait", () => {
  it(`masque le look du fil à ${REPORT_HIDE_THRESHOLD} signalements distincts (un seul compte ne suffit pas) ; son auteure le voit encore`, async () => {
    const s = await setup();
    const p = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC" }));
    await s.report.execute({ userId: "u2", postId: p.id, reason: "inapproprie" });
    await s.report.execute({ userId: "u2", postId: p.id, reason: "inapproprie" }); // doublon ignoré
    await s.report.execute({ userId: "u1", postId: p.id, reason: "autre" }); // auto-signalement ignoré
    await s.report.execute({ userId: "u3", postId: p.id, reason: "autre" });
    expect(ok(await s.feed.execute({ userId: "u4" })).items).toHaveLength(1); // 2 signalements : toujours visible
    await s.report.execute({ userId: "u4", postId: p.id, reason: "usurpation" });
    expect(ok(await s.feed.execute({ userId: "u5" })).items).toHaveLength(0);
    expect((await s.get.execute({ userId: "u5", postId: p.id })).ok).toBe(false);
    expect(ok(await s.get.execute({ userId: "u1", postId: p.id })).hidden).toBe(true);
  });

  it("seule l'auteure retire son look : la ligne et la copie de l'image disparaissent", async () => {
    const s = await setup();
    const p = ok(await s.publish.execute({ userId: "u1", jobId: "j1", visibility: "PUBLIC" }));
    expect((await s.unpublish.execute({ userId: "u2", postId: p.id })).ok).toBe(false);
    expect(s.posts.items.size).toBe(1);
    expect((await s.unpublish.execute({ userId: "u1", postId: p.id })).ok).toBe(true);
    expect(s.posts.items.size).toBe(0);
    expect(s.storage.deletes).toEqual([{ bucket: "results", key: "u1/post-id_1.png" }]);
  });
});
