import type { AssetKind } from "@styleme/shared";
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
}

export interface AssetRecord {
  id: string;
  userId: string;
  /** RESULT = résultat d'un job réutilisé comme source (retouche enchaînée). */
  kind: AssetKind | "RESULT";
  bucket: string;
  key: string;
}
export interface AssetRepository {
  save(asset: AssetRecord): Promise<void>;
  findByIds(ids: string[]): Promise<AssetRecord[]>;
  /** Un même fichier (bucket + key) n'a qu'un seul enregistrement. */
  findByRef(bucket: string, key: string): Promise<AssetRecord | null>;
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
