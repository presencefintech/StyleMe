import { CREDIT_PACKS, err, ok, type Operator, type Result } from "@styleme/shared";
import { Payment } from "../../../domain/entities/payment";
import { DomainError, InvalidPhoneNumber, PackNotFound } from "../../../domain/errors";
import type { IdGenerator, PaymentGateway, PaymentRepository } from "../../../domain/ports";
import { PhoneNumber } from "../../../domain/value-objects/phone-number";

export interface InitiatePaymentInput {
  userId: string;
  packId: string;
  phone: string;
  operator: Operator;
}

export class InitiatePayment {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: InitiatePaymentInput): Promise<Result<Payment, DomainError>> {
    const pack = CREDIT_PACKS.find((p) => p.id === input.packId);
    if (!pack) return err(new PackNotFound());

    let phone: PhoneNumber;
    try {
      phone = PhoneNumber.of(input.phone);
    } catch (e) {
      if (e instanceof InvalidPhoneNumber) return err(e);
      throw e;
    }

    const paymentId = this.ids.next();
    const { providerRef } = await this.gateway.initiate({
      paymentId,
      amount: pack.price,
      currency: pack.currency,
      phone: phone.value,
      operator: input.operator,
    });
    const payment = Payment.create({
      id: paymentId,
      userId: input.userId,
      packId: pack.id,
      credits: pack.credits,
      amount: pack.price,
      currency: pack.currency,
      phone: phone.value,
      operator: input.operator,
      providerRef,
    });
    await this.payments.save(payment);
    return ok(payment);
  }
}
