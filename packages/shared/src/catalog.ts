import type { JobType } from "./enums";

/** Coût de base en crédits par type de job (hypothèse tant que STYLEME_SPEC.md est absent). */
export const JOB_BASE_COST: Record<JobType, number> = { ENHANCE: 1, PHOTOSHOOT: 5 };

export interface CreditPack {
  id: string;
  credits: number;
  price: number;
  currency: string;
}

/** Packs de crédits (hypothèse : à remplacer par les prix réels). */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "pack_5", credits: 5, price: 2, currency: "USD" },
  { id: "pack_20", credits: 20, price: 6, currency: "USD" },
  { id: "pack_50", credits: 50, price: 12, currency: "USD" },
];
