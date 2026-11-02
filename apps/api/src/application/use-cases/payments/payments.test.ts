import { describe, expect, it } from "vitest";
import {
  FakePaymentGateway,
  InMemoryCreditLedger,
  InMemoryPaymentRepository,
  InMemoryUnitOfWork,
  SequentialIdGenerator,
} from "../../__fakes__";
import { InvalidPaymentSignature, PackNotFound, PaymentNotFound } from "../../../domain/errors";
import { HandlePaymentWebhook } from "./handle-payment-webhook";
import { InitiatePayment } from "./initiate-payment";

function setup() {
  const payments = new InMemoryPaymentRepository();
  const ledger = new InMemoryCreditLedger();
  const gateway = new FakePaymentGateway();
  const initiate = new InitiatePayment(payments, gateway, new SequentialIdGenerator());
  const webhook = new HandlePaymentWebhook(payments, ledger, gateway, new InMemoryUnitOfWork());
  return { payments, ledger, gateway, initiate, webhook };
}

const req = { userId: "u1", packId: "pack_20", phone: "+243812345678", operator: "mpesa" as const };

describe("InitiatePayment", () => {
  it("crée un paiement PENDING via la gateway", async () => {
    const s = setup();
    const r = await s.initiate.execute(req);
    expect(r.ok && r.value.status).toBe("PENDING");
    expect(s.gateway.initiated).toHaveLength(1);
    expect(s.payments.items.size).toBe(1);
  });
  it("pack inconnu → PackNotFound", async () => {
    const s = setup();
    const r = await s.initiate.execute({ ...req, packId: "nope" });
    expect(!r.ok && r.error).toBeInstanceOf(PackNotFound);
  });
  it("téléphone invalide → erreur, rien d'appelé", async () => {
    const s = setup();
    const r = await s.initiate.execute({ ...req, phone: "081" });
    expect(r.ok).toBe(false);
    expect(s.gateway.initiated).toHaveLength(0);
  });
});

describe("HandlePaymentWebhook", () => {
  async function paid() {
    const s = setup();
    const r = await s.initiate.execute(req);
    if (!r.ok) throw r.error;
    return { s, providerRef: r.value.providerRef };
  }

  it("crédite le solde une fois le paiement réussi", async () => {
    const { s, providerRef } = await paid();
    const r = await s.webhook.execute({ payload: { providerRef, success: true }, signature: "valid-sig" });
    expect(r.ok).toBe(true);
    expect((await s.ledger.balanceOf("u1")).value).toBe(20);
  });

  it("webhook rejoué → crédité une seule fois", async () => {
    const { s, providerRef } = await paid();
    const event = { payload: { providerRef, success: true }, signature: "valid-sig" };
    await s.webhook.execute(event);
    await s.webhook.execute(event);
    await s.webhook.execute(event);
    expect((await s.ledger.balanceOf("u1")).value).toBe(20);
    expect(s.ledger.entries).toHaveLength(1);
  });

  it("signature invalide → refus, rien crédité", async () => {
    const { s, providerRef } = await paid();
    const r = await s.webhook.execute({ payload: { providerRef, success: true }, signature: "bad" });
    expect(!r.ok && r.error).toBeInstanceOf(InvalidPaymentSignature);
    expect(s.ledger.entries).toHaveLength(0);
  });

  it("paiement échoué → FAILED, rien crédité, et un succès tardif ne crédite pas", async () => {
    const { s, providerRef } = await paid();
    await s.webhook.execute({ payload: { providerRef, success: false }, signature: "valid-sig" });
    await s.webhook.execute({ payload: { providerRef, success: true }, signature: "valid-sig" });
    expect(s.ledger.entries).toHaveLength(0);
  });

  it("providerRef inconnu → PaymentNotFound", async () => {
    const s = setup();
    const r = await s.webhook.execute({ payload: { providerRef: "x", success: true }, signature: "valid-sig" });
    expect(!r.ok && r.error).toBeInstanceOf(PaymentNotFound);
  });
});
