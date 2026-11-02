import type { Operator, PaymentStatus } from "@styleme/shared";
import { InvalidPaymentTransition } from "../errors";

export interface PaymentProps {
  id: string;
  userId: string;
  packId: string;
  credits: number;
  amount: number;
  currency: string;
  phone: string;
  operator: Operator;
  providerRef: string;
  status: PaymentStatus;
}

export class Payment {
  private constructor(private props: PaymentProps) {}
  static create(p: Omit<PaymentProps, "status">): Payment {
    return new Payment({ ...p, status: "PENDING" });
  }
  static restore(p: PaymentProps): Payment {
    return new Payment({ ...p });
  }

  get id() { return this.props.id; }
  get userId() { return this.props.userId; }
  get packId() { return this.props.packId; }
  get credits() { return this.props.credits; }
  get amount() { return this.props.amount; }
  get currency() { return this.props.currency; }
  get phone() { return this.props.phone; }
  get operator() { return this.props.operator; }
  get providerRef() { return this.props.providerRef; }
  get status() { return this.props.status; }

  markSucceeded() {
    this.assertPending();
    this.props.status = "SUCCEEDED";
  }
  markFailed() {
    this.assertPending();
    this.props.status = "FAILED";
  }

  private assertPending() {
    if (this.props.status !== "PENDING") throw new InvalidPaymentTransition(`Payment is ${this.props.status}`);
  }
}
