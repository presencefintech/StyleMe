import type { BackgroundService, ImageEnhancer, ModerationResult, ModerationService } from "../../domain/ports";
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
