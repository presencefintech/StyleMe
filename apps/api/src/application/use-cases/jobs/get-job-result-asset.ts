import { err, ok, type Result } from "@styleme/shared";
import { AssetNotFound, DomainError, JobNotFound } from "../../../domain/errors";
import type { AssetRepository, IdGenerator, JobRepository, StorageService } from "../../../domain/ports";
import { RESULTS_BUCKET } from "./get-job";

/**
 * Fait du résultat d'un job une photo réutilisable comme source (ex. gommer un autre objet sur le résultat).
 * Idempotent : un même fichier (bucket + key) n'a qu'un seul enregistrement.
 */
export class GetJobResultAsset {
  constructor(
    private readonly jobs: JobRepository,
    private readonly assets: AssetRepository,
    private readonly storage: StorageService,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { userId: string; jobId: string }): Promise<Result<{ assetId: string; url: string }, DomainError>> {
    const job = await this.jobs.findById(input.jobId);
    const key = job?.outputAssetIds[0];
    if (!job || job.userId !== input.userId || job.status !== "DONE" || !key) return err(new JobNotFound());

    const existing = await this.assets.findByRef(RESULTS_BUCKET, key);
    if (existing && existing.userId !== input.userId) return err(new AssetNotFound());
    const assetId = existing?.id ?? this.ids.next();
    if (!existing) await this.assets.save({ id: assetId, userId: input.userId, kind: "RESULT", bucket: RESULTS_BUCKET, key });

    const { url } = await this.storage.presignDownload({ bucket: RESULTS_BUCKET, key }, 300);
    return ok({ assetId, url });
  }
}
