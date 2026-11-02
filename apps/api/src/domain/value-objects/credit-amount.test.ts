import { describe, expect, it } from "vitest";
import { CreditAmount } from "./credit-amount";

describe("CreditAmount", () => {
  it("refuse les non-entiers", () => {
    expect(() => CreditAmount.of(1.5)).toThrow();
  });
  it("compare et calcule", () => {
    const a = CreditAmount.of(5);
    const b = CreditAmount.of(3);
    expect(a.isGreaterOrEqual(b)).toBe(true);
    expect(b.isGreaterOrEqual(a)).toBe(false);
    expect(a.subtract(b).value).toBe(2);
    expect(a.add(b).value).toBe(8);
  });
});
