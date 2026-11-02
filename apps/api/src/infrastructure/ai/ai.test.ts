import { describe, expect, it, vi } from "vitest";
import { FakeStorage } from "../../application/__fakes__";
import { RemoveBgBackground, ReplicateEditor, ReplicateEnhancer, SightengineModeration, UnconfiguredEditor } from "./api-ai";
import { ProviderRejectedContent } from "../../domain/errors";
import { LocalEnhancer, LocalModeration } from "./local-ai";

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe("LocalEnhancer / LocalModeration", () => {
  it("appelle le microservice et renvoie la ref", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ bucket: "results", key: "u1/out" }));
    const r = await new LocalEnhancer("http://ai:8000", fetcher as unknown as typeof fetch).upscale({ bucket: "sources", key: "u1/in" });
    expect(r).toEqual({ bucket: "results", key: "u1/out" });
    expect(fetcher.mock.calls[0]![0]).toBe("http://ai:8000/upscale");
  });
  it("lève une erreur si le service échoue", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, false));
    await expect(new LocalModeration("http://ai:8000", fetcher as unknown as typeof fetch).check({ bucket: "b", key: "k" }, "input")).rejects.toThrow(/500/);
  });
});

describe("ReplicateEnhancer", () => {
  it("lance la prédiction, télécharge la sortie et la dépose dans results", async () => {
    const storage = new FakeStorage();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ status: "succeeded", output: "https://rep/out.png" }))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response);
    const e = new ReplicateEnhancer("tok", "v1", "v2", storage, fetcher as unknown as typeof fetch, () => "abc");
    const r = await e.upscale({ bucket: "sources", key: "u1/in" });
    expect(r).toEqual({ bucket: "results", key: "u1/abc.png" });
    expect(storage.puts).toEqual([r]);
  });
  it("échoue si la prédiction n'a pas réussi", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ status: "failed", error: "oom" }));
    const e = new ReplicateEnhancer("tok", "v1", "v2", new FakeStorage(), fetcher as unknown as typeof fetch);
    await expect(e.upscale({ bucket: "sources", key: "u1/in" })).rejects.toThrow(/oom/);
  });
});

describe("RemoveBgBackground", () => {
  it("dépose le PNG détouré dans results", async () => {
    const storage = new FakeStorage();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) } as Response);
    const r = await new RemoveBgBackground("k", storage, fetcher as unknown as typeof fetch, () => "z").remove({ bucket: "results", key: "u1/x" });
    expect(r.key).toBe("u1/z.png");
  });
});

describe("SightengineModeration", () => {
  const mod = (body: unknown) =>
    new SightengineModeration("u", "s", new FakeStorage(), vi.fn().mockResolvedValue(json(body)) as unknown as typeof fetch);
  it("approuve une image saine", async () => {
    const r = await mod({ nudity: { none: 0.99 }, faces: [{ attributes: { minor: 0.01 } }] }).check({ bucket: "b", key: "k" });
    expect(r).toMatchObject({ approved: true, minorRisk: false, faceCount: 1 });
  });
  it("bloque le NSFW", async () => {
    const r = await mod({ nudity: { none: 0.1 }, faces: [] }).check({ bucket: "b", key: "k" });
    expect(r.approved).toBe(false);
  });
  it("signale un risque mineur", async () => {
    const r = await mod({ nudity: { none: 1 }, faces: [{ attributes: { minor: 0.8 } }] }).check({ bucket: "b", key: "k" });
    expect(r.minorRisk).toBe(true);
  });
});

describe("ReplicateEditor", () => {
  const png = { ok: true, arrayBuffer: async () => new ArrayBuffer(3) } as Response;

  it("envoie l'instruction et l'image au modèle, puis dépose le résultat dans results", async () => {
    const storage = new FakeStorage();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ status: "succeeded", output: "https://rep/out.png" })).mockResolvedValueOnce(png);
    const e = new ReplicateEditor("tok", "black-forest-labs/flux-kontext-pro", storage, fetcher as unknown as typeof fetch, () => "k1");
    const r = await e.edit({ bucket: "sources", key: "u1/in" }, "enlève l'objet au fond");
    expect(r).toEqual({ bucket: "results", key: "u1/k1.png" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions");
    const body = JSON.parse(init.body);
    expect(body.input.prompt).toBe("enlève l'objet au fond");
    expect(body.input.input_image).toContain("/dl/sources/u1/in");
    expect(storage.puts).toEqual([r]);
  });

  it("attend la fin de la prédiction si elle n'est pas terminée", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ status: "processing", urls: { get: "https://rep/p/1" } }))
      .mockResolvedValueOnce(json({ status: "processing", urls: { get: "https://rep/p/1" } }))
      .mockResolvedValueOnce(json({ status: "succeeded", output: ["https://rep/out.png"] }))
      .mockResolvedValueOnce(png);
    const e = new ReplicateEditor("tok", "m/x", new FakeStorage(), fetcher as unknown as typeof fetch, () => "k", 1, 5000);
    await expect(e.edit({ bucket: "sources", key: "u1/in" }, "x")).resolves.toMatchObject({ bucket: "results" });
    expect(fetcher.mock.calls[1]![0]).toBe("https://rep/p/1");
  });

  it("échoue si la prédiction échoue ou dépasse le délai", async () => {
    const failed = vi.fn().mockResolvedValue(json({ status: "failed", error: "NSFW detected" }));
    await expect(new ReplicateEditor("t", "m/x", new FakeStorage(), failed as unknown as typeof fetch).edit({ bucket: "b", key: "u/k" }, "x")).rejects.toThrow(/NSFW/);
    const slow = vi.fn().mockResolvedValue(json({ status: "processing", urls: { get: "https://rep/p" } }));
    await expect(new ReplicateEditor("t", "m/x", new FakeStorage(), slow as unknown as typeof fetch, () => "k", 1, 20).edit({ bucket: "b", key: "u/k" }, "x")).rejects.toThrow(/timed out/);
  });

  it("le filtre de sécurité (E005) devient un refus de contenu, pas une panne", async () => {
    const f = vi.fn().mockResolvedValue(json({ status: "failed", error: "The input or output was flagged as sensitive. (E005)" }));
    await expect(new ReplicateEditor("t", "m/x", new FakeStorage(), f as unknown as typeof fetch).edit({ bucket: "b", key: "u/k" }, "x")).rejects.toBeInstanceOf(ProviderRejectedContent);
  });

  it("sans token configuré, l'éditeur échoue clairement", async () => {
    await expect(new UnconfiguredEditor().edit()).rejects.toThrow(/REPLICATE_TOKEN/);
  });
});
