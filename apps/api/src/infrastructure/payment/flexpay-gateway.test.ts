import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FlexpayGateway } from "./flexpay-gateway";

const cfg = { apiUrl: "https://flex/pay", apiKey: "k", merchant: "m", callbackUrl: "https://api/cb", webhookSecret: "secret" };
const sign = (body: string, secret = "secret") => createHmac("sha256", secret).update(body).digest("hex");

describe("FlexpayGateway", () => {
  it("vérifie la signature HMAC du corps brut", () => {
    const g = new FlexpayGateway(cfg);
    const body = JSON.stringify({ code: "0", orderNumber: "o1" });
    expect(g.verifySignature(body, sign(body))).toBe(true);
    expect(g.verifySignature(body, sign(body, "other"))).toBe(false);
    expect(g.verifySignature(body, "short")).toBe(false);
    expect(g.verifySignature({ code: "0" }, sign(body))).toBe(false);
  });
  it("parse un webhook réussi / échoué", () => {
    const g = new FlexpayGateway(cfg);
    expect(g.parseWebhook(JSON.stringify({ code: "0", orderNumber: "o1" }))).toEqual({ providerRef: "o1", success: true });
    expect(g.parseWebhook(JSON.stringify({ code: "1", orderNumber: "o2" }))).toEqual({ providerRef: "o2", success: false });
  });
  it("initie un paiement et renvoie le orderNumber", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: "0", orderNumber: "ord9" }) });
    const g = new FlexpayGateway(cfg, fetcher as unknown as typeof fetch);
    const r = await g.initiate({ paymentId: "p1", amount: 6, currency: "USD", phone: "+243812345678", operator: "mpesa" });
    expect(r.providerRef).toBe("ord9");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).phone).toBe("243812345678");
  });
  it("lève si le provider refuse", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: "1", message: "no funds" }) });
    const g = new FlexpayGateway(cfg, fetcher as unknown as typeof fetch);
    await expect(g.initiate({ paymentId: "p1", amount: 6, currency: "USD", phone: "+243812345678", operator: "mpesa" })).rejects.toThrow(/no funds/);
  });
});
