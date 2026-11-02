import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://x", SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k",
  REDIS_URL: "redis://x", JWT_SECRET: "a".repeat(16), CORS_ORIGIN: "http://localhost:3000",
  AI_MODE: "local", LOCAL_AI_URL: "http://ai:8000", MODERATION_PROVIDER: "local",
  PAYMENT_PROVIDER: "flexpay", PAYMENT_API_KEY: "k", PAYMENT_MERCHANT: "m",
  PAYMENT_CALLBACK_URL: "https://api.test/api/v1/payments/webhook", PAYMENT_WEBHOOK_SECRET: "s",
};

describe("loadEnv", () => {
  it("accepte une config complète", () => {
    expect(loadEnv(base).PORT).toBe(3001);
  });
  it("refuse de démarrer si une variable manque", () => {
    const rest: Record<string, string> = { ...base };
    delete rest.JWT_SECRET;
    expect(() => loadEnv(rest)).toThrow(/JWT_SECRET/);
  });
  it("exige les clés Replicate en AI_MODE=api", () => {
    expect(() => loadEnv({ ...base, AI_MODE: "api" })).toThrow(/REPLICATE_TOKEN/);
  });
});
