import { ok, type Result } from "@styleme/shared";
import type { DomainError } from "../../../domain/errors";
import type { CreditLedgerRepository } from "../../../domain/ports";

export class GetCreditBalance {
  constructor(private readonly ledger: CreditLedgerRepository) {}

  async execute(userId: string): Promise<Result<number, DomainError>> {
    return ok((await this.ledger.balanceOf(userId)).value);
  }
}
