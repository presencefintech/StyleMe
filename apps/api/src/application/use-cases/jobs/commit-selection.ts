import { err, ok, type Result } from "@styleme/shared";
import { AgeNotConfirmed, AssetNotFound, DomainError, UserNotFound } from "../../../domain/errors";
import type { AssetRepository, IdGenerator, ObjectSelector, UserRepository } from "../../../domain/ports";

/**
 * Gomme magique, étape 2 : la sélection est confirmée. On envoie la photo normalisée et le masque au stockage et on
 * les enregistre comme assets : ce sont les deux entrées du job ERASE.
 */
export class CommitSelection {
  constructor(
    private readonly users: UserRepository,
    private readonly assets: AssetRepository,
    private readonly selector: ObjectSelector,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { userId: string; assetId: string; selectionId: string }): Promise<Result<{ imageAssetId: string; maskAssetId: string }, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    if (!user.isAgeConfirmed) return err(new AgeNotConfirmed());

    const [asset] = await this.assets.findByIds([input.assetId]);
    if (!asset || asset.userId !== input.userId || asset.kind === "SELFIE_TRAINING") return err(new AssetNotFound());

    let committed;
    try {
      committed = await this.selector.commit({ bucket: asset.bucket, key: asset.key }, input.selectionId);
    } catch (e) {
      if (e instanceof DomainError) return err(e); // ex. SelectionExpired
      throw e;
    }

    // La photo normalisée est la même pour toutes les confirmations sur une photo : un seul enregistrement (bucket + key uniques).
    const existing = await this.assets.findByRef(committed.image.bucket, committed.image.key);
    if (existing && existing.userId !== input.userId) return err(new AssetNotFound());
    const image = existing ?? { id: this.ids.next(), userId: input.userId, kind: "RESULT" as const, ...committed.image };
    if (!existing) await this.assets.save(image);
    const mask = { id: this.ids.next(), userId: input.userId, kind: "RESULT" as const, ...committed.mask };
    await this.assets.save(mask);
    return ok({ imageAssetId: image.id, maskAssetId: mask.id });
  }
}
