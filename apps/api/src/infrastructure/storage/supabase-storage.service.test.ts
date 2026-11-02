import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseStorageService } from "./supabase-storage.service";

function fakeClient() {
  const bucket = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://up" }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://dl" }, error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
  const from = vi.fn().mockReturnValue(bucket);
  return { sb: { storage: { from } } as unknown as SupabaseClient, from, bucket };
}

describe("SupabaseStorageService", () => {
  it("signe l'upload dans le bucket de la référence", async () => {
    const { sb, from, bucket } = fakeClient();
    const r = await new SupabaseStorageService(sb).presignUpload({ bucket: "sources", key: "u1/a1" });
    expect(r.url).toBe("https://up");
    expect(from).toHaveBeenCalledWith("sources");
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith("u1/a1");
  });
  it("signe le download avec une expiration courte (5 min par défaut)", async () => {
    const { sb, bucket } = fakeClient();
    await new SupabaseStorageService(sb).presignDownload({ bucket: "results", key: "k" });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith("k", 300);
  });
  it("propage les erreurs Supabase", async () => {
    const { sb, bucket } = fakeClient();
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(new SupabaseStorageService(sb).presignDownload({ bucket: "results", key: "k" })).rejects.toThrow("boom");
  });
});
