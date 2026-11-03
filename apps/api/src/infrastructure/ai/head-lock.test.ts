import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { FakeStorage, FakeTryOn } from "../../application/__fakes__";
import type { FaceLocator } from "../../domain/ports";
import type { ImageRef } from "../../domain/value-objects/image-ref";
import { SightengineFaceLocator } from "./api-ai";
import { cropWindow, HeadLockTryOn, VTON_HEIGHT, VTON_WIDTH } from "./head-lock";

const solid = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 3, background: color } });
const face = { x0: 0.4, y0: 0.1, x1: 0.6, y1: 0.25 };
const px = async (buf: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

describe("cropWindow", () => {
  it("donne une fenêtre 3:4 contenant le visage, quelle que soit la photo", () => {
    for (const [w, h] of [[1200, 1600], [4000, 3000], [900, 2400]] as const) {
      const r = cropWindow(w, h, face);
      expect(Math.abs(r.width / r.height - 0.75)).toBeLessThan(0.01);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(w);
      expect(r.top + r.height).toBeLessThanOrEqual(h);
      expect(r.left).toBeLessThanOrEqual(face.x0 * w);
      expect(r.left + r.width).toBeGreaterThanOrEqual(face.x1 * w);
    }
  });
});

describe("HeadLockTryOn", () => {
  it("recolle la tête d'origine sur le résultat IA et garde le reste du résultat", async () => {
    const original = await solid(1200, 1600, "#ff0000").jpeg().toBuffer(); // photo d'origine : tout rouge
    const generated = await solid(VTON_WIDTH, VTON_HEIGHT, "#00ff00").png().toBuffer(); // l'IA a tout repeint en vert
    const written = new Map<string, Buffer>();
    class CapturingStorage extends FakeStorage {
      override async put(ref: ImageRef, data?: Uint8Array) { await super.put(ref); if (data) written.set(ref.key, Buffer.from(data)); }
    }
    const storage = new CapturingStorage();
    const inner = new FakeTryOn();
    const fetcher = vi.fn(async (url: string) => {
      const body = url.includes("tryon") ? generated : original;
      return { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) } as Response;
    });
    const locator: FaceLocator = { locate: async () => face };
    const t = new HeadLockTryOn(inner, storage, locator, fetcher as unknown as typeof fetch, () => "k");

    const out = await t.tryOn({ bucket: "sources", key: "u1/photo" }, { bucket: "garments", key: "g" }, { category: "DRESSES" });
    expect(out).toEqual({ bucket: "results", key: "u1/k.png" });
    expect(inner.calls[0]!.person.key).toBe("u1/k.vton-in.jpg"); // le moteur reçoit la photo recadrée 3:4
    expect(storage.deletes.map((d) => d.key)).toContain("u1/k.vton-in.jpg");

    const final = written.get("u1/k.png")!;
    const meta = await sharp(final).metadata();
    expect([meta.width, meta.height]).toEqual([VTON_WIDTH, VTON_HEIGHT]);
    const [r1, g1] = await px(final, 384, 200); // sur le visage : photo d'origine (rouge)
    expect(r1).toBeGreaterThan(200); expect(g1).toBeLessThan(60);
    const [r2, g2] = await px(final, 384, 700); // sur le corps : résultat IA (vert)
    expect(g2).toBeGreaterThan(200); expect(r2).toBeLessThan(60);
  });

  it("sans visage détecté (ou localisation en panne), laisse le moteur travailler seul", async () => {
    const inner = new FakeTryOn();
    const none = new HeadLockTryOn(inner, new FakeStorage(), { locate: async () => null });
    const person = { bucket: "sources", key: "u1/p" };
    expect(await none.tryOn(person, { bucket: "g", key: "g" }, { category: "UPPER_BODY" })).toEqual({ bucket: "results", key: "u1/p.tryon" });
    const broken = new HeadLockTryOn(inner, new FakeStorage(), { locate: async () => { throw new Error("down"); } });
    expect((await broken.tryOn(person, { bucket: "g", key: "g" }, { category: "UPPER_BODY" })).key).toBe("u1/p.tryon");
  });
});

describe("SightengineFaceLocator", () => {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
  it("renvoie la plus grande boîte, ignore les valeurs hors 0..1", async () => {
    const f = vi.fn().mockResolvedValue(json({ faces: [{ x1: 0.1, y1: 0.1, x2: 0.15, y2: 0.15 }, { x1: 0.4, y1: 0.1, x2: 0.6, y2: 0.3 }, { x1: 10, y1: 10, x2: 400, y2: 400 }] }));
    const r = await new SightengineFaceLocator("u", "s", new FakeStorage(), f as unknown as typeof fetch).locate({ bucket: "b", key: "k" });
    expect(r).toEqual({ x0: 0.4, y0: 0.1, x1: 0.6, y1: 0.3 });
    expect(await new SightengineFaceLocator("u", "s", new FakeStorage(), vi.fn().mockResolvedValue(json({ faces: [] })) as unknown as typeof fetch).locate({ bucket: "b", key: "k" })).toBeNull();
  });
});

describe("pasteFace / HeadFaceLock", () => {
  it("garde le visage de l'original, laisse tout le reste (cheveux compris) à la version retouchée, même si les tailles diffèrent", async () => {
    const { pasteFace, HeadFaceLock } = await import("./head-lock");
    const original = await solid(1000, 1500, "#ff0000").jpeg().toBuffer();
    const edited = await solid(800, 1200, "#00ff00").png().toBuffer(); // Kontext renvoie une autre taille
    const out = await pasteFace(original, edited, face);
    expect((await sharp(out).metadata()).width).toBe(800);
    const [rFace, gFace] = await px(out, 400, Math.round(0.175 * 1200)); // centre du visage
    expect(rFace).toBeGreaterThan(200); expect(gFace).toBeLessThan(60);
    const [rHair, gHair] = await px(out, 400, Math.round(0.1 * 1200) - 40); // au-dessus du front : cheveux, donc version retouchée
    expect(gHair).toBeGreaterThan(200); expect(rHair).toBeLessThan(60);

    const storage = new FakeStorage();
    const lock = new HeadFaceLock(storage, { locate: async () => null });
    await expect(lock.restoreFace({ bucket: "sources", key: "u1/p" }, { bucket: "results", key: "u1/e" })).rejects.toThrow("face_not_found");
  });
});

describe("blendMakeup (maquillage verrouillé)", () => {
  it("applique la couleur du maquillage mais garde les détails de l'original ; hors visage : version maquillée", async () => {
    const { blendMakeup } = await import("./head-lock");
    // Original : visage gris uni avec un détail noir net (un grain de beauté). Version maquillée : teintée de rouge, sans le détail.
    const w = 400;
    const h = 600;
    const dot = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#000000" } }).png().toBuffer();
    const original = await solid(w, h, "#808080").composite([{ input: dot, left: 150, top: 150 }]).png().toBuffer();
    const edited = await solid(w, h, "#c88080").png().toBuffer();
    const out = await blendMakeup(original, edited, { x0: 0.25, y0: 0.15, x1: 0.75, y1: 0.45 });

    const [rFlat, gFlat] = await px(out, 250, 210); // peau unie, dans le visage : la teinte rouge est appliquée
    expect(rFlat).toBeGreaterThan(170); expect(gFlat).toBeLessThan(150);
    const [, gDot] = await px(out, 156, 156); // le détail de l'original est conservé (il ne disparaît pas avec la version maquillée)
    expect(gDot).toBeLessThan(70);
    const [rOut, gOut] = await px(out, 20, 580); // hors visage : exactement la version maquillée
    expect(rOut).toBeGreaterThan(190); expect(gOut).toBeLessThan(140);
  });
});
