import { err, OCCASION_PROMPTS, ok, type Result } from "@styleme/shared";
import { DomainError, JobNotFound, ProviderFailure, ProviderRejectedContent } from "../../../domain/errors";
import type {
  AssetRepository,
  BackgroundService,
  CreditLedgerRepository,
  ImageEditor,
  ImageEnhancer,
  JobRepository,
  ModerationService,
  ObjectEraser,
  UnitOfWork,
} from "../../../domain/ports";
import type { ImageRef } from "../../../domain/value-objects/image-ref";

export interface RunOptions {
  /** Faux = échec provider non définitif (le worker rejouera) : le job reste PROCESSING. */
  isLastAttempt?: boolean;
}

export class RunEnhancementJob {
  constructor(
    private readonly jobs: JobRepository,
    private readonly ledger: CreditLedgerRepository,
    private readonly assets: AssetRepository,
    private readonly moderation: ModerationService,
    private readonly enhancer: ImageEnhancer,
    private readonly background: BackgroundService,
    private readonly editor: ImageEditor,
    private readonly eraser: ObjectEraser,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(jobId: string, opts: RunOptions = {}): Promise<Result<void, DomainError>> {
    const isLastAttempt = opts.isLastAttempt ?? true;
    const job = await this.jobs.findById(jobId);
    if (!job) return err(new JobNotFound());

    try {
      // PROCESSING = reprise après un échec provider non définitif.
      if (job.status !== "PROCESSING") job.markProcessing();
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
    await this.jobs.save(job);

    // Gomme : [photo normalisée, masque]. Autres jobs : [photo].
    const wanted = job.type === "ERASE" ? job.inputAssetIds.slice(0, 2) : job.inputAssetIds.slice(0, 1);
    const found = await this.assets.findByIds(wanted);
    const byId = new Map(found.map((a) => [a.id, a]));
    const asset = byId.get(wanted[0] ?? "");
    const maskAsset = byId.get(wanted[1] ?? "");
    if (!asset || (job.type === "ERASE" && !maskAsset)) {
      job.markFailed("input_asset_missing");
      await this.jobs.save(job);
      return err(new ProviderFailure("input_asset_missing"));
    }
    const input: ImageRef = { bucket: asset.bucket, key: asset.key };

    // Toute panne de provider (IA OU modération) : jamais de livraison sans modération, jamais de débit.
    const failProvider = async (e: unknown): Promise<Result<void, DomainError>> => {
      const reason = e instanceof Error ? e.message : "provider_error";
      if (isLastAttempt) {
        job.markFailed(reason);
        await this.jobs.save(job);
      }
      return err(new ProviderFailure(reason));
    };

    // 1. Modération ENTRÉE — bloquant, 0 crédit si rejet
    let out: ImageRef;
    try {
      const modIn = await this.moderation.check(input, "input");
      if (!modIn.approved || modIn.minorRisk) {
        job.markRejected("moderation_input");
        await this.jobs.save(job);
        return ok(undefined);
      }

      // 2. Traitement IA
      if (job.type === "ERASE" && maskAsset) {
        // Gomme : l objet sélectionné est effacé, le reste de la photo reste inchangé.
        out = await this.eraser.erase(input, { bucket: maskAsset.bucket, key: maskAsset.key });
      } else {
      // Génératif (retouche libre, ou occasion avec une consigne dédiée) : seul le fond/la demande change, le sujet est conservé.
      const instruction = job.type === "EDIT" ? job.prompt : job.styleId ? OCCASION_PROMPTS[job.styleId] : undefined;
      if (instruction !== undefined) {
        out = await this.editor.edit(input, instruction);
      } else {
        // Pas de consigne pour ce style : pipeline local (agrandissement, détourage, fond en dégradé).
        out = await this.enhancer.upscale(input);
        out = await this.enhancer.restoreFace(out);
        out = await this.background.remove(out);
        if (job.styleId) out = await this.background.applyTemplate(out, job.styleId);
      }
      }

      // 3. Modération SORTIE
      const modOut = await this.moderation.check(out, "output");
      if (!modOut.approved || modOut.minorRisk) {
        job.markRejected("moderation_output");
        await this.jobs.save(job);
        return ok(undefined);
      }
    } catch (e) {
      if (e instanceof ProviderRejectedContent) {
        // Refus de contenu par le fournisseur : définitif (pas de réessai), 0 crédit.
        job.markRejected("provider_content_flagged");
        await this.jobs.save(job);
        return ok(undefined);
      }
      return failProvider(e);
    }

    // 4. Débit + livraison ATOMIQUES
    await this.unitOfWork.run(async () => {
      job.markDone([out.key]);
      await this.jobs.save(job);
      if (job.isBillable()) {
        await this.ledger.append({ userId: job.userId, amount: -job.creditCost.value, reason: `job:${job.id}` });
      }
    });
    return ok(undefined);
  }
}
