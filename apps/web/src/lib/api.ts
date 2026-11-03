import type { AssetKind, GarmentCategory, JobStatus, JobType, Operator, PaymentStatus, PostVisibility } from "@styleme/shared";

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
/** Tenue du catalogue (essayage virtuel). previewUrl est signée et expire. */
export interface GarmentView { id: string; name: string; category: GarmentCategory; description?: string; previewUrl: string }
export interface StyleView { id: string; name: string; kind: string; creditCost: number; previewUrl?: string }
export interface JobView {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: string | null;
  outputs?: { url: string }[];
  /** Photo d'origine (comparaison avant/après) ; absente si purgée. */
  sourceUrl?: string;
  errorReason?: string;
}
export interface JobPage { items: JobView[]; nextCursor: string | null }
/** Résultat d'une sélection par clic (gomme magique). */
/** Ce que l'utilisateur désigne sur la photo (coordonnées normalisées 0..1) : un clic sur un objet, ou un rectangle tracé. */
export type SegmentTarget = { x: number; y: number } | { box: { x0: number; y0: number; x1: number; y1: number } };
/** Aperçu d'une sélection (gomme magique) : instantané, rien n'est encore enregistré. */
export interface SegmentResult { selectionId: string; overlayUrl: string }
/** Sélection confirmée : la photo normalisée et le masque, entrées du job ERASE. */
export interface CommittedSelection { imageAssetId: string; maskAssetId: string }
export interface ReferralView { code: string; referrals: number; signupBonus: number; referrerBonus: number; maxRewardedReferrals: number }
export interface PackView { id: string; credits: number; price: number; currency: string }

/** Look publié dans le fil. imageUrl est signée et expire. L'auteure n'est jamais nommée. */
export interface PostView {
  id: string;
  imageUrl: string;
  caption?: string;
  visibility: PostVisibility;
  look: { garmentId?: string; hairstyleId?: string; hairstyleName?: string; makeupId?: string; makeupName?: string; accessoryIds: string[]; occasionId?: string };
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  hidden: boolean;
  createdAt: string;
}
export interface PostPage { items: PostView[]; nextCursor: string | null }
export type ReportReason = "inapproprie" | "usurpation" | "autre";

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
    register: (email: string, password: string, referralCode?: string) =>
      call<{ accessToken: string; user: UserView }>("POST", "/auth/register", { email, password, ...(referralCode ? { referralCode } : {}) }),
    login: (email: string, password: string) => call<{ accessToken: string; user: UserView }>("POST", "/auth/login", { email, password }),
    confirmAge: () => call<void>("POST", "/auth/confirm-age", { confirmed: true }),
    /** Efface les photos et anonymise le compte (le mot de passe est redemandé). */
    deleteAccount: (password: string) => call<void>("POST", "/auth/delete-account", { password }),

    presign: (kind: AssetKind) => call<{ assetId: string; uploadUrl: string; expiresAt: string }>("POST", "/assets/presign", { kind }),
    /** Upload direct vers Supabase Storage via l'URL signée (format de l'API signed-upload : PUT multipart). */
    async uploadToSignedUrl(uploadUrl: string, file: Blob) {
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const res = await fetcher(uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
      if (!res.ok) throw new ApiError(res.status, "UploadFailed", "L'envoi de la photo a échoué");
    },

    /** Préchauffe l'analyse de la photo juste après son envoi (au mieux : le résultat est ignoré). */
    prepare: (assetId: string) => call<void>("POST", `/assets/${encodeURIComponent(assetId)}/prepare`),
    /** Gomme magique : l'objet sous le clic (x, y normalisés 0..1) est sélectionné et prévisualisé. */
    segment: (assetId: string, target: SegmentTarget) => call<SegmentResult>("POST", `/assets/${encodeURIComponent(assetId)}/segment`, target),
    /** Confirme la sélection (envoie la photo normalisée et le masque au stockage). */
    commitSelection: (assetId: string, selectionId: string) =>
      call<CommittedSelection>("POST", `/assets/${encodeURIComponent(assetId)}/selection`, { selectionId }),
    /** Fait du résultat d'un job une photo réutilisable (ex. gommer un autre objet dessus). */
    jobAsAsset: (jobId: string) => call<{ assetId: string; url: string }>("POST", `/jobs/${encodeURIComponent(jobId)}/asset`),

    styles: () => call<StyleView[]>("GET", "/styles"),
    garments: () => call<GarmentView[]>("GET", "/garments"),
    createJob: (input: { type: JobType; styleId?: string; garmentId?: string; hairstyleId?: string; makeupId?: string; accessoryIds?: string[]; prompt?: string; inputAssetIds?: string[]; fromJobId?: string }) =>
      call<{ jobId: string; status: JobStatus }>("POST", "/jobs", { inputAssetIds: [], ...input }, idem()),
    getJob: (id: string) => call<JobView>("GET", `/jobs/${encodeURIComponent(id)}`),
    listJobs: (cursor?: string, limit = 20) =>
      call<JobPage>("GET", `/jobs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),

    publishPost: (input: { jobId: string; visibility: PostVisibility; caption?: string }) =>
      call<PostView>("POST", "/posts", { ...input, consent: true }),
    feed: (cursor?: string) => call<PostPage>("GET", `/posts?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    myPosts: (cursor?: string) => call<PostPage>("GET", `/posts/mine?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    getPost: (id: string) => call<PostView>("GET", `/posts/${encodeURIComponent(id)}`),
    deletePost: (id: string) => call<void>("DELETE", `/posts/${encodeURIComponent(id)}`),
    setLike: (id: string, liked: boolean) => call<void>(liked ? "PUT" : "DELETE", `/posts/${encodeURIComponent(id)}/like`),
    reportPost: (id: string, reason: ReportReason) => call<void>("POST", `/posts/${encodeURIComponent(id)}/report`, { reason }),

    balance: () => call<{ balance: number }>("GET", "/credits/balance"),
    packs: () => call<PackView[]>("GET", "/credits/packs"),
    referral: () => call<ReferralView>("GET", "/credits/referral"),
    initiatePayment: (input: { packId: string; phone: string; operator: Operator }) =>
      call<{ paymentId: string; status: PaymentStatus }>("POST", "/payments/initiate", input, idem()),
    getPayment: (id: string) => call<{ id: string; status: PaymentStatus }>("GET", `/payments/${encodeURIComponent(id)}`),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Message lisible pour l'utilisateur. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "NoObjectFound": return "Aucun objet détecté ici. Visez le centre de l'objet à enlever, pas le fond.";
      case "InvalidImage": return "Cette photo ne peut pas être analysée (format ou taille non supportés). Essayez un JPEG ou un PNG plus léger.";
      case "SelectionExpired": return "La sélection a expiré. Touchez à nouveau l'objet.";
      case "PasswordMismatch": return "Mot de passe incorrect.";
    }
    switch (e.status) {
      case 402: return "Crédits insuffisants.";
      case 403: return "Vous devez confirmer avoir plus de 18 ans.";
      case 401: return e.code === "InvalidCredentials" ? "Email ou mot de passe incorrect." : "Session expirée, reconnectez-vous.";
      case 409: return e.code === "EmailAlreadyUsed" ? "Un compte existe déjà avec cet email." : "Conflit, réessayez.";
      case 429: return "Trop de tentatives, réessayez dans un instant.";
      case 422: return e.code === "NoObjectFound" ? "Aucun objet détecté ici. Touchez bien au centre de l'objet à enlever, pas sur le fond." : "Cette image ne peut pas être traitée.";
      case 400: return e.code === "WeakPassword" ? "Mot de passe trop court (8 caractères minimum)." : e.code === "InvalidEmail" ? "Adresse email invalide." : "Informations invalides, vérifiez le formulaire.";
    }
    return e.message || "Une erreur est survenue.";
  }
  return "Une erreur est survenue.";
}

export const REJECTION_MESSAGES: Record<string, string> = {
  moderation_input: "Cette photo a été refusée par notre modération. Aucun crédit n'a été débité.",
  moderation_output: "Le résultat n'a pas pu être livré (modération). Aucun crédit n'a été débité.",
  provider_content_flagged:
    "Le service d'IA a jugé la photo ou la demande sensible et a refusé de la traiter. Reformulez avec une instruction plus simple (une modification à la fois) ou essayez une autre photo. Aucun crédit n'a été débité.",
};
