import { err, ok, type Result } from "@styleme/shared";
import type { Job } from "../../../domain/entities/job";
import { DomainError, JobNotFound } from "../../../domain/errors";
import type { AssetRepository, JobRepository, StorageService } from "../../../domain/ports";

export const RESULTS_BUCKET = "results";

export class GetJob {
  constructor(
    private readonly jobs: JobRepository,
    private readonly storage: StorageService,
    private readonly assets: AssetRepository,
  ) {}

  async execute(input: { userId: string; jobId: string }): Promise<Result<{ job: Job; outputUrls: string[]; sourceUrl?: string }, DomainError>> {
    const job = await this.jobs.findById(input.jobId);
    // 404 aussi pour le job d'un autre utilisateur : on ne révèle pas son existence.
    if (!job || job.userId !== input.userId) return err(new JobNotFound());
    const outputUrls =
      job.status === "DONE"
        ? await Promise.all(job.outputAssetIds.map(async (key) => (await this.storage.presignDownload({ bucket: RESULTS_BUCKET, key }, 300)).url))
        : [];
    return ok({ job, outputUrls, sourceUrl: job.status === "DONE" ? await this.sourceUrl(job) : undefined });
  }

  /** Photo d'origine pour la comparaison avant/après ; absente si elle a été purgée (rétention). Le 1er fichier est la photo (le 2e, pour ERASE, est le masque). */
  private async sourceUrl(job: Job): Promise<string | undefined> {
    const id = job.inputAssetIds[0];
    if (!id) return undefined;
    try {
      const [asset] = await this.assets.findByIds([id]);
      if (!asset || asset.userId !== job.userId) return undefined;
      return (await this.storage.presignDownload({ bucket: asset.bucket, key: asset.key }, 300)).url;
    } catch {
      return undefined; // la comparaison est un confort : ne jamais faire échouer l'affichage du résultat
    }
  }
}
