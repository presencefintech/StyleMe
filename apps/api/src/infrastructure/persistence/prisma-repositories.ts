import type {
  AccountDataRepository,
  AssetRecord,
  AssetRepository,
  CreditLedgerRepository,
  GarmentRecord,
  GarmentRepository,
  JobRepository,
  Page,
  PageRequest,
  PaymentRepository,
  StyleRepository,
  StyleSummary,
  UserRepository,
} from "../../domain/ports";
import { Job } from "../../domain/entities/job";
import { Payment } from "../../domain/entities/payment";
import { User } from "../../domain/entities/user";
import { CreditAmount } from "../../domain/value-objects/credit-amount";
import { Email } from "../../domain/value-objects/email";
import type { PrismaService } from "./prisma.service";

export class PrismaJobRepository implements JobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(job: Job) {
    const data = {
      userId: job.userId,
      type: job.type,
      styleId: job.styleId ?? null,
      garmentId: job.garmentId ?? null,
      prompt: job.prompt ?? null,
      creditCost: job.creditCost.value,
      status: job.status,
      inputAssetIds: job.inputAssetIds,
      outputAssetIds: job.outputAssetIds,
      errorReason: job.errorReason ?? null,
    };
    await this.prisma.db.job.upsert({ where: { id: job.id }, create: { id: job.id, ...data }, update: data });
  }

  async findById(id: string) {
    const r = await this.prisma.db.job.findUnique({ where: { id } });
    return r ? toJob(r) : null;
  }

  async listByUser(userId: string, page: PageRequest): Promise<Page<Job>> {
    const rows = await this.prisma.db.job.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, page.limit).map(toJob);
    return { items, nextCursor: rows.length > page.limit ? (items[items.length - 1]?.id ?? null) : null };
  }

  async listFinishedBefore(before: Date, limit: number) {
    const rows = await this.prisma.db.job.findMany({
      where: { createdAt: { lt: before }, status: { in: ["DONE", "FAILED", "REJECTED"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toJob);
  }

  async deleteMany(ids: string[]) {
    await this.prisma.root.$transaction([
      this.prisma.root.moderationLog.deleteMany({ where: { jobId: { in: ids } } }),
      this.prisma.root.job.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }
}

function toJob(r: {
  id: string; userId: string; type: "ENHANCE" | "PHOTOSHOOT" | "EDIT" | "ERASE" | "TRYON"; styleId: string | null; garmentId: string | null; prompt: string | null; creditCost: number;
  status: "PENDING" | "PROCESSING" | "DONE" | "REJECTED" | "FAILED"; inputAssetIds: string[]; outputAssetIds: string[]; errorReason: string | null; createdAt: Date;
}): Job {
  return Job.restore({
    id: r.id, userId: r.userId, type: r.type, styleId: r.styleId ?? undefined, garmentId: r.garmentId ?? undefined, prompt: r.prompt ?? undefined, creditCost: CreditAmount.of(r.creditCost),
    status: r.status, inputAssetIds: r.inputAssetIds, outputAssetIds: r.outputAssetIds, errorReason: r.errorReason ?? undefined, createdAt: r.createdAt,
  });
}

export class PrismaCreditLedgerRepository implements CreditLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}
  async balanceOf(userId: string) {
    const agg = await this.prisma.db.creditTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
    return CreditAmount.of(agg._sum.amount ?? 0);
  }
  async append(tx: { userId: string; amount: number; reason: string; paymentId?: string }) {
    // paymentId est UNIQUE : un paiement ne peut être crédité qu'une fois, même en concurrence.
    await this.prisma.db.creditTransaction.create({
      data: { userId: tx.userId, amount: tx.amount, reason: tx.reason, paymentId: tx.paymentId ?? null },
    });
  }
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}
  async save(p: Payment) {
    const data = {
      userId: p.userId, packId: p.packId, credits: p.credits, amount: p.amount, currency: p.currency,
      phone: p.phone, operator: p.operator, providerRef: p.providerRef, status: p.status,
    };
    await this.prisma.db.payment.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  async findById(id: string) {
    const r = await this.prisma.db.payment.findUnique({ where: { id } });
    return r ? toPayment(r) : null;
  }
  async findByProviderRef(providerRef: string) {
    const r = await this.prisma.db.payment.findUnique({ where: { providerRef } });
    return r ? toPayment(r) : null;
  }
}

function toPayment(r: {
  id: string; userId: string; packId: string; credits: number; amount: number; currency: string; phone: string;
  operator: string; providerRef: string; status: "PENDING" | "SUCCEEDED" | "FAILED";
}): Payment {
  return Payment.restore({ ...r, operator: r.operator as "mpesa" | "orange" | "airtel" });
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  async save(u: User) {
    await this.prisma.db.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id, email: u.email.value, passwordHash: u.passwordHash, ageConfirmedAt: u.ageConfirmedAt ?? null,
        referralCode: u.referralCode, referredById: u.referredById ?? null,
      },
      update: { ageConfirmedAt: u.ageConfirmedAt ?? null },
    });
  }
  async findById(id: string) {
    const r = await this.prisma.db.user.findFirst({ where: { id, deletedAt: null } });
    return r ? toUser(r) : null;
  }
  async findByEmail(email: string) {
    const r = await this.prisma.db.user.findFirst({ where: { email, deletedAt: null } });
    return r ? toUser(r) : null;
  }
  async findByReferralCode(code: string) {
    const r = await this.prisma.db.user.findFirst({ where: { referralCode: code, deletedAt: null } });
    return r ? toUser(r) : null;
  }
  async countReferrals(userId: string) {
    return this.prisma.db.user.count({ where: { referredById: userId } });
  }
}

/** Efface les données d'un compte en une transaction, et anonymise la ligne utilisateur (clés étrangères comptables conservées). */
export class PrismaAccountDataRepository implements AccountDataRepository {
  constructor(private readonly prisma: PrismaService) {}
  async erase(userId: string, at: Date) {
    const db = this.prisma.root;
    await db.$transaction([
      db.moderationLog.deleteMany({ where: { job: { userId } } }),
      db.job.deleteMany({ where: { userId } }),
      db.asset.deleteMany({ where: { userId } }),
      db.idempotencyRecord.deleteMany({ where: { userId } }),
      // Les paiements restent (obligation comptable), sans le numéro de téléphone.
      db.payment.updateMany({ where: { userId }, data: { phone: "" } }),
      db.user.update({
        where: { id: userId },
        // Email unique libéré ; "deleted" n'est pas un hash scrypt valide : aucune connexion possible.
        data: { email: `deleted-${userId}@deleted.invalid`, passwordHash: "deleted", ageConfirmedAt: null, deletedAt: at },
      }),
    ]);
  }
}

function toUser(r: { id: string; email: string; passwordHash: string; ageConfirmedAt: Date | null; referralCode: string; referredById: string | null }): User {
  return User.restore({
    id: r.id, email: Email.of(r.email), passwordHash: r.passwordHash, ageConfirmedAt: r.ageConfirmedAt ?? undefined,
    referralCode: r.referralCode, referredById: r.referredById ?? undefined,
  });
}

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaService) {}
  async save(a: AssetRecord) {
    await this.prisma.db.asset.create({ data: { id: a.id, userId: a.userId, kind: a.kind, bucket: a.bucket, key: a.key } });
  }
  async findByIds(ids: string[]) {
    const rows = await this.prisma.db.asset.findMany({ where: { id: { in: ids }, deletedAt: null } });
    return rows.map((r): AssetRecord => ({ id: r.id, userId: r.userId, kind: r.kind as AssetRecord["kind"], bucket: r.bucket, key: r.key }));
  }
  async findByRef(bucket: string, key: string) {
    const r = await this.prisma.db.asset.findFirst({ where: { bucket, key, deletedAt: null } });
    return r ? ({ id: r.id, userId: r.userId, kind: r.kind as AssetRecord["kind"], bucket: r.bucket, key: r.key } as AssetRecord) : null;
  }
  async listExpired(kind: AssetRecord["kind"], before: Date, limit: number) {
    const rows = await this.prisma.db.asset.findMany({
      where: { kind, deletedAt: null, createdAt: { lt: before } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map((r): AssetRecord => ({ id: r.id, userId: r.userId, kind: r.kind as AssetRecord["kind"], bucket: r.bucket, key: r.key }));
  }
  async markDeleted(ids: string[], at: Date) {
    await this.prisma.db.asset.updateMany({ where: { id: { in: ids } }, data: { deletedAt: at } });
  }
}

export class PrismaGarmentRepository implements GarmentRepository {
  constructor(private readonly prisma: PrismaService) {}
  async listActive(): Promise<GarmentRecord[]> {
    const rows = await this.prisma.db.garment.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
    return rows.map(toGarment);
  }
  async findActiveById(id: string) {
    const r = await this.prisma.db.garment.findFirst({ where: { id, active: true } });
    return r ? toGarment(r) : null;
  }
}

function toGarment(r: { id: string; name: string; category: GarmentRecord["category"]; description: string | null; bucket: string; key: string }): GarmentRecord {
  return { id: r.id, name: r.name, category: r.category, description: r.description ?? undefined, bucket: r.bucket, key: r.key };
}

export class PrismaStyleRepository implements StyleRepository {
  constructor(private readonly prisma: PrismaService) {}
  async listActive(): Promise<StyleSummary[]> {
    const rows = await this.prisma.db.styleTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, creditCost: r.creditCost, previewUrl: r.previewUrl ?? undefined }));
  }
}
