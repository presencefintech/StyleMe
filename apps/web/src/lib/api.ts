import type { AssetKind, JobStatus, JobType, Operator, PaymentStatus } from "@styleme/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface UserView { id: string; email: string; ageConfirmed: boolean }
export interface StyleView { id: string; name: string; kind: string; creditCost: number; previewUrl?: string }
export interface JobView {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: string | null;
  outputs?: { url: string }[];
  errorReason?: string;
}
export interface JobPage { items: JobView[]; nextCursor: string | null }
export interface PackView { id: string; credits: number; price: number; currency: string }

export type Fetcher = typeof fetch;

export function createApi(opts: { baseUrl: string; getToken: () => string | null; onUnauthorized?: () => void; fetcher?: Fetcher }) {
  const fetcher = opts.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function call<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const token = opts.getToken();
    const res = await fetcher(`${opts.baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      throw new ApiError(res.status, data.error ?? "HttpError", data.message ?? res.statusText);
    }
    return data as T;
  }

  const idem = () => ({ "idempotency-key": crypto.randomUUID() });

  return {
    register: (email: string, password: string) => call<{ accessToken: string; user: UserView }>("POST", "/auth/register", { email, password }),
    login: (email: string, password: string) => call<{ accessToken: string; user: UserView }>("POST", "/auth/login", { email, password }),
    confirmAge: () => call<void>("POST", "/auth/confirm-age", { confirmed: true }),

    presign: (kind: AssetKind) => call<{ assetId: string; uploadUrl: string; expiresAt: string }>("POST", "/assets/presign", { kind }),
    /** Upload direct vers Supabase Storage via l'URL signée (format de l'API signed-upload : PUT multipart). */
    async uploadToSignedUrl(uploadUrl: string, file: Blob) {
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const res = await fetcher(uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
      if (!res.ok) throw new ApiError(res.status, "UploadFailed", "L'envoi de la photo a échoué");
    },

    styles: () => call<StyleView[]>("GET", "/styles"),
    createJob: (input: { type: JobType; styleId?: string; inputAssetIds: string[] }) =>
      call<{ jobId: string; status: JobStatus }>("POST", "/jobs", input, idem()),
    getJob: (id: string) => call<JobView>("GET", `/jobs/${encodeURIComponent(id)}`),
    listJobs: (cursor?: string, limit = 20) =>
      call<JobPage>("GET", `/jobs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),

    balance: () => call<{ balance: number }>("GET", "/credits/balance"),
    packs: () => call<PackView[]>("GET", "/credits/packs"),
    initiatePayment: (input: { packId: string; phone: string; operator: Operator }) =>
      call<{ paymentId: string; status: PaymentStatus }>("POST", "/payments/initiate", input, idem()),
    getPayment: (id: string) => call<{ id: string; status: PaymentStatus }>("GET", `/payments/${encodeURIComponent(id)}`),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Message lisible pour l'utilisateur. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.status) {
      case 402: return "Crédits insuffisants.";
      case 403: return "Vous devez confirmer avoir plus de 18 ans.";
      case 401: return e.code === "InvalidCredentials" ? "Email ou mot de passe incorrect." : "Session expirée, reconnectez-vous.";
      case 409: return e.code === "EmailAlreadyUsed" ? "Un compte existe déjà avec cet email." : "Conflit, réessayez.";
      case 429: return "Trop de tentatives, réessayez dans un instant.";
      case 400: return e.code === "WeakPassword" ? "Mot de passe trop court (8 caractères minimum)." : e.code === "InvalidEmail" ? "Adresse email invalide." : "Informations invalides, vérifiez le formulaire.";
    }
    return e.message || "Une erreur est survenue.";
  }
  return "Une erreur est survenue.";
}

export const REJECTION_MESSAGES: Record<string, string> = {
  moderation_input: "Cette photo a été refusée par notre modération. Aucun crédit n'a été débité.",
  moderation_output: "Le résultat n'a pas pu être livré (modération). Aucun crédit n'a été débité.",
};
