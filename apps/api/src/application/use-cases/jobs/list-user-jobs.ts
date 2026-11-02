import { ok, type Result } from "@styleme/shared";
import type { Job } from "../../../domain/entities/job";
import type { DomainError } from "../../../domain/errors";
import type { JobRepository, Page } from "../../../domain/ports";

export class ListUserJobs {
  constructor(private readonly jobs: JobRepository) {}

  async execute(input: { userId: string; cursor?: string; limit?: number }): Promise<Result<Page<Job>, DomainError>> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    return ok(await this.jobs.listByUser(input.userId, { cursor: input.cursor, limit }));
  }
}
