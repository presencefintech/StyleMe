import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi, errorMessage } from "./api";

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, statusText: "x", json: async () => body }) as Response;

function make(fetcher: ReturnType<typeof vi.fn>, token: string | null = "tok", onUnauthorized = vi.fn()) {
  return { api: createApi({ baseUrl: "http://api/v1", getToken: () => token, onUnauthorized, fetcher: fetcher as unknown as typeof fetch }), onUnauthorized };
}

describe("api client", () => {
  it("envoie le Bearer et le JSON", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { balance: 3 }));
    const { api } = make(f);
    expect(await api.balance()).toEqual({ balance: 3 });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("http://api/v1/credits/balance");
    expect(init.headers.authorization).toBe("Bearer tok");
  });

  it("gère le 204 sans corps", async () => {
    const f = vi.fn().mockResolvedValue(res(204));
    await expect(make(f).api.confirmAge()).resolves.toBeUndefined();
  });

  it("ajoute une Idempotency-Key unique sur la création de job", async () => {
    const f = vi.fn().mockResolvedValue(res(201, { jobId: "j", status: "PENDING" }));
    const { api } = make(f);
    await api.createJob({ type: "ENHANCE", inputAssetIds: ["a"] });
    await api.createJob({ type: "ENHANCE", inputAssetIds: ["a"] });
    const k1 = f.mock.calls[0]![1].headers["idempotency-key"];
    const k2 = f.mock.calls[1]![1].headers["idempotency-key"];
    expect(k1).toBeTruthy();
    expect(k1).not.toBe(k2);
  });

  it("transforme une erreur HTTP en ApiError et notifie un 401 avec token", async () => {
    const f = vi.fn().mockResolvedValue(res(401, { error: "Unauthorized", message: "nope" }));
    const { api, onUnauthorized } = make(f);
    await expect(api.balance()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("ne notifie pas un 401 sans token (mauvais mot de passe)", async () => {
    const f = vi.fn().mockResolvedValue(res(401, { error: "InvalidCredentials", message: "x" }));
    const { api, onUnauthorized } = make(f, null);
    await expect(api.login("a@b.co", "mauvais")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("encode l'id et le curseur dans l'URL", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { items: [], nextCursor: null }));
    await make(f).api.listJobs("a b", 5);
    expect(f.mock.calls[0]![0]).toBe("http://api/v1/jobs?limit=5&cursor=a%20b");
  });
});

describe("errorMessage", () => {
  it("traduit les statuts clés", () => {
    expect(errorMessage(new ApiError(402, "InsufficientCredits", ""))).toMatch(/Crédits/);
    expect(errorMessage(new ApiError(401, "InvalidCredentials", ""))).toMatch(/mot de passe incorrect/);
    expect(errorMessage(new ApiError(409, "EmailAlreadyUsed", ""))).toMatch(/existe déjà/);
    expect(errorMessage(new Error("x"))).toMatch(/erreur/);
  });
});
