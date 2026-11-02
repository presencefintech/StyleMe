import { err, ok, type Result } from "@styleme/shared";
import type { Payment } from "../../../domain/entities/payment";
import { DomainError, PaymentNotFound } from "../../../domain/errors";
import type { PaymentRepository } from "../../../domain/ports";

export class GetPayment {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(input: { userId: string; paymentId: string }): Promise<Result<Payment, DomainError>> {
    const p = await this.payments.findById(input.paymentId);
    if (!p || p.userId !== input.userId) return err(new PaymentNotFound());
    return ok(p);
  }
}
