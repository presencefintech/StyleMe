import { InvalidImage, NoObjectFound, SelectionExpired } from "../../domain/errors";
import type { BackgroundService, ImageEnhancer, ModerationResult, ModerationService, ObjectSelector, SegmentTarget } from "../../domain/ports";
import type { ImageRef } from "../../domain/value-objects/image-ref";

export type Fetch = typeof fetch;

async function postJson<T>(fetcher: Fetch, url: string, body: unknown): Promise<T> {
  const res = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`AI service ${url} responded ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Microservice Python séparé (FastAPI : Real-ESRGAN/GFPGAN/rembg + modération).
 * Contrat : POST {LOCAL_AI_URL}/<op> avec {bucket,key} → {bucket,key} (le service lit/écrit dans le storage).
 */
export class LocalEnhancer implements ImageEnhancer {
  constructor(private readonly baseUrl: string, private readonly fetcher: Fetch = fetch) {}
  upscale(src: ImageRef) { return postJson<ImageRef>(this.fetcher, `${this.baseUrl}/upscale`, src); }
  restoreFace(src: ImageRef) { return postJson<ImageRef>(this.fetcher, `${this.baseUrl}/restore-face`, src); }
}

export class LocalBackground implements BackgroundService {
  constructor(private readonly baseUrl: string, private readonly fetcher: Fetch = fetch) {}
  remove(src: ImageRef) { return postJson<ImageRef>(this.fetcher, `${this.baseUrl}/remove-bg`, src); }
  applyTemplate(src: ImageRef, templateId: string) {
    return postJson<ImageRef>(this.fetcher, `${this.baseUrl}/apply-template`, { ...src, templateId });
  }
}

export class LocalModeration implements ModerationService {
  constructor(private readonly baseUrl: string, private readonly fetcher: Fetch = fetch) {}
  check(src: ImageRef, stage: "input" | "output") {
    return postJson<ModerationResult>(this.fetcher, `${this.baseUrl}/moderate`, { ...src, stage });
  }
}

/** Sélection d'un objet par clic : appelle SAM dans le service IA. */
export class LocalObjectSelector implements ObjectSelector {
  constructor(private readonly baseUrl: string, private readonly fetcher: Fetch = fetch) {}

  private post(path: string, body: unknown) {
    return this.fetcher(`${this.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async prepare(src: ImageRef) {
    const res = await this.post("/prepare", src);
    if (res.status === 415) throw new InvalidImage("Image illisible ou non supportée");
    if (!res.ok) throw new Error(`AI service /prepare responded ${res.status}`);
  }

  /** 422 = aucun objet sous le clic (cas attendu) ; 415 = image illisible. */
  async select(src: ImageRef, target: SegmentTarget) {
    const res = await this.post("/segment", { ...src, ...target });
    if (res.status === 422) throw new NoObjectFound("Aucun objet détecté à cet endroit");
    if (res.status === 415) throw new InvalidImage("Image illisible ou non supportée");
    if (!res.ok) throw new Error(`AI service /segment responded ${res.status}`);
    const body = (await res.json()) as { selectionId: string; overlay: string };
    return { selectionId: body.selectionId, overlayUrl: body.overlay };
  }

  /** 404 = sélection expirée (cas attendu : l'utilisateur doit retoucher son clic). */
  async commit(src: ImageRef, selectionId: string) {
    const res = await this.post("/commit", { ...src, selectionId });
    if (res.status === 404) throw new SelectionExpired("La sélection a expiré");
    if (res.status === 415) throw new InvalidImage("Image illisible ou non supportée");
    if (!res.ok) throw new Error(`AI service /commit responded ${res.status}`);
    return (await res.json()) as { image: ImageRef; mask: ImageRef };
  }
}
