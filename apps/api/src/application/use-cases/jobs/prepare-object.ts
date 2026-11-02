import { err, ok, type Result } from "@styleme/shared";
import { AgeNotConfirmed, AssetNotFound, DomainError, UserNotFound } from "../../../domain/errors";
import type { AssetRepository, ObjectSelector, UserRepository } from "../../../domain/ports";

/**
 * Gomme magique, préchauffage : dès que la photo est envoyée, on lance son analyse en arrière-plan pour que le
 * premier clic soit rapide. Au mieux : une panne du service d'analyse n'empêche rien (le clic la signalera).
 */
export class PrepareObject {
  constructor(
    private readonly users: UserRepository,
    private readonly assets: AssetRepository,
    private readonly selector: ObjectSelector,
  ) {}

  async execute(input: { userId: string; assetId: string }): Promise<Result<void, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    if (!user.isAgeConfirmed) return err(new AgeNotConfirmed());

    const [asset] = await this.assets.findByIds([input.assetId]);
    if (!asset || asset.userId !== input.userId || asset.kind === "SELFIE_TRAINING") return err(new AssetNotFound());

    try {
      await this.selector.prepare({ bucket: asset.bucket, key: asset.key });
    } catch (e) {
      if (e instanceof DomainError) return err(e); // ex. image illisible
      // panne du service d'analyse : sans gravité ici
    }
    return ok(undefined);
  }
}
