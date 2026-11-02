import type { JobType } from "./enums";

/** Coût de base en crédits par type de job (hypothèse tant que STYLEME_SPEC.md est absent). */
export const JOB_BASE_COST: Record<JobType, number> = { ENHANCE: 1, PHOTOSHOOT: 5, EDIT: 2, ERASE: 1 };

export const MAX_PROMPT_LENGTH = 500;

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

const KEEP_SUBJECT =
  "Keep the person exactly identical: same face, facial features, skin tone, hair, body, pose and outfit. " +
  "Only change the background and the lighting so the person looks naturally photographed there. " +
  "Photorealistic, natural shadows, sharp subject, shallow depth of field.";

/**
 * Consigne envoyée au modèle d'édition (FLUX Kontext) pour chaque occasion.
 * Les ids sont ceux de StyleTemplate (prisma/seed.ts). Un style absent de cette table retombe sur le
 * pipeline local (détourage + fond en dégradé, services/ai).
 */
export const OCCASION_PROMPTS: Record<string, string> = {
  mariage: `Replace the background with an elegant wedding venue: white and blush flowers, soft draped fabric, warm golden-hour light, gentle bokeh. ${KEEP_SUBJECT}`,
  anniversaire: `Replace the background with a joyful birthday party: colorful balloons, string lights and a festive decorated room, warm cheerful light, soft bokeh. ${KEEP_SUBJECT}`,
  bapteme: `Replace the background with a bright, serene church interior or garden with soft white flowers, pastel tones and gentle natural light. ${KEEP_SUBJECT}`,
  diplome: `Replace the background with a university campus on graduation day: stately stone building, green lawn, blue sky, warm sunlight, soft blur. ${KEEP_SUBJECT}`,
  fetes: `Replace the background with a cozy festive holiday setting: a decorated Christmas tree, warm twinkling lights, red and green ornaments, soft bokeh. ${KEEP_SUBJECT}`,
  "saint-valentin": `Replace the background with a romantic Valentine's Day setting: soft red and pink roses, candlelight, warm dreamy glow, gentle bokeh. ${KEEP_SUBJECT}`,
  "pro-linkedin": `Replace the background with a modern bright office, softly blurred, neutral tones, professional corporate headshot lighting. ${KEEP_SUBJECT}`,
  cv: `Replace the background with a clean, plain light-grey studio backdrop with soft even lighting, like a professional ID or résumé photo. ${KEEP_SUBJECT}`,
  "fond-studio": `Replace the background with a seamless neutral photography studio backdrop with a subtle gradient and soft professional studio lighting. ${KEEP_SUBJECT}`,
};

/** Fonds proposés par « Nettoyage & Studio » (photo de profil). Les ids sont ceux de StyleTemplate (kind CLEANUP). */
export const CLEANUP_STYLES: { id: string; name: string; backdrop: string }[] = [
  { id: "studio-blanc", name: "Fond blanc", backdrop: "pure white" },
  { id: "studio-gris", name: "Gris studio", backdrop: "light neutral grey" },
  { id: "studio-bleu", name: "Bleu doux", backdrop: "soft light blue" },
  { id: "studio-beige", name: "Beige chaleureux", backdrop: "warm light beige" },
];

/**
 * Nettoyage : corrige le flou et le bruit, remplace le fond par un fond de studio propre, et ne change NI le
 * visage NI les vêtements (contrairement aux occasions, qui habillent la scène).
 */
function cleanupPrompt(backdrop: string): string {
  return (
    "Clean up this portrait so it works as a profile picture. Fix blur and noise: make the image sharp, clear and " +
    "well exposed, with natural, flattering lighting and balanced colors. " +
    `Replace the background with a clean, plain ${backdrop} studio backdrop, softly lit and free of clutter. ` +
    "Keep the person exactly identical: same face and facial features, skin texture, hair, expression, pose and body " +
    "proportions. Keep all clothes, accessories and jewelry exactly the same: do not change, restyle or recolor any " +
    "clothing. Do not beautify, slim or reshape anything. Photorealistic and natural."
  );
}
for (const c of CLEANUP_STYLES) OCCASION_PROMPTS[c.id] = cleanupPrompt(c.backdrop);
