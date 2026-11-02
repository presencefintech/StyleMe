import { createHmac, timingSafeEqual } from "node:crypto";
import type { InitiatePaymentRequest, PaymentGateway } from "../../domain/ports";
import type { Fetch } from "../ai/local-ai";

export interface FlexpayConfig {
  apiUrl: string;
  apiKey: string;
  merchant: string;
  callbackUrl: string;
  webhookSecret: string;
}

/**
 * Hypothèses à confirmer avec la doc Flexpay :
 *  - initiate : POST JSON {merchant,type:"1",phone,reference,amount,currency,callbackUrl}, Bearer apiKey → {code:"0",orderNumber}
 *  - webhook  : corps JSON {code,reference,orderNumber,...}, signé HMAC-SHA256 (hex) du corps brut avec webhookSecret
 */
export class FlexpayGateway implements PaymentGateway {
  constructor(private readonly cfg: FlexpayConfig, private readonly fetcher: Fetch = fetch) {}

  async initiate(p: InitiatePaymentRequest) {
    const res = await this.fetcher(this.cfg.apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        merchant: this.cfg.merchant,
        type: "1",
        phone: p.phone.replace(/^\+/, ""),
        reference: p.paymentId,
        amount: String(p.amount),
        currency: p.currency,
        callbackUrl: this.cfg.callbackUrl,
      }),
    });
    if (!res.ok) throw new Error(`Flexpay responded ${res.status}`);
    const body = (await res.json()) as { code?: string; message?: string; orderNumber?: string };
    if (body.code !== "0" || !body.orderNumber) throw new Error(`Flexpay refused: ${body.message ?? body.code}`);
    return { providerRef: body.orderNumber };
  }

  /** `payload` = corps BRUT (string/Buffer) : la signature se calcule sur les octets reçus. */
  verifySignature(payload: unknown, signature: string): boolean {
    if (typeof payload !== "string" && !Buffer.isBuffer(payload)) return false;
    const expected = createHmac("sha256", this.cfg.webhookSecret).update(payload).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(payload: unknown) {
    const raw = typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : "";
    const body = JSON.parse(raw) as { code?: string; orderNumber?: string };
    if (!body.orderNumber) throw new Error("Webhook sans orderNumber");
    return { providerRef: body.orderNumber, success: body.code === "0" };
  }
}
