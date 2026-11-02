import { describe, expect, it } from "vitest";
import { err, ok } from "./result";

describe("Result", () => {
  it("ok porte la valeur", () => {
    const r = ok(1);
    expect(r.ok && r.value).toBe(1);
  });
  it("err porte l'erreur", () => {
    const r = err("boom");
    expect(!r.ok && r.error).toBe("boom");
  });
});
