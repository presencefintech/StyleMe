import { RESULT_RETENTION_DAYS, SOURCE_RETENTION_DAYS } from "@styleme/shared";
import type { AssetRepository, Clock, JobRepository, StorageService } from "../../../domain/ports";
import { RESULTS_BUCKET } from "../jobs/get-job";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Plafond par passage : un arriéré se résorbe sur plusieurs passages (la purge tourne toutes les heures). */
const BATCH = 200;

export interface PurgeReport {
  sources: number;
  results: number;
  jobs: number;
  failures: number;
}

/**
 * Rétention des photos : les photos envoyées sont supprimées après SOURCE_RETENTION_DAYS jours, les résultats
 * (et l'historique correspondant) après RESULT_RETENTION_DAYS jours.
 * Idempotent : un fichier qui n'a pas pu être supprimé reste en file et sera retenté au passage suivant.
 */
export class PurgeExpiredData {
  constructor(
    private readonly assets: AssetRepository,
    private readonly jobs: JobRepository,
    private readonly storage: StorageService,
    private readonly clock: Clock,
    private readonly log: (message: string) => void = () => {},
  ) {}

  async execute(): Promise<PurgeReport> {
    const now = this.clock.now();
    const sourceCutoff = new Date(now.getTime() - SOURCE_RETENTION_DAYS * DAY_MS);
    const resultCutoff = new Date(now.getTime() - RESULT_RETENTION_DAYS * DAY_MS);
    const report: PurgeReport = { sources: 0, results: 0, jobs: 0, failures: 0 };

    report.sources = await this.purgeAssets("SOURCE", sourceCutoff, now, report);
    // "RESULT" = résultats réutilisés comme source, photos normalisées et masques de la gomme.
    report.results = await this.purgeAssets("RESULT", resultCutoff, now, report);

    const jobs = await this.jobs.listFinishedBefore(resultCutoff, BATCH);
    const purgedJobs: string[] = [];
    for (const job of jobs) {
      const stored = await this.deleteAll(job.outputAssetIds.map((key) => ({ bucket: RESULTS_BUCKET, key })), report);
      if (stored) purgedJobs.push(job.id);
    }
    if (purgedJobs.length > 0) await this.jobs.deleteMany(purgedJobs);
    report.jobs = purgedJobs.length;

    if (report.sources + report.results + report.jobs + report.failures > 0) {
      this.log(`rétention : ${report.sources} photo(s) source, ${report.results} résultat(s), ${report.jobs} job(s) supprimés, ${report.failures} échec(s)`);
    }
    return report;
  }

  private async purgeAssets(kind: "SOURCE" | "RESULT", cutoff: Date, now: Date, report: PurgeReport): Promise<number> {
    const expired = await this.assets.listExpired(kind, cutoff, BATCH);
    const done: string[] = [];
    for (const asset of expired) {
      if (await this.deleteAll([{ bucket: asset.bucket, key: asset.key }], report)) done.push(asset.id);
    }
    if (done.length > 0) await this.assets.markDeleted(done, now);
    return done.length;
  }

  /** Vrai si tous les fichiers ont été supprimés (un fichier déjà absent compte comme supprimé). */
  private async deleteAll(refs: { bucket: string; key: string }[], report: PurgeReport): Promise<boolean> {
    let allDeleted = true;
    for (const ref of refs) {
      try {
        await this.storage.delete(ref);
      } catch {
        report.failures += 1;
        allDeleted = false;
      }
    }
    return allDeleted;
  }
}
