import { describe, expect, it, vi } from "vitest";
import { FakeStorage } from "../../application/__fakes__";
import { InvalidImage, NoObjectFound, ProviderRejectedContent, SelectionExpired } from "../../domain/errors";
import { ReplicateEraser, UnconfiguredEraser } from "./api-ai";
import { LocalObjectSelector } from "./local-ai";

const json = (body: unknown, ok = true, status = 200) => ({ ok, status: ok ? 200 : status, json: async () => body }) as Response;
const file = { ok: true, arrayBuffer: async () => new ArrayBuffer(3) } as Response;

describe("ReplicateEraser", () => {
  it("envoie l'image ET le masque (URLs signées) à bria/eraser et dépose le résultat dans results", async () => {
    const storage = new FakeStorage();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ status: "succeeded", output: "https://rep/out.jpg" })).mockResolvedValueOnce(file);
    const e = new ReplicateEraser("tok", "bria/eraser", storage, fetcher as unknown as typeof fetch, () => "k1");
    const r = await e.erase({ bucket: "results", key: "u1/a.base.jpg" }, { bucket: "results", key: "u1/a.mask.png" });
    expect(r).toEqual({ bucket: "results", key: "u1/k1.jpg" }); // l'extension suit le fichier renvoyé
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.replicate.com/v1/models/bria/eraser/predictions");
    const input = JSON.parse(init.body).input;
    expect(input.image_url).toContain("/dl/results/u1/a.base.jpg");
    expect(input.mask_url).toContain("/dl/results/u1/a.mask.png");
    expect(storage.puts).toEqual([r]);
  });

  it("attend la fin de la prédiction, traduit le filtre de sécurité en refus définitif", async () => {
    const slow = vi
      .fn()
      .mockResolvedValueOnce(json({ status: "processing", urls: { get: "https://rep/p/1" } }))
      .mockResolvedValueOnce(json({ status: "succeeded", output: "https://rep/out.png" }))
      .mockResolvedValueOnce(file);
    const ok = new ReplicateEraser("t", "bria/eraser", new FakeStorage(), slow as unknown as typeof fetch, () => "k", 1, 5000);
    await expect(ok.erase({ bucket: "results", key: "u/i" }, { bucket: "results", key: "u/m" })).resolves.toMatchObject({ key: "u/k.png" });

    const flagged = vi.fn().mockResolvedValue(json({ status: "failed", error: "flagged as sensitive (E005)" }));
    const e = new ReplicateEraser("t", "bria/eraser", new FakeStorage(), flagged as unknown as typeof fetch);
    await expect(e.erase({ bucket: "results", key: "u/i" }, { bucket: "results", key: "u/m" })).rejects.toBeInstanceOf(ProviderRejectedContent);
  });

  it("sans token, la gomme échoue clairement", async () => {
    await expect(new UnconfiguredEraser().erase()).rejects.toThrow(/REPLICATE_TOKEN/);
  });
});

describe("LocalObjectSelector (SAM dans le service IA)", () => {
  const src = { bucket: "sources", key: "u1/photo" };
  const make = (fetcher: ReturnType<typeof vi.fn>) => new LocalObjectSelector("http://ai:8000", fetcher as unknown as typeof fetch);

  it("select : envoie le clic normalisé et renvoie l'aperçu inline + l'id de sélection", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ selectionId: "s1", overlay: "data:image/jpeg;base64,AAAA" }));
    const r = await make(fetcher).select(src, { x: 0.25, y: 0.75 });
    expect(r).toEqual({ selectionId: "s1", overlayUrl: "data:image/jpeg;base64,AAAA" });
    expect(fetcher.mock.calls[0]![0]).toBe("http://ai:8000/segment");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ ...src, x: 0.25, y: 0.75 });
  });

  it("select : un rectangle tracé à la main est transmis tel quel (comme une capture d'écran)", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ selectionId: "s2", overlay: "data:image/jpeg;base64,BBBB" }));
    const box = { x0: 0.1, y0: 0.2, x1: 0.6, y1: 0.8 };
    expect(await make(fetcher).select(src, { box })).toEqual({ selectionId: "s2", overlayUrl: "data:image/jpeg;base64,BBBB" });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ ...src, box });
  });

  it("select : 422 = aucun objet, 415 = image illisible, autre échec = panne", async () => {
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 422))).select(src, { x: 0.5, y: 0.5 })).rejects.toBeInstanceOf(NoObjectFound);
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 415))).select(src, { x: 0.5, y: 0.5 })).rejects.toBeInstanceOf(InvalidImage);
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 500))).select(src, { x: 0.5, y: 0.5 })).rejects.toThrow(/500/);
  });

  it("commit : renvoie la photo normalisée et le masque ; 404 = sélection expirée", async () => {
    const body = { image: { bucket: "results", key: "u1/a.base.jpg" }, mask: { bucket: "results", key: "u1/a.mask.png" } };
    const ok = vi.fn().mockResolvedValue(json(body));
    expect(await make(ok).commit(src, "s1")).toEqual(body);
    expect(ok.mock.calls[0]![0]).toBe("http://ai:8000/commit");
    expect(JSON.parse(ok.mock.calls[0]![1].body)).toEqual({ ...src, selectionId: "s1" });
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 404))).commit(src, "s1")).rejects.toBeInstanceOf(SelectionExpired);
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 500))).commit(src, "s1")).rejects.toThrow(/500/);
  });

  it("prepare appelle /prepare ; 415 = image illisible ; panne = erreur", async () => {
    const ok = vi.fn().mockResolvedValue(json({ ready: true }));
    await make(ok).prepare(src);
    expect(ok.mock.calls[0]![0]).toBe("http://ai:8000/prepare");
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 415))).prepare(src)).rejects.toBeInstanceOf(InvalidImage);
    await expect(make(vi.fn().mockResolvedValue(json({}, false, 500))).prepare(src)).rejects.toThrow(/500/);
  });
});
