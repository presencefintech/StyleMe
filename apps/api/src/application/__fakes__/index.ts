import { REPORT_HIDE_THRESHOLD } from "@styleme/shared";
import type {
  GarmentRecord,
  GarmentRepository,
  VirtualTryOn,
  FaceLock,
  MakeupBlender,
  PostRecord,
  PostRepository,
  PostWithStats,
  AccountDataRepository,
  AssetRecord,
  AssetRepository,
  Page,
  PageRequest,
  PushService,
  StorageService,
  StyleRepository,
  StyleSummary,
  BackgroundService,
  Clock,
  CreditLedgerRepository,
  IdGenerator,
  ImageEditor,
  ObjectEraser,
  ObjectSelector,
  SegmentTarget,
  ImageEnhancer,
  InitiatePaymentRequest,
  JobQueue,
  JobRepository,
  ModerationResult,
  ModerationService,
  PasswordHasher,
  PaymentGateway,
  PaymentRepository,
  TokenService,
  UnitOfWork,
  UserRepository,
} from "../../domain/ports";
import type { Job } from "../../domain/entities/job";
import { SelectionExpired } from "../../domain/errors";
import type { Payment } from "../../domain/entities/payment";
import type { User } from "../../domain/entities/user";
import { CreditAmount } from "../../domain/value-objects/credit-amount";
import type { ImageRef } from "../../domain/value-objects/image-ref";

export class InMemoryJobRepository implements JobRepository {
  readonly items = new Map<string, Job>();
  async save(job: Job) { this.items.set(job.id, job); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async listByUser(userId: string, page: PageRequest): Promise<Page<Job>> {
    // Ordre d'insertion inversé = plus récents d'abord.
    const all = [...this.items.values()].filter((j) => j.userId === userId).reverse();
    const start = page.cursor ? all.findIndex((j) => j.id === page.cursor) + 1 : 0;
    const items = all.slice(start, start + page.limit);
    const hasMore = start + page.limit < all.length;
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
  }
  async listFinishedBefore(before: Date, limit: number) {
    return [...this.items.values()]
      .filter((j) => ["DONE", "FAILED", "REJECTED"].includes(j.status) && j.createdAt !== undefined && j.createdAt < before)
      .slice(0, limit);
  }
  async deleteMany(ids: string[]) { for (const id of ids) this.items.delete(id); }
}

export class InMemoryAssetRepository implements AssetRepository {
  readonly items = new Map<string, AssetRecord>();
  async save(a: AssetRecord) { this.items.set(a.id, a); }
  readonly deleted = new Set<string>();
  async findByIds(ids: string[]) { return ids.flatMap((id) => (this.deleted.has(id) ? [] : (this.items.get(id) ?? []))); }
  async findByRef(bucket: string, key: string) {
    return [...this.items.values()].find((a) => a.bucket === bucket && a.key === key && !this.deleted.has(a.id)) ?? null;
  }
  async listExpired(kind: AssetRecord["kind"], before: Date, limit: number) {
    return [...this.items.values()]
      .filter((a) => a.kind === kind && !this.deleted.has(a.id) && a.createdAt !== undefined && a.createdAt < before)
      .slice(0, limit);
  }
  async markDeleted(ids: string[]) { for (const id of ids) this.deleted.add(id); }
}

export class InMemoryStyleRepository implements StyleRepository {
  constructor(private styles: StyleSummary[] = []) {}
  async listActive() { return this.styles; }
}

export class FakeStorage implements StorageService {
  readonly puts: ImageRef[] = [];
  readonly deletes: ImageRef[] = [];
  readonly deletedPrefixes: { bucket: string; prefix: string }[] = [];
  /** Clés dont la suppression échoue (simule une panne du stockage). */
  readonly failDeleteFor = new Set<string>();
  async presignUpload(ref: ImageRef) { return { url: `https://storage.test/upload/${ref.bucket}/${ref.key}` }; }
  async presignDownload(ref: ImageRef) { return { url: `https://storage.test/dl/${ref.bucket}/${ref.key}` }; }
  readonly copies: { from: ImageRef; to: ImageRef }[] = [];
  async put(ref: ImageRef) { this.puts.push(ref); }
  async copy(from: ImageRef, to: ImageRef) { this.copies.push({ from, to }); }
  async delete(ref: ImageRef) {
    if (this.failDeleteFor.has(ref.key)) throw new Error("storage down");
    this.deletes.push(ref);
  }
  async deletePrefix(bucket: string, prefix: string) { this.deletedPrefixes.push({ bucket, prefix }); }
}

export class InMemoryAccountData implements AccountDataRepository {
  readonly erased: string[] = [];
  async erase(userId: string) { this.erased.push(userId); }
}

export class FakePush implements PushService {
  readonly notified: string[] = [];
  async notifyJobReady(jobId: string) { this.notified.push(jobId); }
}

export class InMemoryCreditLedger implements CreditLedgerRepository {
  readonly entries: { userId: string; amount: number; reason: string; paymentId?: string }[] = [];
  async balanceOf(userId: string) {
    return CreditAmount.of(this.entries.filter((e) => e.userId === userId).reduce((s, e) => s + e.amount, 0));
  }
  async append(tx: { userId: string; amount: number; reason: string; paymentId?: string }) {
    this.entries.push(tx);
  }
}

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly items = new Map<string, Payment>();
  async save(p: Payment) { this.items.set(p.id, p); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async findByProviderRef(ref: string) {
    return [...this.items.values()].find((p) => p.providerRef === ref) ?? null;
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly items = new Map<string, User>();
  async save(u: User) { this.items.set(u.id, u); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async findByEmail(email: string) {
    return [...this.items.values()].find((u) => u.email.value === email) ?? null;
  }
  async findByReferralCode(code: string) {
    return [...this.items.values()].find((u) => u.referralCode === code) ?? null;
  }
  async countReferrals(userId: string) {
    return [...this.items.values()].filter((u) => u.referredById === userId).length;
  }
}

export class FakeModeration implements ModerationService {
  readonly calls: ("input" | "output")[] = [];
  constructor(
    private results: Partial<Record<"input" | "output", Partial<ModerationResult>>> = {},
    private failWith?: Error,
  ) {}
  async check(_src: ImageRef, stage: "input" | "output"): Promise<ModerationResult> {
    this.calls.push(stage);
    if (this.failWith) throw this.failWith;
    return { approved: true, nsfwScore: 0, minorRisk: false, faceCount: 1, ...this.results[stage] };
  }
}

export class FakeEnhancer implements ImageEnhancer {
  constructor(private failWith?: Error) {}
  async upscale(src: ImageRef): Promise<ImageRef> {
    if (this.failWith) throw this.failWith;
    return { bucket: "results", key: `${src.key}.up` };
  }
  async restoreFace(src: ImageRef): Promise<ImageRef> {
    return { bucket: "results", key: `${src.key}.face` };
  }
}

export class FakeEditor implements ImageEditor {
  readonly calls: { src: ImageRef; instruction: string }[] = [];
  constructor(private failWith?: Error) {}
  async edit(src: ImageRef, instruction: string): Promise<ImageRef> {
    this.calls.push({ src, instruction });
    if (this.failWith) throw this.failWith;
    return { bucket: "results", key: `${src.key}.edited` };
  }
}

export class FakeEraser implements ObjectEraser {
  readonly calls: { image: ImageRef; mask: ImageRef }[] = [];
  constructor(private failWith?: Error) {}
  async erase(image: ImageRef, mask: ImageRef): Promise<ImageRef> {
    this.calls.push({ image, mask });
    if (this.failWith) throw this.failWith;
    return { bucket: "results", key: image.key + ".erased" };
  }
}

export class FakeObjectSelector implements ObjectSelector {
  readonly calls: ({ src: ImageRef } & SegmentTarget)[] = [];
  readonly commits: { src: ImageRef; selectionId: string }[] = [];
  readonly prepared: ImageRef[] = [];
  private readonly selections = new Map<string, ImageRef>();
  constructor(private failWith?: Error) {}
  async prepare(src: ImageRef) {
    this.prepared.push(src);
    if (this.failWith) throw this.failWith;
  }
  async select(src: ImageRef, target: SegmentTarget) {
    this.calls.push({ src, ...target });
    if (this.failWith) throw this.failWith;
    const selectionId = "sel" + this.calls.length;
    this.selections.set(selectionId, src);
    return { selectionId, overlayUrl: "data:image/jpeg;base64,AAAA" };
  }
  async commit(src: ImageRef, selectionId: string) {
    this.commits.push({ src, selectionId });
    if (this.selections.get(selectionId)?.key !== src.key) throw new SelectionExpired("expirée");
    const owner = src.key.split("/")[0];
    return {
      image: { bucket: "results", key: owner + "/base-" + src.key.replace(/\W/g, "_") + ".base.jpg" }, // partagée par les confirmations
      mask: { bucket: "results", key: owner + "/" + selectionId + ".mask.png" },
    };
  }
}

export class FakeBackground implements BackgroundService {
  async remove(src: ImageRef): Promise<ImageRef> { return { bucket: "results", key: `${src.key}.nobg` }; }
  async applyTemplate(src: ImageRef, templateId: string): Promise<ImageRef> {
    return { bucket: "results", key: `${src.key}.${templateId}` };
  }
}

export class FakePaymentGateway implements PaymentGateway {
  readonly initiated: InitiatePaymentRequest[] = [];
  validSignature = "valid-sig";
  async initiate(p: InitiatePaymentRequest) {
    this.initiated.push(p);
    return { providerRef: `ref_${p.paymentId}` };
  }
  verifySignature(_payload: unknown, signature: string) { return signature === this.validSignature; }
  parseWebhook(payload: unknown) {
    return (typeof payload === "string" ? JSON.parse(payload) : payload) as { providerRef: string; success: boolean };
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string) { return `hashed:${plain}`; }
  async verify(plain: string, hash: string) { return hash === `hashed:${plain}`; }
}

export class FakeTokenService implements TokenService {
  async issue(userId: string) { return `token_${userId}`; }
}

export class FakeJobQueue implements JobQueue {
  readonly enqueued: string[] = [];
  async enqueue(jobId: string) { this.enqueued.push(jobId); }
}

/** Exécute directement ; compte les appels pour vérifier l'usage transactionnel. */
export class InMemoryUnitOfWork implements UnitOfWork {
  runs = 0;
  async run<T>(work: () => Promise<T>) { this.runs++; return work(); }
}

export class FixedClock implements Clock {
  constructor(private date = new Date("2026-01-01T00:00:00Z")) {}
  now() { return this.date; }
}

export class SequentialIdGenerator implements IdGenerator {
  private n = 0;
  next() { return `id_${++this.n}`; }
}

export class InMemoryGarmentRepository implements GarmentRepository {
  constructor(readonly items: (GarmentRecord & { active?: boolean })[] = []) {}
  async listActive() { return this.items.filter((g) => g.active !== false); }
  async findActiveById(id: string) { return this.items.find((g) => g.id === id && g.active !== false) ?? null; }
}

export class FakeTryOn implements VirtualTryOn {
  readonly calls: { person: ImageRef; garment: ImageRef; category: string; description?: string }[] = [];
  constructor(private failWith?: Error) {}
  async tryOn(person: ImageRef, garment: ImageRef, opts: { category: string; description?: string }): Promise<ImageRef> {
    this.calls.push({ person, garment, category: opts.category, description: opts.description });
    if (this.failWith) throw this.failWith;
    return { bucket: "results", key: `${person.key}.tryon` };
  }
}

export class FakeFaceLock implements FaceLock {
  readonly calls: { original: ImageRef; edited: ImageRef }[] = [];
  constructor(private failWith?: Error) {}
  async restoreFace(original: ImageRef, edited: ImageRef): Promise<ImageRef> {
    this.calls.push({ original, edited });
    if (this.failWith) throw this.failWith;
    return { bucket: "results", key: `${edited.key}.locked` };
  }
}

export class InMemoryPostRepository implements PostRepository {
  readonly items = new Map<string, PostRecord & { reportCount: number }>();
  readonly likes = new Set<string>();
  readonly reports = new Set<string>();
  async save(p: PostRecord) {
    const prev = this.items.get(p.id);
    this.items.set(p.id, prev ? { ...prev, visibility: p.visibility, caption: p.caption } : { ...p, reportCount: 0 });
  }
  private stats(p: PostRecord & { reportCount: number }, viewerId: string): PostWithStats {
    const likeCount = [...this.likes].filter((k) => k.startsWith(p.id + ":")).length;
    return { ...p, likeCount, likedByMe: this.likes.has(p.id + ":" + viewerId), hidden: p.reportCount >= REPORT_HIDE_THRESHOLD };
  }
  async findById(id: string, viewerId: string) {
    const p = this.items.get(id);
    return p ? this.stats(p, viewerId) : null;
  }
  async findByJob(userId: string, jobId: string) {
    return [...this.items.values()].find((p) => p.userId === userId && p.jobId === jobId) ?? null;
  }
  async delete(id: string) {
    this.items.delete(id);
    for (const k of [...this.likes]) if (k.startsWith(id + ":")) this.likes.delete(k);
  }
  private page(all: PostWithStats[], page: PageRequest): Page<PostWithStats> {
    const start = page.cursor ? all.findIndex((p) => p.id === page.cursor) + 1 : 0;
    const items = all.slice(start, start + page.limit);
    return { items, nextCursor: start + page.limit < all.length ? (items[items.length - 1]?.id ?? null) : null };
  }
  async listPublic(viewerId: string, page: PageRequest) {
    const all = [...this.items.values()].reverse().map((p) => this.stats(p, viewerId)).filter((p) => p.visibility === "PUBLIC" && !p.hidden);
    return this.page(all, page);
  }
  async listByUser(userId: string, page: PageRequest) {
    return this.page([...this.items.values()].reverse().filter((p) => p.userId === userId).map((p) => this.stats(p, userId)), page);
  }
  async setLike(postId: string, userId: string, liked: boolean) {
    if (liked) this.likes.add(postId + ":" + userId);
    else this.likes.delete(postId + ":" + userId);
  }
  async addReport(postId: string, userId: string) {
    const key = postId + ":" + userId;
    if (this.reports.has(key)) return;
    this.reports.add(key);
    const p = this.items.get(postId);
    if (p) p.reportCount += 1;
  }
}

export class FakeMakeupBlender implements MakeupBlender {
  readonly calls: { original: ImageRef; edited: ImageRef }[] = [];
  async blend(original: ImageRef, edited: ImageRef): Promise<ImageRef> {
    this.calls.push({ original, edited });
    return { bucket: "results", key: `${edited.key}.makeup` };
  }
}
