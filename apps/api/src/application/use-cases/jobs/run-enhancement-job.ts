import type { Job } from "../../../domain/entities/job";
import { ACCESSORIES, accessoriesPrompt, err, HAIR_CLEAR_PROMPT, HAIRSTYLES, hairstylePrompt, MAKEUPS, makeupPrompt, OCCASION_PROMPTS, ok, type Result } from "@styleme/shared";
import { DomainError, JobNotFound, ProviderFailure, ProviderRejectedContent } from "../../../domain/errors";
import type {
  AssetRepository,
  BackgroundService,
  FaceLock,
  MakeupBlender,
  CreditLedgerRepository,
  GarmentRepository,
  ImageEditor,
  ImageEnhancer,
  JobRepository,
  ModerationService,
  ObjectEraser,
  UnitOfWork,
  VirtualTryOn,
} from "../../../domain/ports";
import type { ImageRef } from "../../../domain/value-objects/image-ref";

export interface RunOptions {
  /** Faux = échec provider non définitif (le worker rejouera) : le job reste PROCESSING. */
  isLastAttempt?: boolean;
}

export interface RunJobConfig {
  /** Agrandit/affine le résultat des jobs génératifs (occasions, retouche). Désactivé par défaut. */
  upscaleResults?: boolean;
}

/** Ce qu'il faut pour les jobs TRYON. Absent = les essayages échouent proprement (0 crédit). */
export interface TryOnDeps {
  garments: GarmentRepository;
  engine: VirtualTryOn;
}

/** Ce qu'il faut pour les jobs HAIRSTYLE : sans verrou du visage, on refuse de livrer (l'identité est la règle absolue). */
export interface HairstyleDeps {
  faceLock: FaceLock;
  /** Supprime un fichier intermédiaire (au mieux). */
  discard?: (ref: ImageRef) => Promise<void>;
  /** Maquillage (jobs LOOK avec makeupId). */
  makeupBlender?: MakeupBlender;
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
    private readonly config: RunJobConfig = {},
    private readonly tryOn?: TryOnDeps,
    private readonly hairstyle?: HairstyleDeps,
  ) {}

  /** Netteté supplémentaire, au mieux : si l'agrandissement échoue, on livre le résultat non agrandi (jamais d'échec ni de rejeu pour ça). */
  private async tryUpscale(out: ImageRef): Promise<ImageRef> {
    try {
      return await this.enhancer.upscale(out);
    } catch {
      return out;
    }
  }

  /** Essayage virtuel : habille la personne de la tenue du catalogue (visage, pose et décor conservés). */
  private async runTryOn(garmentId: string | undefined, person: ImageRef): Promise<ImageRef> {
    if (!this.tryOn) throw new Error("Essayage non configuré : définir REPLICATE_TOKEN sur l'API");
    const garment = garmentId ? await this.tryOn.garments.findActiveById(garmentId) : null;
    if (!garment) throw new Error("garment_missing");
    return this.tryOn.engine.tryOn(person, { bucket: garment.bucket, key: garment.key }, { category: garment.category, description: garment.description });
  }

  /** Coiffure : le modèle d'édition change les cheveux, puis le visage d'origine est recollé par-dessus. */
  private async runHairstyle(hairstyleId: string | undefined, input: ImageRef): Promise<ImageRef> {
    if (!this.hairstyle) throw new Error("Coiffure non configurée : définir REPLICATE_TOKEN et SIGHTENGINE_* sur l'API");
    const style = HAIRSTYLES.find((h) => h.id === hairstyleId);
    if (!style) throw new Error("hairstyle_missing");
    // Deux passes : crâne dégagé, puis nouvelle coiffure. Le visage d'origine est recollé à la fin.
    const cleared = await this.editor.edit(input, HAIR_CLEAR_PROMPT);
    let styled: ImageRef;
    try {
      styled = await this.editor.edit(cleared, hairstylePrompt(style));
    } finally {
      await this.hairstyle.discard?.(cleared).catch(() => undefined);
    }
    return this.hairstyle.faceLock.restoreFace(input, styled);
  }

  private async discardAll(refs: ImageRef[]) {
    for (const ref of refs) await this.hairstyle?.discard?.(ref).catch(() => undefined);
  }

  /** Maquillage : l'IA maquille, puis on ne garde que sa couleur sur le visage (structure d'origine). */
  private async runMakeup(makeupId: string, input: ImageRef): Promise<ImageRef> {
    const deps = this.hairstyle;
    const style = MAKEUPS.find((m) => m.id === makeupId);
    if (!deps?.makeupBlender || !style) throw new Error("Maquillage non configuré : définir REPLICATE_TOKEN et SIGHTENGINE_* sur l'API");
    const edited = await this.editor.edit(input, makeupPrompt(style));
    try {
      return await deps.makeupBlender.blend(input, edited);
    } finally {
      await deps.discard?.(edited).catch(() => undefined);
    }
  }

  /** Accessoires : une seule retouche pour tous, puis le visage d'origine est recollé. */
  private async runAccessories(ids: string[], input: ImageRef): Promise<ImageRef> {
    if (!this.hairstyle) throw new Error("Accessoires non configurés : définir REPLICATE_TOKEN et SIGHTENGINE_* sur l'API");
    const list = ids.flatMap((id) => ACCESSORIES.filter((a) => a.id === id));
    const edited = await this.editor.edit(input, accessoriesPrompt(list));
    return this.hairstyle.faceLock.restoreFace(input, edited);
  }

  /** Occasion : on change le fond selon l'événement, puis le visage d'origine est recollé. */
  private async runOccasion(styleId: string, input: ImageRef): Promise<ImageRef> {
    const instruction = OCCASION_PROMPTS[styleId];
    if (!this.hairstyle || !instruction) throw new Error("Occasion non configurée : définir REPLICATE_TOKEN et SIGHTENGINE_* sur l'API");
    const edited = await this.editor.edit(input, instruction);
    return this.hairstyle.faceLock.restoreFace(input, edited);
  }

  /**
   * Look composé : les étapes choisies s'enchaînent sur la même photo, dans l'ordre tenue, coiffure, maquillage, accessoires, fond.
   * Chaque étape part du résultat de la précédente ; les fichiers intermédiaires sont supprimés (aussi en cas d'échec).
   */
  private async runLook(job: Job, input: ImageRef): Promise<ImageRef> {
    let current = input;
    const temps: ImageRef[] = [];
    const advance = (next: ImageRef) => {
      if (current !== input) temps.push(current);
      current = next;
    };
    try {
      if (job.garmentId) advance(await this.runTryOn(job.garmentId, current));
      if (job.hairstyleId) advance(await this.runHairstyle(job.hairstyleId, current));
      if (job.makeupId) advance(await this.runMakeup(job.makeupId, current));
      if (job.accessoryIds.length > 0) advance(await this.runAccessories(job.accessoryIds, current));
      if (job.styleId) advance(await this.runOccasion(job.styleId, current));
    } catch (e) {
      await this.discardAll(current !== input ? [...temps, current] : temps);
      throw e;
    }
    await this.discardAll(temps);
    return current;
  }

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
      } else if (job.type === "TRYON") {
        out = await this.runTryOn(job.garmentId, input);
      } else if (job.type === "LOOK") {
        out = await this.runLook(job, input);
      } else if (job.type === "HAIRSTYLE") {
        out = await this.runHairstyle(job.hairstyleId, input);
      } else {
      // Génératif (retouche libre, ou occasion avec une consigne dédiée) : seul le fond/la demande change, le sujet est conservé.
      const instruction = job.type === "EDIT" ? job.prompt : job.styleId ? OCCASION_PROMPTS[job.styleId] : undefined;
      if (instruction !== undefined) {
        out = await this.editor.edit(input, instruction);
        if (this.config.upscaleResults) out = await this.tryUpscale(out);
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
