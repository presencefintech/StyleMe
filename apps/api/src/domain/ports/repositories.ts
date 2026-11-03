import type { AssetKind, GarmentCategory } from "@styleme/shared";
import type { Job } from "../entities/job";
import type { Payment } from "../entities/payment";
import type { User } from "../entities/user";
import type { CreditAmount } from "../value-objects/credit-amount";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface PageRequest {
  cursor?: string;
  limit: number;
}

export interface JobRepository {
  save(job: Job): Promise<void>;
  findById(id: string): Promise<Job | null>;
  /** Plus récents d'abord, pagination par curseur (id du dernier élément). */
  listByUser(userId: string, page: PageRequest): Promise<Page<Job>>;
  /** Jobs terminés (DONE/FAILED/REJECTED) créés avant `before`, pour la purge de rétention. */
  listFinishedBefore(before: Date, limit: number): Promise<Job[]>;
  deleteMany(ids: string[]): Promise<void>;
}

export interface CreditLedgerRepository {
  balanceOf(userId: string): Promise<CreditAmount>;
  /** Append-only : le solde = SUM(amount). */
  append(tx: { userId: string; amount: number; reason: string; paymentId?: string }): Promise<void>;
}

export interface PaymentRepository {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByProviderRef(providerRef: string): Promise<Payment | null>;
}

export interface UserRepository {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByReferralCode(code: string): Promise<User | null>;
  /** Nombre de comptes parrainés par cet utilisateur. */
  countReferrals(userId: string): Promise<number>;
}

export interface AssetRecord {
  id: string;
  userId: string;
  /** RESULT = résultat d'un job réutilisé comme source (retouche enchaînée). */
  kind: AssetKind | "RESULT";
  bucket: string;
  key: string;
  /** Renseigné à la lecture en base ; absent à la création. */
  createdAt?: Date;
}
export interface AssetRepository {
  save(asset: AssetRecord): Promise<void>;
  findByIds(ids: string[]): Promise<AssetRecord[]>;
  /** Un même fichier (bucket + key) n'a qu'un seul enregistrement. */
  findByRef(bucket: string, key: string): Promise<AssetRecord | null>;
  /** Fichiers non encore purgés, d'un type donné, créés avant `before`. */
  listExpired(kind: AssetRecord["kind"], before: Date, limit: number): Promise<AssetRecord[]>;
  markDeleted(ids: string[], at: Date): Promise<void>;
}

/** Effacement des données d'un compte (hors fichiers). Les écritures comptables (crédits, paiements) sont conservées, sans numéro de téléphone. */
export interface AccountDataRepository {
  erase(userId: string, at: Date): Promise<void>;
}

/** Tenue du catalogue (essayage virtuel). */
export interface GarmentRecord {
  id: string;
  name: string;
  category: GarmentCategory;
  description?: string;
  bucket: string;
  key: string;
}
export interface GarmentRepository {
  listActive(): Promise<GarmentRecord[]>;
  /** Seulement une tenue active : une tenue retirée du catalogue ne peut plus être essayée. */
  findActiveById(id: string): Promise<GarmentRecord | null>;
}

export interface StyleSummary {
  id: string;
  name: string;
  kind: string;
  creditCost: number;
  previewUrl?: string;
}
export interface StyleRepository {
  listActive(): Promise<StyleSummary[]>;
}

/** Look publié dans le fil. */
export interface PostRecord {
  id: string;
  userId: string;
  jobId: string;
  /** Copie de l'image dans le bucket "results" (clé "<userId>/post-<id>.<ext>"). */
  imageKey: string;
  visibility: "PUBLIC" | "UNLISTED";
  caption?: string;
  garmentId?: string;
  hairstyleId?: string;
  makeupId?: string;
  accessoryIds: string[];
  /** Occasion (fond) du look. */
  occasionId?: string;
  createdAt: Date;
}
export interface PostWithStats extends PostRecord {
  likeCount: number;
  likedByMe: boolean;
  /** Assez de signalements pour être masqué du fil (visible seulement de son auteure). */
  hidden: boolean;
}
export interface PostRepository {
  /** Crée ou met à jour (visibilité, légende) ; la clé unique est (userId, jobId). */
  save(post: PostRecord): Promise<void>;
  findById(id: string, viewerId: string): Promise<PostWithStats | null>;
  findByJob(userId: string, jobId: string): Promise<PostRecord | null>;
  delete(id: string): Promise<void>;
  /** Fil public : PUBLIC et non masqués, plus récents d'abord. */
  listPublic(viewerId: string, page: PageRequest): Promise<Page<PostWithStats>>;
  listByUser(userId: string, page: PageRequest): Promise<Page<PostWithStats>>;
  /** Idempotent. */
  setLike(postId: string, userId: string, liked: boolean): Promise<void>;
  /** Un signalement par personne et par post (idempotent) ; incrémente le compteur seulement la première fois. */
  addReport(postId: string, userId: string, reason: string): Promise<void>;
}
