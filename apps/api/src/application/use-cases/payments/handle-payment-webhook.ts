import { err, ok, type Result } from "@styleme/shared";
import { DomainError, InvalidPaymentSignature, PaymentNotFound } from "../../../domain/errors";
import type { CreditLedgerRepository, PaymentGateway, PaymentRepository, UnitOfWork } from "../../../domain/ports";

export interface HandlePaymentWebhookInput {
  payload: unknown;
  signature: string;
}

export class HandlePaymentWebhook {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly ledger: CreditLedgerRepository,
    private readonly gateway: PaymentGateway,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: HandlePaymentWebhookInput): Promise<Result<void, DomainError>> {
    if (!this.gateway.verifySignature(input.payload, input.signature)) return err(new InvalidPaymentSignature());

    const event = this.gateway.parseWebhook(input.payload);
    const payment = await this.payments.findByProviderRef(event.providerRef);
    if (!payment) return err(new PaymentNotFound());

    // Idempotence : un paiement déjà traité n'est jamais re-crédité.
    if (payment.status !== "PENDING") return ok(undefined);

    if (!event.success) {
      payment.markFailed();
      await this.payments.save(payment);
      return ok(undefined);
    }

    await this.unitOfWork.run(async () => {
      payment.markSucceeded();
      await this.payments.save(payment);
      await this.ledger.append({
        userId: payment.userId,
        amount: payment.credits,
        reason: `payment:${payment.id}`,
        paymentId: payment.id,
      });
    });
    return ok(undefined);
  }
}
