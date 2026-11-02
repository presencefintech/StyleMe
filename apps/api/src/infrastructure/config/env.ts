import { z } from "zod";

const schema = z
  .object({
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    /** Optionnel : absent = file en mémoire (DEV uniquement). Obligatoire en production. */
    REDIS_URL: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(16),
    CORS_ORIGIN: z.string().min(1),
    AI_MODE: z.enum(["local", "api"]),
    REPLICATE_TOKEN: z.string().optional(),
    REPLICATE_UPSCALE_MODEL: z.string().optional(),
    REPLICATE_FACE_MODEL: z.string().optional(),
    REMOVEBG_KEY: z.string().optional(),
    MODERATION_PROVIDER: z.enum(["local", "sightengine"]),
    SIGHTENGINE_USER: z.string().optional(),
    SIGHTENGINE_SECRET: z.string().optional(),
    LOCAL_AI_URL: z.string().url().optional(),
    PAYMENT_PROVIDER: z.literal("flexpay"),
    PAYMENT_API_URL: z.string().url().default("https://backend.flexpay.cd/api/rest/v1/paymentService"),
    PAYMENT_API_KEY: z.string().min(1),
    PAYMENT_MERCHANT: z.string().min(1),
    PAYMENT_CALLBACK_URL: z.string().url(),
    PAYMENT_WEBHOOK_SECRET: z.string().min(1),
  })
  .superRefine((e, ctx) => {
    const need = (cond: boolean, path: string, why: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message: why });
    };
    need(e.AI_MODE !== "local" || !!e.LOCAL_AI_URL, "LOCAL_AI_URL", "requis si AI_MODE=local");
    need(e.AI_MODE !== "api" || (!!e.REPLICATE_TOKEN && !!e.REPLICATE_UPSCALE_MODEL && !!e.REPLICATE_FACE_MODEL && !!e.REMOVEBG_KEY), "REPLICATE_TOKEN", "REPLICATE_* et REMOVEBG_KEY requis si AI_MODE=api");
    need(e.MODERATION_PROVIDER !== "local" || !!e.LOCAL_AI_URL, "LOCAL_AI_URL", "requis si MODERATION_PROVIDER=local");
    need(e.MODERATION_PROVIDER !== "sightengine" || (!!e.SIGHTENGINE_USER && !!e.SIGHTENGINE_SECRET), "SIGHTENGINE_USER", "SIGHTENGINE_* requis si MODERATION_PROVIDER=sightengine");
  });

export type Env = z.infer<typeof schema>;

/** Fail-fast : une variable manquante ou invalide empêche le démarrage. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join("\n")}`);
  }
  return parsed.data;
}
