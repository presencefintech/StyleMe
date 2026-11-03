import { ok, type GarmentCategory, type Result } from "@styleme/shared";
import type { DomainError } from "../../../domain/errors";
import type { GarmentRepository, StorageService } from "../../../domain/ports";

export interface GarmentView {
  id: string;
  name: string;
  category: GarmentCategory;
  description?: string;
  /** URL signée à durée courte (le bucket "garments" reste privé). */
  previewUrl: string;
}

/** Catalogue des tenues essayables, avec une miniature signée pour chacune. */
export class ListGarments {
  constructor(
    private readonly garments: GarmentRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(): Promise<Result<GarmentView[], DomainError>> {
    const list = await this.garments.listActive();
    const views = await Promise.all(
      list.map(async (g): Promise<GarmentView> => ({
        id: g.id,
        name: g.name,
        category: g.category,
        description: g.description,
        previewUrl: (await this.storage.presignDownload({ bucket: g.bucket, key: g.key }, 3600)).url,
      })),
    );
    return ok(views);
  }
}
