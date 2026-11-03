import sharp from "sharp";
import type { FaceBox, FaceLocator, FaceLock, MakeupBlender, StorageService, VirtualTryOn } from "../../domain/ports";
import type { ImageRef } from "../../domain/value-objects/image-ref";
import type { GarmentCategory } from "@styleme/shared";
import type { Fetch } from "./local-ai";

/** Taille native d'IDM-VTON : on lui donne exactement ça pour que le résultat soit aligné pixel à pixel sur la photo. */
export const VTON_WIDTH = 768;
export const VTON_HEIGHT = 1024;

type Rect = { left: number; top: number; width: number; height: number };

/** Fenêtre 3:4 la plus grande possible dans l'image, qui garde le visage dedans (centrée dessus sur l'axe qui déborde). */
export function cropWindow(imgW: number, imgH: number, face: FaceBox): Rect {
  const ratio = VTON_WIDTH / VTON_HEIGHT;
  const fcx = ((face.x0 + face.x1) / 2) * imgW;
  const fcy = ((face.y0 + face.y1) / 2) * imgH;
  let width = imgW;
  let height = Math.round(imgW / ratio);
  if (height > imgH) {
    height = imgH;
    width = Math.round(imgH * ratio);
  }
  // Horizontal : centré sur le visage. Vertical : le visage au tiers haut (cadrage naturel d'un portrait en pied).
  const left = Math.min(Math.max(Math.round(fcx - width / 2), 0), imgW - width);
  const top = Math.min(Math.max(Math.round(fcy - height * 0.3), 0), imgH - height);
  return { left, top, width, height };
}

/** Ellipse « tête » (cheveux compris, jusqu'au menton, jamais le cou ni le col) en pixels de la fenêtre 768×1024, avec sa zone de fondu. */
export function headEllipse(face: FaceBox, imgW: number, imgH: number, win: Rect) {
  const scale = VTON_WIDTH / win.width;
  const bw = (face.x1 - face.x0) * imgW * scale;
  const bh = (face.y1 - face.y0) * imgH * scale;
  const x0 = (face.x0 * imgW - win.left) * scale;
  const y0 = (face.y0 * imgH - win.top) * scale;
  const rx = bw * 0.72;
  const ry = bh * 0.78;
  return { cx: x0 + bw / 2, cy: y0 + bh * 0.28, rx, ry, feather: Math.max(2, bw * 0.1) };
}

/** Masque (alpha) flouté de la tête, à la taille de la fenêtre. */
async function headMask(e: ReturnType<typeof headEllipse>): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VTON_WIDTH}" height="${VTON_HEIGHT}"><ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="#fff"/></svg>`;
  return sharp(Buffer.from(svg)).blur(e.feather).png().toBuffer();
}

/**
 * Recolle la tête de la photo d'origine sur le résultat de l'IA : l'identité est garantie par construction,
 * quoi que le modèle ait fait du visage.
 */
export async function pasteHead(original: Buffer, generated: Buffer, face: FaceBox, win: Rect, imgW: number, imgH: number): Promise<Buffer> {
  const mask = await headMask(headEllipse(face, imgW, imgH, win));
  const source = await sharp(original).extract(win).resize(VTON_WIDTH, VTON_HEIGHT, { fit: "fill" }).png().toBuffer();
  const head = await sharp(source).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const base = await sharp(generated).resize(VTON_WIDTH, VTON_HEIGHT, { fit: "fill" }).toBuffer();
  return sharp(base).composite([{ input: head }]).png().toBuffer();
}

/**
 * Décorateur d'essayage : recadre la photo en 3:4 nous-mêmes (au lieu de laisser le modèle le faire), lance l'essayage,
 * puis recolle la tête d'origine. Sans visage détecté, on retombe sur le comportement du moteur seul.
 */
export class HeadLockTryOn implements VirtualTryOn {
  constructor(
    private readonly inner: VirtualTryOn,
    private readonly storage: StorageService,
    private readonly faces: FaceLocator,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}

  private async download(ref: ImageRef): Promise<Buffer> {
    const { url } = await this.storage.presignDownload(ref, 600);
    const res = await this.fetcher(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async tryOn(person: ImageRef, garment: ImageRef, opts: { category: GarmentCategory; description?: string }): Promise<ImageRef> {
    // La détection du visage est « au mieux » : une panne ne doit pas faire échouer l'essayage.
    const face = await this.faces.locate(person).catch(() => null);
    if (!face) return this.inner.tryOn(person, garment, opts);

    const original = await sharp(await this.download(person)).rotate().toBuffer();
    const { width: imgW = 0, height: imgH = 0 } = await sharp(original).metadata();
    if (!imgW || !imgH) return this.inner.tryOn(person, garment, opts);

    const win = cropWindow(imgW, imgH, face);
    const prepared = await sharp(original).extract(win).resize(VTON_WIDTH, VTON_HEIGHT, { fit: "fill" }).jpeg({ quality: 95 }).toBuffer();
    const owner = person.key.split("/")[0] ?? "x";
    const tmp: ImageRef = { bucket: "results", key: `${owner}/${this.newKey()}.vton-in.jpg` };
    await this.storage.put(tmp, prepared, "image/jpeg");

    let generated: ImageRef;
    try {
      generated = await this.inner.tryOn(tmp, garment, opts);
    } finally {
      await this.storage.delete(tmp).catch(() => undefined);
    }

    const locked = await pasteHead(original, await this.download(generated), face, win, imgW, imgH);
    await this.storage.delete(generated).catch(() => undefined);
    const out: ImageRef = { bucket: "results", key: `${owner}/${this.newKey()}.png` };
    await this.storage.put(out, locked, "image/png");
    return out;
  }
}


/** Ellipse « visage seul » (sourcils, joues, menton ; PAS le front ni les cheveux) en pixels d'une image w×h. */
export function faceOnlyEllipse(face: FaceBox, w: number, h: number) {
  const bw = (face.x1 - face.x0) * w;
  const bh = (face.y1 - face.y0) * h;
  // Le haut de la boîte peut inclure la racine des cheveux d'origine : on démarre sous le front (≈ sourcils) pour ne jamais rapporter
  // l'ancienne frange sous la nouvelle coiffure. Yeux, nez, bouche et menton (l'identité) restent dans le masque.
  return { cx: face.x0 * w + bw / 2, cy: face.y0 * h + bh * 0.58, rx: bw * 0.48, ry: bh * 0.45, feather: Math.max(2, bw * 0.07) };
}

/** Recolle le visage de `original` sur `edited` (même cadrage, tailles éventuellement différentes). */
export async function pasteFace(original: Buffer, edited: Buffer, face: FaceBox): Promise<Buffer> {
  const { width: w = 0, height: h = 0 } = await sharp(edited).metadata();
  if (!w || !h) throw new Error("edited image unreadable");
  const e = faceOnlyEllipse(face, w, h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(e.feather).png().toBuffer();
  const source = await sharp(original).rotate().resize(w, h, { fit: "fill" }).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp(edited).composite([{ input: source }]).png().toBuffer();
}

/** Verrou d'identité pour les coiffures : visage d'origine préservé à l'identique, cheveux de la version retouchée. */
export class HeadFaceLock implements FaceLock {
  constructor(
    private readonly storage: StorageService,
    private readonly faces: FaceLocator,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}

  private async download(ref: ImageRef): Promise<Buffer> {
    const { url } = await this.storage.presignDownload(ref, 600);
    const res = await this.fetcher(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async restoreFace(original: ImageRef, edited: ImageRef): Promise<ImageRef> {
    const face = await this.faces.locate(original);
    if (!face) throw new Error("face_not_found");
    const locked = await pasteFace(await this.download(original), await this.download(edited), face);
    const out: ImageRef = { bucket: "results", key: `${original.key.split("/")[0] ?? "x"}/${this.newKey()}.png` };
    await this.storage.put(out, locked, "image/png");
    await this.storage.delete(edited).catch(() => undefined);
    return out;
  }
}

/** Ellipse « visage entier » (front compris) pour le maquillage : ici la structure vient de l'original, on peut être large. */
export function makeupEllipse(face: FaceBox, w: number, h: number) {
  const bw = (face.x1 - face.x0) * w;
  const bh = (face.y1 - face.y0) * h;
  return { cx: face.x0 * w + bw / 2, cy: face.y0 * h + bh * 0.5, rx: bw * 0.62, ry: bh * 0.62, feather: Math.max(2, bw * 0.08), bw };
}

/**
 * Sur le visage, en espace YCbCr :
 *  - LUMINANCE (forme, relief, traits) : celle de l'ORIGINAL, plus seulement l'écart d'éclairage doux de la version maquillée
 *    (flou large ≈ 8 % de la largeur du visage : contour, blush, highlighter). Les yeux, le nez, la bouche, les rides restent ceux de la photo ;
 *  - CHROMINANCE (la couleur du maquillage : rouge à lèvres, fard, teint) : celle de la version maquillée, très légèrement lissée.
 * Le maquillage se voit, la forme du visage ne peut pas changer. Hors du visage : version maquillée.
 * Limite assumée : un trait très fin et sombre (eye-liner, cils) vient de la luminance, donc il reste peu marqué.
 */
export async function blendMakeup(original: Buffer, edited: Buffer, face: FaceBox): Promise<Buffer> {
  const { width: w = 0, height: h = 0 } = await sharp(edited).metadata();
  if (!w || !h) throw new Error("edited image unreadable");
  const e = makeupEllipse(face, w, h);
  const raw3 = { raw: { width: w, height: h, channels: 3 as const } };
  const raw1 = { raw: { width: w, height: h, channels: 1 as const } };
  const n = w * h;

  const orig = await sharp(original).rotate().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const ed = await sharp(edited).removeAlpha().raw().toBuffer();

  const yOrig = new Uint8Array(n);
  const yEd = new Uint8Array(n);
  const cbEd = new Uint8Array(n);
  const crEd = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const r = orig[p * 3]!, g = orig[p * 3 + 1]!, b = orig[p * 3 + 2]!;
    yOrig[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const r2 = ed[p * 3]!, g2 = ed[p * 3 + 1]!, b2 = ed[p * 3 + 2]!;
    yEd[p] = Math.round(0.299 * r2 + 0.587 * g2 + 0.114 * b2);
    cbEd[p] = Math.round(Math.min(255, Math.max(0, 128 - 0.168736 * r2 - 0.331264 * g2 + 0.5 * b2)));
    crEd[p] = Math.round(Math.min(255, Math.max(0, 128 + 0.5 * r2 - 0.418688 * g2 - 0.081312 * b2)));
  }
  const bigSigma = Math.max(3, e.bw * 0.08);
  const smallSigma = Math.max(0.8, e.bw * 0.008);
  const blur = (buf: Uint8Array, sigma: number) => sharp(Buffer.from(buf), raw1).blur(sigma).raw().toBuffer();
  const [yOrigBig, yEdBig, cbS, crS] = await Promise.all([blur(yOrig, bigSigma), blur(yEd, bigSigma), blur(cbEd, smallSigma), blur(crEd, smallSigma)]);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#000"/><ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).greyscale().blur(e.feather).raw().toBuffer();

  const out = Buffer.alloc(n * 3);
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  for (let p = 0; p < n; p++) {
    const m = (mask[p] ?? 0) / 255;
    const y = yOrig[p]! + (yEdBig[p]! - yOrigBig[p]!);
    const cb = cbS[p]! - 128;
    const cr = crS[p]! - 128;
    const fr = y + 1.402 * cr;
    const fg = y - 0.344136 * cb - 0.714136 * cr;
    const fb = y + 1.772 * cb;
    out[p * 3] = clamp(ed[p * 3]! * (1 - m) + fr * m);
    out[p * 3 + 1] = clamp(ed[p * 3 + 1]! * (1 - m) + fg * m);
    out[p * 3 + 2] = clamp(ed[p * 3 + 2]! * (1 - m) + fb * m);
  }
  return sharp(out, raw3).png().toBuffer();
}

/** Maquillage verrouillé : voir blendMakeup. Sans visage détecté, on refuse de livrer (identité non garantie). */
export class HeadMakeupBlender implements MakeupBlender {
  constructor(
    private readonly storage: StorageService,
    private readonly faces: FaceLocator,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}

  private async download(ref: ImageRef): Promise<Buffer> {
    const { url } = await this.storage.presignDownload(ref, 600);
    const res = await this.fetcher(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async blend(original: ImageRef, edited: ImageRef): Promise<ImageRef> {
    const face = await this.faces.locate(original);
    if (!face) throw new Error("face_not_found");
    const result = await blendMakeup(await this.download(original), await this.download(edited), face);
    const out: ImageRef = { bucket: "results", key: `${original.key.split("/")[0] ?? "x"}/${this.newKey()}.png` };
    await this.storage.put(out, result, "image/png");
    return out;
  }
}
