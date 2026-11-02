import { err, JOB_BASE_COST, ok, type JobType, type Result } from "@styleme/shared";
import { Job } from "../../../domain/entities/job";
import { AgeNotConfirmed, AssetNotFound, DomainError, InsufficientCredits, UserNotFound } from "../../../domain/errors";
import type {
  AssetRepository,
  CreditLedgerRepository,
  IdGenerator,
  JobQueue,
  JobRepository,
  UserRepository,
} from "../../../domain/ports";
import { CreditAmount } from "../../../domain/value-objects/credit-amount";

export interface CreateJobInput {
  userId: string;
  type: JobType;
  styleId?: string;
  inputAssetIds: string[];
}

export class CreateJob {
  constructor(
    private readonly users: UserRepository,
    private readonly jobs: JobRepository,
    private readonly ledger: CreditLedgerRepository,
    private readonly assets: AssetRepository,
    private readonly queue: JobQueue,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateJobInput): Promise<Result<Job, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    if (!user.isAgeConfirmed) return err(new AgeNotConfirmed());

    // Un utilisateur ne peut utiliser que ses propres assets.
    const found = await this.assets.findByIds(input.inputAssetIds);
    const allOwned =
      found.length === new Set(input.inputAssetIds).size && found.every((a) => a.userId === input.userId);
    if (!allOwned) return err(new AssetNotFound());

    const cost = CreditAmount.of(JOB_BASE_COST[input.type]);
    const balance = await this.ledger.balanceOf(input.userId);
    if (!balance.isGreaterOrEqual(cost)) return err(new InsufficientCredits());

    const job = Job.create({
      id: this.ids.next(),
      userId: input.userId,
      type: input.type,
      styleId: input.styleId,
      creditCost: cost,
      inputAssetIds: input.inputAssetIds,
    });
    await this.jobs.save(job);
    await this.queue.enqueue(job.id);
    return ok(job);
  }
}
