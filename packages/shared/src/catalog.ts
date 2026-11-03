import type { JobType } from "./enums";

/** Coût de base en crédits par type de job (hypothèse tant que STYLEME_SPEC.md est absent). */
export const JOB_BASE_COST: Record<JobType, number> = { ENHANCE: 1, PHOTOSHOOT: 5, EDIT: 2, ERASE: 1, TRYON: 3 };

export const MAX_PROMPT_LENGTH = 500;

/** Durée de conservation des photos (en jours). Source unique : l'API purge, les pages légales l'affichent. */
export const SOURCE_RETENTION_DAYS = 7;
export const RESULT_RETENTION_DAYS = 30;

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
  "Only change the background and the lighting so the person looks naturally photographed there: match the light direction " +
  "and color temperature to the new scene, keep clean natural edges around hair and shoulders, no halo or cut-out look. " +
  "Photorealistic, natural shadows, sharp subject, shallow depth of field. No text, logos or watermarks in the background.";

/** Un décor candidat pour une occasion. Le 1er preset de chaque occasion est celui utilisé en production. */
export interface BackgroundPreset {
  id: string;
  /** Nom lisible, affiché dans le comparateur. */
  label: string;
  /** Description du décor (commence par « Replace the background with… »). */
  scene: string;
}

/**
 * Décors testés côte à côte (scripts/compare-backgrounds.ts). Pour changer le décor d'une occasion,
 * placer le preset gagnant en premier : OCCASION_PROMPTS (utilisé par l'API) est dérivé du 1er preset.
 * Les ids d'occasion sont ceux de StyleTemplate (prisma/seed.ts).
 */
export const BACKGROUND_PRESETS: Record<string, BackgroundPreset[]> = {
  mariage: [
    { id: "fleuri-dore", label: "Salle fleurie, lumière dorée", scene: "Replace the background with an elegant wedding venue: white and blush flowers, soft draped fabric, warm golden-hour light, gentle bokeh." },
    { id: "jardin", label: "Jardin et arche de roses", scene: "Replace the background with a romantic garden wedding: a floral arch of white roses and greenery, soft pastel petals, dappled late-afternoon sunlight, creamy bokeh." },
    { id: "salle-elegante", label: "Salle de réception élégante", scene: "Replace the background with a refined wedding reception hall: crystal chandeliers, ivory drapes, candles and soft warm lighting, softly blurred." },
  ],
  anniversaire: [
    { id: "ballons-fete", label: "Ballons et salle décorée", scene: "Replace the background with a joyful birthday party: colorful balloons, string lights and a festive decorated room, warm cheerful light, soft bokeh." },
    { id: "ballons-pastel", label: "Arche de ballons pastel", scene: "Replace the background with a clean modern party backdrop: a pastel balloon arch, a little confetti, soft bright daylight, uncluttered." },
    { id: "soiree", label: "Soirée guirlandes lumineuses", scene: "Replace the background with a festive evening party: warm string lights and glowing bokeh, cozy celebration atmosphere." },
  ],
  bapteme: [
    { id: "eglise-jardin", label: "Église ou jardin lumineux", scene: "Replace the background with a bright, serene church interior or garden with soft white flowers, pastel tones and gentle natural light." },
    { id: "jardin-blanc", label: "Jardin de fleurs blanches", scene: "Replace the background with a bright garden full of white flowers, soft pastel tones and gentle morning light, creamy bokeh." },
    { id: "eglise-lumineuse", label: "Église claire", scene: "Replace the background with a bright, airy church interior: light stone arches, soft light through stained glass, softly blurred." },
  ],
  diplome: [
    { id: "campus", label: "Campus universitaire", scene: "Replace the background with a university campus on graduation day: stately stone building, green lawn, blue sky, warm sunlight, soft blur." },
    { id: "bibliotheque", label: "Grande bibliothèque", scene: "Replace the background with a grand university library: warm wooden shelves full of books, warm light, softly blurred." },
    { id: "ceremonie", label: "Cérémonie en plein air", scene: "Replace the background with an outdoor graduation ceremony: softly blurred rows of seats and banners without any text, bright sky, warm sunlight." },
  ],
  fetes: [
    { id: "sapin", label: "Sapin et lumières", scene: "Replace the background with a cozy festive holiday setting: a decorated Christmas tree, warm twinkling lights, red and green ornaments, soft bokeh." },
    { id: "salon-chaleureux", label: "Salon chaleureux", scene: "Replace the background with a cozy living room at the holidays: a fireplace, garlands and candles, warm glow, soft bokeh." },
    { id: "neige-lumieres", label: "Soirée de neige", scene: "Replace the background with a snowy winter evening: warm twinkling lights, pine branches, soft falling snow, gentle bokeh." },
  ],
  "saint-valentin": [
    { id: "roses-bougies", label: "Roses et bougies", scene: "Replace the background with a romantic Valentine's Day setting: soft red and pink roses, candlelight, warm dreamy glow, gentle bokeh." },
    { id: "restaurant", label: "Dîner aux chandelles", scene: "Replace the background with an intimate candlelit restaurant: a table with roses and candles, warm low light, soft bokeh." },
    { id: "petales", label: "Fond rose et pétales", scene: "Replace the background with a dreamy soft pink backdrop with scattered rose petals and gentle romantic light, uncluttered." },
  ],
  "pro-linkedin": [
    { id: "bureau", label: "Bureau moderne flou", scene: "Replace the background with a modern bright office, softly blurred, neutral tones, professional corporate headshot lighting." },
  ],
  cv: [
    { id: "gris-neutre", label: "Fond gris neutre", scene: "Replace the background with a clean, plain light-grey studio backdrop with soft even lighting, like a professional ID or résumé photo." },
  ],
  "fond-studio": [
    { id: "studio-degrade", label: "Studio dégradé", scene: "Replace the background with a seamless neutral photography studio backdrop with a subtle gradient and soft professional studio lighting." },
  ],
};

/** Consigne complète envoyée au modèle d'édition pour un décor. */
export const presetPrompt = (preset: BackgroundPreset): string => `${preset.scene} ${KEEP_SUBJECT}`;

/**
 * Consigne envoyée au modèle d'édition (FLUX Kontext) pour chaque occasion : celle du 1er preset.
 * Un style absent de cette table retombe sur le pipeline local (détourage + fond en dégradé, services/ai).
 */
export const OCCASION_PROMPTS: Record<string, string> = Object.fromEntries(
  Object.entries(BACKGROUND_PRESETS).map(([style, presets]) => [style, presetPrompt(presets[0]!)]),
);

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

/** Crédits offerts et plafonds du parrainage. */
export const REFERRAL = {
  /** Offerts à chaque nouveau compte. */
  signupBonus: 3,
  /** Offerts au parrain pour chaque filleul inscrit. */
  referrerBonus: 2,
  /** Nombre maximum de parrainages récompensés par parrain. */
  maxRewardedReferrals: 10,
} as const;
