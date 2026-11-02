import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunEnhancementJob } from "../../application";
import { AppModule, configureApp } from "./app.module";
import { createInMemoryPorts } from "./in-memory-ports.module";

let app: INestApplication;
let fakes: ReturnType<typeof createInMemoryPorts>["fakes"];
const P = "/api/v1";

beforeEach(async () => {
  const ports = createInMemoryPorts();
  fakes = ports.fakes;
  const mod = await Test.createTestingModule({ imports: [AppModule.register(ports.module)] }).compile();
  app = mod.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
});
afterEach(() => app.close());

async function login(email = "jean@example.com") {
  const res = await request(app.getHttpServer()).post(`${P}/auth/register`).send({ email, password: "motdepasse1" }).expect(201);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe("auth", () => {
  it("inscription puis connexion ; mauvais mot de passe → 401 ; email déjà pris → 409 ; mot de passe faible → 400", async () => {
    const http = () => request(app.getHttpServer());
    const signup = await http().post(`${P}/auth/register`).send({ email: "A@b.co", password: "motdepasse1" }).expect(201);
    expect(signup.body.user).toMatchObject({ email: "a@b.co", ageConfirmed: false });
    expect(JSON.stringify(signup.body)).not.toContain("passwordHash");
    await http().post(`${P}/auth/register`).send({ email: "a@b.co", password: "motdepasse1" }).expect(409);
    await http().post(`${P}/auth/register`).send({ email: "c@d.co", password: "court" }).expect(400);
    const ok = await http().post(`${P}/auth/login`).send({ email: "a@b.co", password: "motdepasse1" }).expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    await http().post(`${P}/auth/login`).send({ email: "a@b.co", password: "mauvais-mdp" }).expect(401);
    await http().post(`${P}/auth/login`).send({ email: "inconnu@b.co", password: "motdepasse1" }).expect(401);
    await http().post(`${P}/auth/login`).send({}).expect(400);
  });
  it("exige un JWT sur les routes protégées", async () => {
    await request(app.getHttpServer()).get(`${P}/credits/balance`).expect(401);
    await request(app.getHttpServer()).get(`${P}/credits/balance`).set(auth("garbage")).expect(401);
  });
});

describe("parcours complet : upload → job → résultat", () => {
  it("crédite, crée un job, le traite et renvoie l'URL signée du résultat", async () => {
    const { token, userId } = await login();
    const h = auth(token);

    // Pas d'âge confirmé → 403
    const presign = await request(app.getHttpServer()).post(`${P}/assets/presign`).set(h).send({ kind: "SOURCE" }).expect(201);
    expect(presign.body.uploadUrl).toContain("/upload/sources/");
    await request(app.getHttpServer()).post(`${P}/jobs`).set(h).send({ type: "ENHANCE", inputAssetIds: [presign.body.assetId] }).expect(403);

    await request(app.getHttpServer()).post(`${P}/auth/confirm-age`).set(h).send({ confirmed: true }).expect(204);

    // Pas de crédits → 402
    await request(app.getHttpServer()).post(`${P}/jobs`).set(h).send({ type: "ENHANCE", inputAssetIds: [presign.body.assetId] }).expect(402);

    // Achat de crédits via webhook signé
    const pay = await request(app.getHttpServer()).post(`${P}/payments/initiate`).set(h).send({ packId: "pack_5", phone: "+243812345678", operator: "mpesa" }).expect(201);
    const providerRef = `ref_${pay.body.paymentId}`;
    const body = JSON.stringify({ providerRef, success: true });
    await request(app.getHttpServer()).post(`${P}/payments/webhook`).set("x-signature", "valid-sig").set("content-type", "application/json").send(body).expect(200);
    await request(app.getHttpServer()).post(`${P}/payments/webhook`).set("x-signature", "valid-sig").set("content-type", "application/json").send(body).expect(200); // rejoué
    const bal = await request(app.getHttpServer()).get(`${P}/credits/balance`).set(h).expect(200);
    expect(bal.body.balance).toBe(5); // crédité une seule fois
    await request(app.getHttpServer()).get(`${P}/payments/${pay.body.paymentId}`).set(h).expect(200).expect((r) => expect(r.body.status).toBe("SUCCEEDED"));

    // Job
    const created = await request(app.getHttpServer()).post(`${P}/jobs`).set(h).send({ type: "ENHANCE", inputAssetIds: [presign.body.assetId] }).expect(201);
    expect(created.body.status).toBe("PENDING");
    expect(fakes.queue.enqueued).toEqual([created.body.jobId]);

    // Le worker traite le job
    const run = new RunEnhancementJob(fakes.jobs, fakes.ledger, fakes.assets, fakes.moderation, fakes.enhancer, fakes.background, fakes.uow);
    expect((await run.execute(created.body.jobId)).ok).toBe(true);

    const got = await request(app.getHttpServer()).get(`${P}/jobs/${created.body.jobId}`).set(h).expect(200);
    expect(got.body.status).toBe("DONE");
    expect(got.body.outputs[0].url).toContain("/dl/results/");
    const after = await request(app.getHttpServer()).get(`${P}/credits/balance`).set(h);
    expect(after.body.balance).toBe(4);

    const list = await request(app.getHttpServer()).get(`${P}/jobs?limit=10`).set(h).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.nextCursor).toBeNull();
    void userId;
  });

  it("un autre utilisateur reçoit 404 sur le job d'autrui", async () => {
    const { token } = await login();
    const h = auth(token);
    await request(app.getHttpServer()).post(`${P}/auth/confirm-age`).set(h).send({ confirmed: true }).expect(204);
    await fakes.ledger.append({ userId: "id_1", amount: 5, reason: "seed" });
    const a = await request(app.getHttpServer()).post(`${P}/assets/presign`).set(h).send({ kind: "SOURCE" });
    const job = await request(app.getHttpServer()).post(`${P}/jobs`).set(h).send({ type: "ENHANCE", inputAssetIds: [a.body.assetId] }).expect(201);
    await request(app.getHttpServer()).get(`${P}/jobs/${job.body.jobId}`).set(auth("token_someone-else")).expect(404);
  });
});

describe("webhook", () => {
  it("signature invalide → 401, corps absent → 400", async () => {
    await request(app.getHttpServer()).post(`${P}/payments/webhook`).set("x-signature", "bad").set("content-type", "application/json").send("{}").expect(401);
    await request(app.getHttpServer()).post(`${P}/payments/webhook`).expect(400);
  });
});

describe("Idempotency-Key", () => {
  it("rejoue la même réponse sans créer un second job", async () => {
    const { token, userId } = await login();
    const h = auth(token);
    await request(app.getHttpServer()).post(`${P}/auth/confirm-age`).set(h).send({ confirmed: true }).expect(204);
    await fakes.ledger.append({ userId, amount: 5, reason: "seed" });
    const a = await request(app.getHttpServer()).post(`${P}/assets/presign`).set(h).send({ kind: "SOURCE" });
    const send = () => request(app.getHttpServer()).post(`${P}/jobs`).set(h).set("idempotency-key", "k1").send({ type: "ENHANCE", inputAssetIds: [a.body.assetId] });
    const r1 = await send();
    const r2 = await send();
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.jobId).toBe(r1.body.jobId);
    expect(fakes.jobs.items.size).toBe(1);
  });
});

describe("credits / styles", () => {
  it("liste les packs et les styles", async () => {
    const { token } = await login();
    const packs = await request(app.getHttpServer()).get(`${P}/credits/packs`).set(auth(token)).expect(200);
    expect(packs.body.length).toBeGreaterThan(0);
    const styles = await request(app.getHttpServer()).get(`${P}/styles`).set(auth(token)).expect(200);
    expect(styles.body[0].id).toBe("wedding");
  });
});

