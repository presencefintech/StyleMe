import type { GarmentCategory, Operator } from "@styleme/shared";
import type { ImageRef } from "../value-objects/image-ref";

export type ModerationResult = { approved: boolean; nsfwScore: number; minorRisk: boolean; faceCount: number };

export interface ImageEnhancer {
  upscale(src: ImageRef): Promise<ImageRef>;
  restoreFace(src: ImageRef): Promise<ImageRef>;
}
export interface BackgroundService {
  remove(src: ImageRef): Promise<ImageRef>;
  applyTemplate(src: ImageRef, templateId: string): Promise<ImageRef>;
}
/** Édition d'image par instruction en langage naturel (ex. "enlève l'objet au fond"). */
export interface ImageEditor {
  edit(src: ImageRef, instruction: string): Promise<ImageRef>;
}
/** Ce que l'utilisateur désigne : un clic, ou un rectangle tracé à la main (coordonnées normalisées 0..1). */
export type SegmentTarget = { x: number; y: number } | { box: { x0: number; y0: number; x1: number; y1: number } };

/**
 * Sélection d'un objet par clic (SAM) ou d'une zone par rectangle. Deux temps :
 *  - select()  : aperçu instantané (data URL), sans aucun effet de bord ;
 *  - commit()  : la sélection est confirmée, la photo normalisée et le masque sont envoyés au stockage.
 */
export interface ObjectSelector {
  /** Préchauffe l'analyse d'une photo (le 1er clic est ensuite rapide). */
  prepare(src: ImageRef): Promise<void>;
  select(src: ImageRef, target: SegmentTarget): Promise<{ selectionId: string; overlayUrl: string }>;
  commit(src: ImageRef, selectionId: string): Promise<{ image: ImageRef; mask: ImageRef }>;
}
/** Essayage virtuel : habille la personne de la photo avec la tenue donnée (visage, pose et décor conservés). */
export interface VirtualTryOn {
  tryOn(person: ImageRef, garment: ImageRef, opts: { category: GarmentCategory; description?: string }): Promise<ImageRef>;
}
/** Boîte du visage, coordonnées normalisées 0..1. */
export type FaceBox = { x0: number; y0: number; x1: number; y1: number };
/** Localise le visage principal d'une photo (null = aucun). Sert à verrouiller l'identité pendant l'essayage. */
export interface FaceLocator {
  locate(src: ImageRef): Promise<FaceBox | null>;
}
/**
 * Verrou d'identité : recolle le visage de la photo d'origine sur une version retouchée par l'IA (cheveux, tenue…
 * restent ceux de la version retouchée). Lève une erreur si aucun visage n'est détecté.
 */
export interface FaceLock {
  restoreFace(original: ImageRef, edited: ImageRef): Promise<ImageRef>;
}
/**
 * Maquillage : combine la COULEUR de la version maquillée par l'IA avec la STRUCTURE (contours, yeux, détails fins) de la photo d'origine,
 * sur le visage seulement. Le maquillage apparaît, les traits restent exactement ceux de la personne.
 */
export interface MakeupBlender {
  blend(original: ImageRef, edited: ImageRef): Promise<ImageRef>;
}
/** Gomme : remplit la zone masquee de maniere naturelle. */
export interface ObjectEraser {
  erase(image: ImageRef, mask: ImageRef): Promise<ImageRef>;
}
export interface ModerationService {
  check(src: ImageRef, stage: "input" | "output"): Promise<ModerationResult>;
}
export interface StorageService {
  /** URL d'upload signée : le mobile/web envoie directement vers le storage. */
  presignUpload(ref: ImageRef): Promise<{ url: string }>;
  /** Lecture via URL signée à expiration courte (jamais de bucket public pour les photos). */
  presignDownload(ref: ImageRef, ttlSeconds?: number): Promise<{ url: string }>;
  put(ref: ImageRef, data: Uint8Array, contentType: string): Promise<void>;
  /** Copie un fichier (même bucket) : sert à publier un look sans dépendre de la purge du résultat d'origine. */
  copy(from: ImageRef, to: ImageRef): Promise<void>;
  delete(ref: ImageRef): Promise<void>;
  /** Supprime tous les fichiers dont la clé commence par `prefix` (ex. "<userId>/"). */
  deletePrefix(bucket: string, prefix: string): Promise<void>;
}
export interface PushService {
  notifyJobReady(jobId: string): Promise<void>;
}

export interface InitiatePaymentRequest {
  paymentId: string;
  amount: number;
  currency: string;
  phone: string;
  operator: Operator;
}
export interface PaymentGateway {
  initiate(p: InitiatePaymentRequest): Promise<{ providerRef: string }>;
  verifySignature(payload: unknown, signature: string): boolean;
  parseWebhook(payload: unknown): { providerRef: string; success: boolean };
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
export interface TokenService {
  issue(userId: string): Promise<string>;
}
export interface JobQueue {
  enqueue(jobId: string): Promise<void>;
}
/** Transaction DB : tout ce qui est exécuté dans `run` est atomique. */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
export interface IdGenerator {
  next(): string;
}
export interface Clock {
  now(): Date;
}
