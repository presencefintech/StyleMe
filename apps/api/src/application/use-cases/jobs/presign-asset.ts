import { ok, type AssetKind, type Result } from "@styleme/shared";
import type { DomainError } from "../../../domain/errors";
import type { AssetRepository, Clock, IdGenerator, StorageService } from "../../../domain/ports";

const BUCKETS: Record<AssetKind, string> = { SOURCE: "sources", SELFIE_TRAINING: "selfies-training" };
const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000; // validité d'une signed upload URL Supabase

export class PresignAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly storage: StorageService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string; kind: AssetKind }): Promise<Result<{ assetId: string; uploadUrl: string; expiresAt: Date }, DomainError>> {
    const assetId = this.ids.next();
    const ref = { bucket: BUCKETS[input.kind], key: `${input.userId}/${assetId}` };
    const { url } = await this.storage.presignUpload(ref);
    await this.assets.save({ id: assetId, userId: input.userId, kind: input.kind, ...ref });
    return ok({ assetId, uploadUrl: url, expiresAt: new Date(this.clock.now().getTime() + UPLOAD_TTL_MS) });
  }
}
