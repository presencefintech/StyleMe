import { err, ok, type Result } from "@styleme/shared";
import type { Job } from "../../../domain/entities/job";
import { DomainError, JobNotFound } from "../../../domain/errors";
import type { JobRepository, StorageService } from "../../../domain/ports";

export const RESULTS_BUCKET = "results";

export class GetJob {
  constructor(
    private readonly jobs: JobRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(input: { userId: string; jobId: string }): Promise<Result<{ job: Job; outputUrls: string[] }, DomainError>> {
    const job = await this.jobs.findById(input.jobId);
    // 404 aussi pour le job d'un autre utilisateur : on ne révèle pas son existence.
    if (!job || job.userId !== input.userId) return err(new JobNotFound());
    const outputUrls =
      job.status === "DONE"
        ? await Promise.all(job.outputAssetIds.map(async (key) => (await this.storage.presignDownload({ bucket: RESULTS_BUCKET, key }, 300)).url))
        : [];
    return ok({ job, outputUrls });
  }
}
