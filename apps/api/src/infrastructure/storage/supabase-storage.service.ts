import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageService } from "../../domain/ports";
import type { ImageRef } from "../../domain/value-objects/image-ref";

/** Client créé avec SUPABASE_SERVICE_ROLE_KEY, côté backend uniquement. Tous les buckets photos sont privés. */
export class SupabaseStorageService implements StorageService {
  constructor(private readonly sb: SupabaseClient) {}

  async presignUpload(ref: ImageRef) {
    const { data, error } = await this.sb.storage.from(ref.bucket).createSignedUploadUrl(ref.key);
    if (error) throw error;
    return { url: data.signedUrl };
  }

  async presignDownload(ref: ImageRef, ttlSeconds = 300) {
    const { data, error } = await this.sb.storage.from(ref.bucket).createSignedUrl(ref.key, ttlSeconds);
    if (error) throw error;
    return { url: data.signedUrl };
  }

  async put(ref: ImageRef, data: Uint8Array, contentType: string) {
    const { error } = await this.sb.storage.from(ref.bucket).upload(ref.key, data, { contentType, upsert: true });
    if (error) throw error;
  }

  async delete(ref: ImageRef) {
    const { error } = await this.sb.storage.from(ref.bucket).remove([ref.key]);
    if (error) throw error;
  }
}
