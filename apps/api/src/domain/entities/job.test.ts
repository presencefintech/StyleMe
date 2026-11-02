import { describe, expect, it } from "vitest";
import { Job } from "./job";
import { CreditAmount } from "../value-objects/credit-amount";
import { InvalidJobTransition } from "../errors";

const make = () =>
  Job.create({ id: "j1", userId: "u1", type: "ENHANCE", creditCost: CreditAmount.of(1), inputAssetIds: ["a1"] });

describe("Job", () => {
  it("démarre PENDING et non facturable", () => {
    const j = make();
    expect(j.status).toBe("PENDING");
    expect(j.isBillable()).toBe(false);
  });
  it("PENDING → PROCESSING → DONE est facturable", () => {
    const j = make();
    j.markProcessing();
    j.markDone(["out1"]);
    expect(j.status).toBe("DONE");
    expect(j.outputAssetIds).toEqual(["out1"]);
    expect(j.isBillable()).toBe(true);
  });
  it("rejeté/échoué n'est pas facturable", () => {
    const a = make();
    a.markProcessing();
    a.markRejected("moderation_input");
    const b = make();
    b.markProcessing();
    b.markFailed("boom");
    expect(a.isBillable()).toBe(false);
    expect(b.isBillable()).toBe(false);
    expect(a.errorReason).toBe("moderation_input");
  });
  it("refuse les transitions invalides", () => {
    const j = make();
    expect(() => j.markDone(["x"])).toThrow(InvalidJobTransition);
    j.markProcessing();
    expect(() => j.markProcessing()).toThrow(InvalidJobTransition);
  });
});
