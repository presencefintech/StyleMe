import type { JobStatus, JobType } from "@styleme/shared";
import { CreditAmount } from "../value-objects/credit-amount";
import { InvalidJobTransition } from "../errors";

export interface JobProps {
  id: string;
  userId: string;
  type: JobType;
  styleId?: string;
  /** Tenue essayée (jobs TRYON). */
  garmentId?: string;
  /** Instruction libre (jobs EDIT). */
  prompt?: string;
  creditCost: CreditAmount;
  status: JobStatus;
  inputAssetIds: string[];
  outputAssetIds: string[];
  errorReason?: string;
  /** Renseigné par la persistance uniquement. */
  createdAt?: Date;
}

export class Job {
  private constructor(private props: JobProps) {}

  static create(p: {
    id: string;
    userId: string;
    type: JobType;
    styleId?: string;
    garmentId?: string;
    prompt?: string;
    creditCost: CreditAmount;
    inputAssetIds: string[];
  }): Job {
    return new Job({ ...p, status: "PENDING", outputAssetIds: [] });
  }
  static restore(p: JobProps): Job {
    return new Job({ ...p });
  }

  get id() { return this.props.id; }
  get userId() { return this.props.userId; }
  get type() { return this.props.type; }
  get styleId() { return this.props.styleId; }
  get garmentId() { return this.props.garmentId; }
  get prompt() { return this.props.prompt; }
  get creditCost() { return this.props.creditCost; }
  get status() { return this.props.status; }
  get inputAssetIds() { return [...this.props.inputAssetIds]; }
  get outputAssetIds() { return [...this.props.outputAssetIds]; }
  get errorReason() { return this.props.errorReason; }
  get createdAt() { return this.props.createdAt; }

  markProcessing() {
    this.assert("PENDING");
    this.props.status = "PROCESSING";
  }
  markRejected(reason: string) {
    this.assert("PROCESSING");
    this.props.status = "REJECTED";
    this.props.errorReason = reason;
  }
  markDone(outputs: string[]) {
    this.assert("PROCESSING");
    this.props.outputAssetIds = [...outputs];
    this.props.status = "DONE";
  }
  markFailed(reason: string) {
    this.assert("PROCESSING");
    this.props.status = "FAILED";
    this.props.errorReason = reason;
  }
  /** On ne débite QUE si le job est livré. */
  isBillable(): boolean {
    return this.props.status === "DONE";
  }

  private assert(expected: JobStatus) {
    if (this.props.status !== expected) throw new InvalidJobTransition(this.props.status, expected);
  }
}
