import { ACCESSORIES, BACKGROUND_PRESETS, err, HAIRSTYLES, JOB_BASE_COST, lookCost, MAKEUPS, MAX_PROMPT_LENGTH, ok, type JobType, type Result } from "@styleme/shared";
import { Job } from "../../../domain/entities/job";
import { AgeNotConfirmed, AssetNotFound, DomainError, GarmentNotFound, HairstyleNotFound, InsufficientCredits, InvalidLook, InvalidPrompt, JobNotFound, UserNotFound } from "../../../domain/errors";
import type {
  AssetRecord,
  AssetRepository,
  CreditLedgerRepository,
  GarmentRepository,
  IdGenerator,
  JobQueue,
  JobRepository,
  UserRepository,
} from "../../../domain/ports";
import { CreditAmount } from "../../../domain/value-objects/credit-amount";
import { RESULTS_BUCKET } from "./get-job";

export interface CreateJobInput {
  userId: string;
  type: JobType;
  styleId?: string;
  prompt?: string;
  /** Photos téléversées. Vide si `fromJobId` est fourni. */
  inputAssetIds: string[];
  /** Retouche enchaînée : part du RÉSULTAT d'un job précédent (EDIT uniquement). */
  fromJobId?: string;
  /** Essayage virtuel : tenue du catalogue (TRYON uniquement). */
  garmentId?: string;
  /** Coiffure du catalogue (HAIRSTYLE uniquement). */
  hairstyleId?: string;
  /** Look composé (LOOK) : maquillage et accessoires ; styleId = l'occasion (fond). */
  makeupId?: string;
  accessoryIds?: string[];
}

export class CreateJob {
  constructor(
    private readonly users: UserRepository,
    private readonly jobs: JobRepository,
    private readonly ledger: CreditLedgerRepository,
    private readonly assets: AssetRepository,
    private readonly queue: JobQueue,
    private readonly ids: IdGenerator,
    private readonly garments?: GarmentRepository,
  ) {}

  async execute(input: CreateJobInput): Promise<Result<Job, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    if (!user.isAgeConfirmed) return err(new AgeNotConfirmed());

    const prompt = input.prompt?.trim();
    if (input.type === "EDIT" && (!prompt || prompt.length > MAX_PROMPT_LENGTH)) return err(new InvalidPrompt());

    // Source de l'image : upload de l'utilisateur, ou résultat d'un de ses jobs précédents.
    // Gomme : exactement [photo normalisée, masque] issus de la sélection.
    if (input.type === "ERASE" && (input.inputAssetIds.length !== 2 || input.fromJobId)) return err(new AssetNotFound());

    // Essayage : une tenue ACTIVE du catalogue + exactement une photo de la personne.
    if (input.type === "TRYON") {
      if (!input.garmentId || input.inputAssetIds.length !== 1 || input.fromJobId || !this.garments) return err(new GarmentNotFound());
      if (!(await this.garments.findActiveById(input.garmentId))) return err(new GarmentNotFound());
    }

    // Coiffure : une coiffure du catalogue ; la photo vient d'un upload OU du résultat d'un job précédent (ex. essayage).
    if (input.type === "HAIRSTYLE" && !HAIRSTYLES.some((h) => h.id === input.hairstyleId)) return err(new HairstyleNotFound());

    // Look composé : une photo + au moins une étape, chacune connue du catalogue. Le prix est la somme des étapes choisies.
    if (input.type === "LOOK") {
      const accessoryIds = input.accessoryIds ?? [];
      const steps = input.garmentId || input.hairstyleId || input.makeupId || accessoryIds.length > 0 || input.styleId;
      if (!steps || input.inputAssetIds.length !== 1 || input.fromJobId) return err(new InvalidLook());
      if (input.hairstyleId && !HAIRSTYLES.some((h) => h.id === input.hairstyleId)) return err(new HairstyleNotFound());
      if (input.makeupId && !MAKEUPS.some((m) => m.id === input.makeupId)) return err(new InvalidLook());
      if (new Set(accessoryIds).size !== accessoryIds.length || !accessoryIds.every((id) => ACCESSORIES.some((a) => a.id === id))) return err(new InvalidLook());
      if (input.styleId && !(input.styleId in BACKGROUND_PRESETS)) return err(new InvalidLook());
      if (input.garmentId && !(await this.garments?.findActiveById(input.garmentId))) return err(new GarmentNotFound());
    }

    let inputAssetIds = input.inputAssetIds;
    let chained: AssetRecord | undefined;
    /** Coiffure enchaînée après un essayage : le look garde sa tenue. */
    let inheritedGarmentId: string | undefined;
    if (input.fromJobId) {
      if (input.type !== "EDIT" && input.type !== "HAIRSTYLE") return err(new AssetNotFound());
      const prev = await this.jobs.findById(input.fromJobId);
      const outputKey = prev?.outputAssetIds[0];
      // 404 aussi pour le job d'un autre utilisateur : on ne révèle pas son existence.
      if (!prev || prev.userId !== input.userId || prev.status !== "DONE" || !outputKey) return err(new JobNotFound());
      if (input.type === "HAIRSTYLE") inheritedGarmentId = prev.garmentId;
      // Le même résultat peut être repris plusieurs fois : on réutilise son enregistrement (bucket + key uniques).
      const existing = await this.assets.findByRef(RESULTS_BUCKET, outputKey);
      if (existing && existing.userId !== input.userId) return err(new AssetNotFound());
      if (!existing) chained = { id: this.ids.next(), userId: input.userId, kind: "RESULT", bucket: RESULTS_BUCKET, key: outputKey };
      inputAssetIds = [existing?.id ?? chained!.id];
    } else {
      // Un utilisateur ne peut utiliser que ses propres assets.
      const found = await this.assets.findByIds(inputAssetIds);
      const allOwned = inputAssetIds.length > 0 && found.length === new Set(inputAssetIds).size && found.every((a) => a.userId === input.userId);
      if (!allOwned) return err(new AssetNotFound());
    }

    const cost = CreditAmount.of(
      input.type === "LOOK"
        ? lookCost({ garmentId: input.garmentId, hairstyleId: input.hairstyleId, makeupId: input.makeupId, accessoryIds: input.accessoryIds, styleId: input.styleId })
        : JOB_BASE_COST[input.type],
    );
    const balance = await this.ledger.balanceOf(input.userId);
    if (!balance.isGreaterOrEqual(cost)) return err(new InsufficientCredits());

    if (chained) await this.assets.save(chained);
    const job = Job.create({
      id: this.ids.next(),
      userId: input.userId,
      type: input.type,
      styleId: input.styleId,
      garmentId: input.type === "TRYON" || input.type === "LOOK" ? input.garmentId : inheritedGarmentId,
      hairstyleId: input.type === "HAIRSTYLE" || input.type === "LOOK" ? input.hairstyleId : undefined,
      makeupId: input.type === "LOOK" ? input.makeupId : undefined,
      accessoryIds: input.type === "LOOK" ? [...(input.accessoryIds ?? [])] : undefined,
      prompt: input.type === "EDIT" ? prompt : undefined,
      creditCost: cost,
      inputAssetIds,
    });
    await this.jobs.save(job);
    await this.queue.enqueue(job.id);
    return ok(job);
  }
}
