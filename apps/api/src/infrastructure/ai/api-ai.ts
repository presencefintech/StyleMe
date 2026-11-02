import type { BackgroundService, ImageEnhancer, ModerationResult, ModerationService, StorageService } from "../../domain/ports";
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
