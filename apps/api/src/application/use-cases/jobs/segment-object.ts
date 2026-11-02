import { err, ok, type Result } from "@styleme/shared";
import { AgeNotConfirmed, AssetNotFound, DomainError, NoObjectFound, UserNotFound } from "../../../domain/errors";
import type { AssetRepository, ObjectSelector, SegmentTarget, UserRepository } from "../../../domain/ports";

export interface SegmentObjectOutput {
  /** À renvoyer pour confirmer cette sélection (CommitSelection). */
  selectionId: string;
  /** Aperçu en data URL (photo assombrie, objet entouré de blanc) : s'affiche instantanément. */
  overlayUrl: string;
}

/**
 * Gomme magique, étape 1 : l'utilisateur touche (ou survole) un objet, on renvoie un aperçu.
 * Volontairement sans effet de bord (rien n'est enregistré, rien n'est envoyé au stockage) : c'est ce qui
 * le rend instantané, et permet de l'appeler à chaque déplacement de la souris.
 */
export class SegmentObject {
  constructor(
    private readonly users: UserRepository,
    private readonly assets: AssetRepository,
    private readonly selector: ObjectSelector,
  ) {}

  /** `x`/`y` (un clic) OU `box` (un rectangle tracé à la main). */
  async execute(input: {
    userId: string;
    assetId: string;
    x?: number;
    y?: number;
    box?: { x0: number; y0: number; x1: number; y1: number };
  }): Promise<Result<SegmentObjectOutput, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    if (!user.isAgeConfirmed) return err(new AgeNotConfirmed());

    const [asset] = await this.assets.findByIds([input.assetId]);
    // Une photo d'entraînement (selfies) n'est pas éditable ici ; 404 pour l'asset d'autrui.
    if (!asset || asset.userId !== input.userId || asset.kind === "SELFIE_TRAINING") return err(new AssetNotFound());

    const target: SegmentTarget | null = input.box ? { box: input.box } : input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : null;
    if (!target) return err(new NoObjectFound("Aucune zone désignée"));

    try {
      return ok(await this.selector.select({ bucket: asset.bucket, key: asset.key }, target));
    } catch (e) {
      if (e instanceof DomainError) return err(e); // ex. NoObjectFound : cas attendu, pas une panne
      throw e;
    }
  }
}
