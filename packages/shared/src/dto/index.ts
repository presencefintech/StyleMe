import { z } from "zod";
import { MAX_ACCESSORIES, MAX_CAPTION_LENGTH, MAX_PROMPT_LENGTH, POST_VISIBILITIES, REPORT_REASONS } from "../catalog";
import { ASSET_KINDS, JOB_TYPES, OPERATORS } from "../enums";

export const RegisterDto = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(8).max(128),
  /** Code de parrainage (optionnel) ; un code inconnu est ignoré. */
  referralCode: z.string().trim().min(1).max(32).optional(),
});
export const LoginDto = z.object({ email: z.string().min(1).max(254), password: z.string().min(1).max(128) });
export const ConfirmAgeDto = z.object({ confirmed: z.literal(true) });
/** Suppression de compte : le mot de passe est redemandé. */
export const DeleteAccountDto = z.object({ password: z.string().min(1).max(128) });
export const PresignDto = z.object({ kind: z.enum(ASSET_KINDS) });
export const CreateJobDto = z
  .object({
    type: z.enum(JOB_TYPES),
    styleId: z.string().optional(),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH).optional(),
    inputAssetIds: z.array(z.string()).default([]),
    /** Retouche enchaînée : part du résultat d'un job précédent. */
    fromJobId: z.string().min(1).optional(),
    /** Essayage virtuel : la tenue du catalogue à essayer. */
    garmentId: z.string().min(1).optional(),
    /** Coiffure du catalogue (jobs HAIRSTYLE). */
    hairstyleId: z.string().min(1).optional(),
    /** Look composé (LOOK) : maquillage et accessoires ; styleId = l'occasion (fond). */
    makeupId: z.string().min(1).optional(),
    accessoryIds: z.array(z.string().min(1)).max(MAX_ACCESSORIES).default([]),
  })
  .refine((v) => v.type !== "EDIT" || !!v.prompt, { message: "prompt requis pour une édition", path: ["prompt"] })
  .refine((v) => v.type !== "ERASE" || (v.inputAssetIds.length === 2 && !v.fromJobId), {
    message: "une gomme exige l image et le masque",
    path: ["inputAssetIds"],
  })
  .refine((v) => v.type !== "TRYON" || (!!v.garmentId && v.inputAssetIds.length === 1 && !v.fromJobId), {
    message: "un essayage exige une tenue et une photo",
    path: ["garmentId"],
  })
  .refine((v) => v.type !== "LOOK" || (!v.fromJobId && v.inputAssetIds.length === 1 && !!(v.garmentId || v.hairstyleId || v.makeupId || v.accessoryIds.length || v.styleId)), {
    message: "un look exige une photo et au moins une étape",
    path: ["garmentId"],
  })
  .refine((v) => v.type !== "HAIRSTYLE" || !!v.hairstyleId, { message: "une coiffure est requise", path: ["hairstyleId"] })
  .refine((v) => (v.fromJobId ? v.inputAssetIds.length === 0 : v.inputAssetIds.length > 0), {
    message: "fournir soit inputAssetIds, soit fromJobId",
    path: ["inputAssetIds"],
  });
export const InitiatePaymentDto = z.object({
  packId: z.string(),
  phone: z.string().min(1),
  operator: z.enum(OPERATORS),
});

const Unit = z.number().min(0).max(1);
/**
 * Ce que l'utilisateur désigne sur la photo, en coordonnées normalisées (0..1) :
 * un clic sur un objet, ou un rectangle tracé à la main (comme une capture d'écran).
 */
export const SegmentDto = z.union([
  z.object({ x: Unit, y: Unit }).strict(),
  z
    .object({ box: z.object({ x0: Unit, y0: Unit, x1: Unit, y1: Unit }).refine((b) => b.x1 > b.x0 && b.y1 > b.y0, "rectangle sans surface") })
    .strict(),
]);
/** Confirme une sélection de la gomme magique. */
export const CommitSelectionDto = z.object({ selectionId: z.string().min(1).max(64) });

/** Publier un look dans le fil. Le consentement explicite est obligatoire : la photo devient visible d'autres personnes. */
export const PublishPostDto = z.object({
  jobId: z.string().min(1),
  visibility: z.enum(POST_VISIBILITIES).default("PUBLIC"),
  caption: z.string().trim().max(MAX_CAPTION_LENGTH).optional(),
  consent: z.literal(true),
});
export const ReportPostDto = z.object({ reason: z.enum(REPORT_REASONS) });
