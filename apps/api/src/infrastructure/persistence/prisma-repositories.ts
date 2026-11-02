import type {
  AssetRecord,
  AssetRepository,
  CreditLedgerRepository,
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
}

function toJob(r: {
  id: string; userId: string; type: "ENHANCE" | "PHOTOSHOOT" | "EDIT" | "ERASE"; styleId: string | null; prompt: string | null; creditCost: number;
  status: "PENDING" | "PROCESSING" | "DONE" | "REJECTED" | "FAILED"; inputAssetIds: string[]; outputAssetIds: string[]; errorReason: string | null; createdAt: Date;
}): Job {
  return Job.restore({
    id: r.id, userId: r.userId, type: r.type, styleId: r.styleId ?? undefined, prompt: r.prompt ?? undefined, creditCost: CreditAmount.of(r.creditCost),
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
      create: { id: u.id, email: u.email.value, passwordHash: u.passwordHash, ageConfirmedAt: u.ageConfirmedAt ?? null },
      update: { ageConfirmedAt: u.ageConfirmedAt ?? null },
    });
  }
  async findById(id: string) {
    const r = await this.prisma.db.user.findUnique({ where: { id } });
    return r ? toUser(r) : null;
  }
  async findByEmail(email: string) {
    const r = await this.prisma.db.user.findUnique({ where: { email } });
    return r ? toUser(r) : null;
  }
}

function toUser(r: { id: string; email: string; passwordHash: string; ageConfirmedAt: Date | null }): User {
  return User.restore({ id: r.id, email: Email.of(r.email), passwordHash: r.passwordHash, ageConfirmedAt: r.ageConfirmedAt ?? undefined });
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
}

export class PrismaStyleRepository implements StyleRepository {
  constructor(private readonly prisma: PrismaService) {}
  async listActive(): Promise<StyleSummary[]> {
    const rows = await this.prisma.db.styleTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, creditCost: r.creditCost, previewUrl: r.previewUrl ?? undefined }));
  }
}
