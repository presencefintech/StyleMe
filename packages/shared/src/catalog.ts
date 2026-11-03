import type { JobType } from "./enums";

/** Coût de base en crédits par type de job (hypothèse tant que STYLEME_SPEC.md est absent). */
export const JOB_BASE_COST: Record<JobType, number> = { ENHANCE: 1, PHOTOSHOOT: 5, EDIT: 2, ERASE: 1, TRYON: 3, HAIRSTYLE: 2, LOOK: 0 /* calculé selon les étapes : voir lookCost */ };

export const MAX_PROMPT_LENGTH = 500;

/** Fil communautaire. */
export const MAX_CAPTION_LENGTH = 140;
/** Nombre de signalements distincts à partir duquel un look est masqué du fil en attendant une revue. */
export const REPORT_HIDE_THRESHOLD = 3;
export const POST_VISIBILITIES = ["PUBLIC", "UNLISTED"] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];
export const REPORT_REASONS = ["inapproprie", "usurpation", "autre"] as const;

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

/** Une coiffure du catalogue : décrite en texte, appliquée par un modèle d'édition (le visage est ensuite recollé depuis la photo d'origine). */
export interface Hairstyle {
  id: string;
  name: string;
  category: "perruque" | "tresses" | "naturel";
  /** Description anglaise de la coiffure, insérée dans la consigne. */
  look: string;
}

export const HAIRSTYLES: readonly Hairstyle[] = [
  { id: "lace-lisse", name: "Lace frontal lisse", category: "perruque", look: "a sleek, straight, glossy black lace frontal wig, long, with a natural hairline" },
  { id: "lace-bouclee", name: "Lace frontal bouclée", category: "perruque", look: "a voluminous curly black lace frontal wig with defined curls and a natural hairline" },
  { id: "bob-lisse", name: "Bob lisse", category: "perruque", look: "a sleek straight chin-length black bob wig with a natural hairline" },
  { id: "knotless-longues", name: "Knotless braids longues", category: "tresses", look: "long knotless box braids, neat parts, reaching the waist, black with a natural scalp look" },
  { id: "knotless-mi-longues", name: "Knotless braids mi-longues", category: "tresses", look: "medium-length knotless box braids, neat parts, reaching the shoulder blades, black" },
  { id: "cornrows", name: "Cornrows", category: "tresses", look: "neat, precise cornrows braided straight back close to the scalp, black" },
  { id: "tresses-elaborees", name: "Tresses élaborées", category: "tresses", look: "an elaborate sophisticated braided updo with intricate cornrow patterns and a high braided crown" },
  { id: "afro", name: "Afro naturel", category: "naturel", look: "a full, rounded natural afro with soft defined texture" },
];

/**
 * Passe 1 : retirer TOUS les cheveux d'origine. Demander directement une nouvelle coiffure laisse l'ancienne visible
 * sous ou à côté de la nouvelle (effet « perruque posée »). On repart donc d'un crâne dégagé.
 */
export const HAIR_CLEAR_PROMPT =
  "Remove all of the person's hair completely, leaving a smooth bald scalp with a natural skin tone and realistic head shape. " +
  "No hair strands, hairline remnants, braids, extensions, scarf or hat may remain on the head. " +
  "Keep the person exactly identical otherwise: same face, facial features, expression, skin tone, makeup, ears, neck, body, pose, clothing, jewelry and background. " +
  "Photorealistic. No text, logos or watermarks.";

/** Passe 2 : poser la nouvelle coiffure sur le crâne dégagé (la photo ne contient plus l'ancienne). */
export function hairstylePrompt(h: Hairstyle): string {
  return (
    `Give this person ${h.look}, growing naturally from the scalp along a natural hairline, with realistic volume, texture and parting. ` +
    "The hair must be the only new element and must look like real hair that belongs to the person, not a wig placed on top: it follows the shape of the head, with soft natural edges at the temples, the forehead and around the ears. " +
    "Keep the person exactly identical: same face, facial features, expression, skin tone, makeup, body, pose, clothing, jewelry and background. " +
    "The new hair must look real and natural, blend naturally at the hairline and around the neck and shoulders, with realistic lighting and shadows matching the photo. " +
    "Photorealistic. No text, logos or watermarks."
  );
}

/** Un style de maquillage, appliqué sur la peau du visage (la structure du visage d'origine est conservée). */
export interface Makeup {
  id: string;
  name: string;
  /** Description anglaise du maquillage, insérée dans la consigne. */
  look: string;
}

export const MAKEUPS: readonly Makeup[] = [
  { id: "nude", name: "Nude naturel", look: "a natural everyday makeup in soft neutral beige and brown tones: even skin, soft taupe eyeshadow, a subtle highlight on the cheekbones, soft pink-beige lips and light mascara" },
  { id: "glamour", name: "Glamour", look: "a glamorous full makeup: flawless matte foundation, defined winged eyeliner, bronze smoky eyeshadow, long lashes, sculpted cheeks and bold berry lips" },
  { id: "soiree", name: "Soirée", look: "an evening makeup: luminous skin, dramatic smoky eyes with gold shimmer, full lashes, highlighted cheekbones and deep red lips" },
  { id: "mariee", name: "Mariée", look: "a soft, elegant bridal makeup: radiant dewy skin, soft champagne eyeshadow, neat thin eyeliner, rosy blush and satin soft rose lips" },
];

/** Consigne de maquillage : seule la couleur change ; les traits (forme, yeux, nez, bouche, expression) restent exactement ceux de la photo. */
export function makeupPrompt(m: Makeup): string {
  return (
    `Apply ${m.look} to this person's face, as if done by a professional makeup artist. ` +
    "Only add makeup: do not change the shape of the face, the eyes, the nose, the lips, the eyebrows, the skin texture or the expression, and do not retouch or slim the face. " +
    "Hair, clothing, jewelry, body, pose and background stay exactly identical. Photorealistic, natural skin. No text, logos or watermarks."
  );
}

export interface Accessory {
  id: string;
  name: string;
  category: "bijoux" | "sac";
  look: string;
}

export const ACCESSORIES: readonly Accessory[] = [
  { id: "collier-or", name: "Collier doré traditionnel", category: "bijoux", look: "a traditional ornate gold necklace with a decorative pendant, worn around the neck" },
  { id: "creoles-or", name: "Créoles dorées", category: "bijoux", look: "large polished gold hoop earrings on both ears" },
  { id: "pendantes-or", name: "Boucles pendantes dorées", category: "bijoux", look: "ornate gold chandelier drop earrings on both ears" },
  { id: "bracelets-or", name: "Bracelets dorés", category: "bijoux", look: "several traditional gold bangle bracelets on the wrist" },
  { id: "sac-luxe", name: "Sac de luxe", category: "sac", look: "an elegant luxury leather handbag, held in the hand or worn on the shoulder" },
];
export const MAX_ACCESSORIES = 4;

/** Consigne d'accessoires : on ajoute, on ne change rien d'autre. Un accessoire hors cadre est simplement ignoré. */
export function accessoriesPrompt(list: readonly Accessory[]): string {
  return (
    `Add these accessories to the person: ${list.map((a) => a.look).join("; ")}. ` +
    "Place each one naturally and at a realistic size, following the body and the lighting; if the part of the body where one belongs is not visible in the photo, leave it out. " +
    "Do not change anything else: same face, expression, makeup, hair, clothing, body, pose and background. Photorealistic. No text, logos or watermarks."
  );
}

/** Une collection : un point de départ qui préremplit le look (l'utilisatrice peut tout modifier ensuite). */
export interface Collection {
  id: string;
  name: string;
  description: string;
  /** Occasion (fond) : un id de BACKGROUND_PRESETS. */
  styleId?: string;
  hairstyleId?: string;
  makeupId?: string;
  accessoryIds?: string[];
}

export const COLLECTIONS: readonly Collection[] = [
  { id: "mariage-traditionnel", name: "Mariage traditionnel", description: "Tresses élaborées, maquillage de mariée, bijoux dorés", styleId: "mariage", hairstyleId: "tresses-elaborees", makeupId: "mariee", accessoryIds: ["collier-or", "pendantes-or"] },
  { id: "soiree-glamour", name: "Soirée glamour", description: "Lace lisse, maquillage soirée, créoles dorées", styleId: "fetes", hairstyleId: "lace-lisse", makeupId: "soiree", accessoryIds: ["creoles-or", "sac-luxe"] },
  { id: "bapteme-elegant", name: "Baptême élégant", description: "Bob lisse, maquillage nude, petites touches dorées", styleId: "bapteme", hairstyleId: "bob-lisse", makeupId: "nude", accessoryIds: ["creoles-or"] },
  { id: "anniversaire-chic", name: "Anniversaire chic", description: "Boucles, maquillage glamour, bracelets dorés", styleId: "anniversaire", hairstyleId: "lace-bouclee", makeupId: "glamour", accessoryIds: ["bracelets-or"] },
];

/** Coût (crédits) de chaque étape d'un look composé. */
export const LOOK_STEP_COST = { garment: JOB_BASE_COST.TRYON, hairstyle: JOB_BASE_COST.HAIRSTYLE, makeup: 2, accessories: 2, occasion: 2 } as const;

export interface LookSteps {
  garmentId?: string;
  hairstyleId?: string;
  makeupId?: string;
  accessoryIds?: readonly string[];
  /** Occasion (fond). */
  styleId?: string;
}

/** Le prix d'un look est la somme des étapes choisies : on ne paie que ce qu'on demande. */
export function lookCost(s: LookSteps): number {
  return (
    (s.garmentId ? LOOK_STEP_COST.garment : 0) +
    (s.hairstyleId ? LOOK_STEP_COST.hairstyle : 0) +
    (s.makeupId ? LOOK_STEP_COST.makeup : 0) +
    (s.accessoryIds?.length ? LOOK_STEP_COST.accessories : 0) +
    (s.styleId ? LOOK_STEP_COST.occasion : 0)
  );
}

/** Crédits offerts et plafonds du parrainage. */
export const REFERRAL = {
  /** Offerts à chaque nouveau compte. */
  signupBonus: 3,
  /** Offerts au parrain pour chaque filleul inscrit. */
  referrerBonus: 2,
  /** Nombre maximum de parrainages récompensés par parrain. */
  maxRewardedReferrals: 10,
} as const;
