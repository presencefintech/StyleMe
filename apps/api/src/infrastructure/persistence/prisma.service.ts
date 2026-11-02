import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import type { UnitOfWork } from "../../domain/ports";

export type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly root = new PrismaClient();
  private readonly tx = new AsyncLocalStorage<Prisma.TransactionClient>();

  /** Client courant : celui de la transaction si on est dans `PrismaUnitOfWork.run`. */
  get db(): Db {
    return this.tx.getStore() ?? this.root;
  }

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.root.$transaction((client) => this.tx.run(client, work));
  }

  async onModuleDestroy() {
    await this.root.$disconnect();
  }
}

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}
  run<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.runInTransaction(work);
  }
}
