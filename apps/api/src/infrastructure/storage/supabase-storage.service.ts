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

  async copy(from: ImageRef, to: ImageRef) {
    if (from.bucket !== to.bucket) throw new Error("copy: buckets différents non supportés");
    const { error } = await this.sb.storage.from(from.bucket).copy(from.key, to.key);
    if (error) throw error;
  }

  async delete(ref: ImageRef) {
    const { error } = await this.sb.storage.from(ref.bucket).remove([ref.key]);
    if (error) throw error;
  }

  async deletePrefix(bucket: string, prefix: string) {
    const folder = prefix.replace(/\/+$/, "");
    // On relit toujours depuis le début : les fichiers supprimés disparaissent de la liste.
    for (let pass = 0; pass < 1000; pass++) {
      const { data, error } = await this.sb.storage.from(bucket).list(folder, { limit: 100 });
      if (error) throw error;
      const files = (data ?? []).filter((f) => f.id !== null); // exclut les sous-dossiers
      if (files.length === 0) return;
      const { error: rmError } = await this.sb.storage.from(bucket).remove(files.map((f) => `${folder}/${f.name}`));
      if (rmError) throw rmError;
    }
    throw new Error(`deletePrefix: trop de fichiers sous ${bucket}/${prefix}`);
  }
}
