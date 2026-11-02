import { describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "./auth-adapters";

describe("ScryptPasswordHasher", () => {
  const h = new ScryptPasswordHasher();
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const stored = await h.hash("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(await h.verify("correct horse battery", stored)).toBe(true);
    expect(await h.verify("wrong password", stored)).toBe(false);
  });
  it("utilise un sel différent à chaque hash", async () => {
    expect(await h.hash("same-password")).not.toBe(await h.hash("same-password"));
  });
  it("refuse un hash absent ou malformé sans lever", async () => {
    expect(await h.verify("x", "")).toBe(false);
    expect(await h.verify("x", "garbage")).toBe(false);
  });
});
