import type { GarmentCategory } from "@styleme/shared";
import type { BackgroundService, FaceBox, FaceLocator, ImageEditor, ImageEnhancer, ObjectEraser, ModerationResult, ModerationService, StorageService, VirtualTryOn } from "../../domain/ports";
import { ProviderRejectedContent } from "../../domain/errors";
import type { ImageRef } from "../../domain/value-objects/image-ref";
import type { Fetch } from "./local-ai";

const RESULTS_BUCKET = "results";

async function download(fetcher: Fetch, url: string): Promise<Uint8Array> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Enhancer via l'API Replicate (AI_MODE=api). Les modèles sont configurés par env (version hash). */
export class ReplicateEnhancer implements ImageEnhancer {
  constructor(
    private readonly token: string,
    private readonly upscaleModel: string,
    private readonly faceModel: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}

  upscale(src: ImageRef) { return this.run(this.upscaleModel, src); }
  restoreFace(src: ImageRef) { return this.run(this.faceModel, src); }

  private async run(version: string, src: ImageRef): Promise<ImageRef> {
    const { url: input } = await this.storage.presignDownload(src, 600);
    const res = await this.fetcher("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", prefer: "wait" },
      body: JSON.stringify({ version, input: { image: input } }),
    });
    if (!res.ok) throw new Error(`Replicate responded ${res.status}`);
    const prediction = (await res.json()) as { status: string; output?: string | string[]; error?: string };
    if (prediction.status !== "succeeded" || !prediction.output) {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "no output"}`);
    }
    const outUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outUrl) throw new Error("Replicate returned empty output");
    const data = await download(this.fetcher, outUrl);
    const ref = { bucket: RESULTS_BUCKET, key: `${src.key.split("/")[0] ?? "x"}/${this.newKey()}.png` };
    await this.storage.put(ref, data, "image/png");
    return ref;
  }
}

/** Suppression de fond via remove.bg. */
export class RemoveBgBackground implements BackgroundService {
  constructor(
    private readonly apiKey: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}

  async remove(src: ImageRef): Promise<ImageRef> {
    const { url } = await this.storage.presignDownload(src, 600);
    const form = new FormData();
    form.set("image_url", url);
    form.set("size", "auto");
    const res = await this.fetcher("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "x-api-key": this.apiKey }, body: form });
    if (!res.ok) throw new Error(`remove.bg responded ${res.status}`);
    const ref = { bucket: RESULTS_BUCKET, key: `${src.key.split("/")[0] ?? "x"}/${this.newKey()}.png` };
    await this.storage.put(ref, new Uint8Array(await res.arrayBuffer()), "image/png");
    return ref;
  }

  async applyTemplate(): Promise<ImageRef> {
    throw new Error("applyTemplate non supporté en AI_MODE=api (v2)");
  }
}

/** Modération via Sightengine (nudité + visages/âge). */
export class SightengineModeration implements ModerationService {
  constructor(
    private readonly user: string,
    private readonly secret: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
  ) {}

  async check(src: ImageRef): Promise<ModerationResult> {
    const { url } = await this.storage.presignDownload(src, 300);
    const qs = new URLSearchParams({ url, models: "nudity-2.1,face-attributes", api_user: this.user, api_secret: this.secret });
    const res = await this.fetcher(`https://api.sightengine.com/1.0/check.json?${qs}`);
    if (!res.ok) throw new Error(`Sightengine responded ${res.status}`);
    const body = (await res.json()) as {
      nudity?: { none?: number };
      faces?: { attributes?: { minor?: number } }[];
    };
    const nsfwScore = 1 - (body.nudity?.none ?? 1);
    const faces = body.faces ?? [];
    // Prudence : un score "mineur" élevé suffit à bloquer.
    const minorRisk = faces.some((f) => (f.attributes?.minor ?? 0) >= 0.5);
    return { approved: nsfwScore < 0.5, nsfwScore, minorRisk, faceCount: faces.length };
  }
}

/** Boîte du visage principal via Sightengine (coordonnées relatives x1,y1,x2,y2) : la plus grande si plusieurs. */
export class SightengineFaceLocator implements FaceLocator {
  constructor(
    private readonly user: string,
    private readonly secret: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
  ) {}

  async locate(src: ImageRef): Promise<FaceBox | null> {
    const { url } = await this.storage.presignDownload(src, 300);
    const qs = new URLSearchParams({ url, models: "face-attributes", api_user: this.user, api_secret: this.secret });
    const res = await this.fetcher(`https://api.sightengine.com/1.0/check.json?${qs}`);
    if (!res.ok) throw new Error(`Sightengine responded ${res.status}`);
    const body = (await res.json()) as { faces?: { x1?: number; y1?: number; x2?: number; y2?: number }[] };
    const boxes = (body.faces ?? [])
      .filter((f) => [f.x1, f.y1, f.x2, f.y2].every((v) => typeof v === "number" && v >= 0 && v <= 1) && f.x2! > f.x1! && f.y2! > f.y1!)
      .map((f) => ({ x0: f.x1!, y0: f.y1!, x1: f.x2!, y1: f.y2! }));
    boxes.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
    return boxes[0] ?? null;
  }
}

/** Réessais après un 429, et attente maximale entre deux essais. */
const RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_MAX_WAIT_MS = 20_000;

interface ReplicatePrediction {
  status: string;
  output?: string | string[];
  error?: string;
  urls?: { get?: string };
}

/** Lance une prédiction Replicate, attend sa fin et renvoie l'URL du résultat. */
async function runReplicate(
  fetcher: Fetch,
  token: string,
  endpoint: string,
  input: Record<string, unknown>,
  pollMs: number,
  maxWaitMs: number,
  /** Modèles communautaires : version épinglée (POST /v1/predictions). Les modèles officiels n'en ont pas besoin. */
  version?: string,
): Promise<string> {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  // 429 = cadence limitée (comptes à faible crédit : quelques appels par minute). On attend le délai demandé puis on réessaie,
  // au lieu de faire échouer le job : un essayage ou une coiffure enchaîne plusieurs appels coup sur coup.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetcher(endpoint, { method: "POST", headers: { ...headers, prefer: "wait" }, body: JSON.stringify(version ? { version, input } : { input }) });
    if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break;
    const retryAfter = ((await res.json().catch(() => ({}))) as { retry_after?: number }).retry_after;
    await new Promise((r) => setTimeout(r, Math.min(Math.max((retryAfter ?? 5) * 1000, pollMs), RATE_LIMIT_MAX_WAIT_MS)));
  }
  if (!res.ok) throw new Error(`Replicate responded ${res.status}`);
  let p = (await res.json()) as ReplicatePrediction;

  const deadline = Date.now() + maxWaitMs;
  while ((p.status === "starting" || p.status === "processing") && p.urls?.get) {
    if (Date.now() > deadline) throw new Error("Replicate prediction timed out");
    await new Promise((r) => setTimeout(r, pollMs));
    const poll = await fetcher(p.urls.get, { headers });
    if (!poll.ok) throw new Error(`Replicate poll responded ${poll.status}`);
    p = (await poll.json()) as ReplicatePrediction;
  }
  // Filtre de sécurité du modèle (E005) : refus définitif, pas une panne.
  if (p.status === "failed" && /flagged as sensitive|\(E005\)/i.test(p.error ?? "")) throw new ProviderRejectedContent(p.error);
  if (p.status !== "succeeded" || !p.output) throw new Error(`Replicate prediction ${p.status}: ${p.error ?? "no output"}`);
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!out) throw new Error("Replicate returned empty output");
  return out;
}

const extOf = (url: string) => (/\.jpe?g(\?|$)/i.test(url) ? { ext: "jpg", type: "image/jpeg" } : { ext: "png", type: "image/png" });

/**
 * Édition par instruction via Replicate (FLUX Kontext). Le modèle ne modifie que ce qui est demandé
 * et conserve le reste de la photo (y compris le texte présent dans l'image).
 */
export class ReplicateEditor implements ImageEditor {
  constructor(
    private readonly token: string,
    private readonly model: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
    private readonly pollMs = 2000,
    private readonly maxWaitMs = 120_000,
  ) {}

  async edit(src: ImageRef, instruction: string): Promise<ImageRef> {
    const { url: input } = await this.storage.presignDownload(src, 600);
    const outUrl = await runReplicate(
      this.fetcher,
      this.token,
      `https://api.replicate.com/v1/models/${this.model}/predictions`,
      { prompt: instruction, input_image: input, output_format: "png" },
      this.pollMs,
      this.maxWaitMs,
    );
    const data = await download(this.fetcher, outUrl);
    const ref = { bucket: RESULTS_BUCKET, key: `${src.key.split("/")[0] ?? "x"}/${this.newKey()}.png` };
    await this.storage.put(ref, data, "image/png");
    return ref;
  }
}

/** Gomme via Replicate (Bria Eraser) : remplit la zone blanche du masque de façon naturelle. */
export class ReplicateEraser implements ObjectEraser {
  constructor(
    private readonly token: string,
    private readonly model: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
    private readonly pollMs = 2000,
    private readonly maxWaitMs = 120_000,
  ) {}

  async erase(image: ImageRef, mask: ImageRef): Promise<ImageRef> {
    const [img, msk] = await Promise.all([this.storage.presignDownload(image, 600), this.storage.presignDownload(mask, 600)]);
    const outUrl = await runReplicate(
      this.fetcher,
      this.token,
      `https://api.replicate.com/v1/models/${this.model}/predictions`,
      { image_url: img.url, mask_url: msk.url, preserve_alpha: false, content_moderation: false },
      this.pollMs,
      this.maxWaitMs,
    );
    const { ext, type } = extOf(outUrl);
    const data = await download(this.fetcher, outUrl);
    const ref = { bucket: RESULTS_BUCKET, key: `${image.key.split("/")[0] ?? "x"}/${this.newKey()}.${ext}` };
    await this.storage.put(ref, data, type);
    return ref;
  }
}

/**
 * Essayage virtuel via Replicate (IDM-VTON) : habille la personne de la photo avec la tenue, en gardant visage, pose et décor.
 * Modèle communautaire : on épingle sa version pour que les résultats ne changent pas sans prévenir.
 */
export class ReplicateTryOn implements VirtualTryOn {
  constructor(
    private readonly token: string,
    private readonly version: string,
    private readonly storage: StorageService,
    private readonly fetcher: Fetch = fetch,
    private readonly newKey: () => string = () => crypto.randomUUID(),
    private readonly pollMs = 2000,
    private readonly maxWaitMs = 180_000,
    /** false = la photo est déjà en 768×1024 (HeadLockTryOn la recadre lui-même, pour pouvoir recoller la tête). */
    private readonly crop = true,
  ) {}

  async tryOn(person: ImageRef, garment: ImageRef, opts: { category: GarmentCategory; description?: string }): Promise<ImageRef> {
    const [human, garm] = await Promise.all([this.storage.presignDownload(person, 600), this.storage.presignDownload(garment, 600)]);
    const outUrl = await runReplicate(
      this.fetcher,
      this.token,
      "https://api.replicate.com/v1/predictions",
      {
        human_img: human.url,
        garm_img: garm.url,
        garment_des: opts.description ?? "garment",
        category: REPLICATE_CATEGORY[opts.category],
        crop: this.crop, // les photos des utilisateurs ne sont pas toutes en 3:4
        steps: 30,
      },
      this.pollMs,
      this.maxWaitMs,
      this.version,
    );
    const { ext, type } = extOf(outUrl);
    const data = await download(this.fetcher, outUrl);
    const ref = { bucket: RESULTS_BUCKET, key: `${person.key.split("/")[0] ?? "x"}/${this.newKey()}.${ext}` };
    await this.storage.put(ref, data, type);
    return ref;
  }
}

const REPLICATE_CATEGORY: Record<GarmentCategory, string> = { UPPER_BODY: "upper_body", LOWER_BODY: "lower_body", DRESSES: "dresses" };

export class UnconfiguredTryOn implements VirtualTryOn {
  async tryOn(): Promise<ImageRef> {
    throw new Error("Essayage non configuré : définir REPLICATE_TOKEN sur l'API");
  }
}

/** Édition demandée alors qu'aucun fournisseur n'est configuré : le job échoue proprement (0 crédit). */
export class UnconfiguredEditor implements ImageEditor {
  async edit(): Promise<ImageRef> {
    throw new Error("Édition non configurée : définir REPLICATE_TOKEN sur l'API");
  }
}

export class UnconfiguredEraser implements ObjectEraser {
  async erase(): Promise<ImageRef> {
    throw new Error("Gomme non configurée : définir REPLICATE_TOKEN sur l'API");
  }
}
