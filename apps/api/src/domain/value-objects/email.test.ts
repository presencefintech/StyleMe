import { describe, expect, it } from "vitest";
import { Email } from "./email";
import { InvalidEmail } from "../errors";

describe("Email", () => {
  it("normalise casse et espaces", () => {
    expect(Email.of("  Jean.Dupont@Example.COM ").value).toBe("jean.dupont@example.com");
  });
  it("refuse un email invalide", () => {
    for (const bad of ["", "abc", "a@b", "a b@c.com", "@x.com"]) expect(() => Email.of(bad)).toThrow(InvalidEmail);
  });
});
