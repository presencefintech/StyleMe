import { describe, expect, it } from "vitest";
import { PhoneNumber } from "./phone-number";
import { InvalidPhoneNumber } from "../errors";

describe("PhoneNumber", () => {
  it("normalise un numéro E.164", () => {
    expect(PhoneNumber.of("+243 81 234 5678").value).toBe("+243812345678");
  });
  it("refuse un numéro invalide", () => {
    expect(() => PhoneNumber.of("0812345678")).toThrow(InvalidPhoneNumber);
  });
});
