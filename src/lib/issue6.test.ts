import { describe, expect, it } from "vitest";
import { placementError } from "./placement";
import { canEditPayroll, canSubmitPayroll, componentBefore } from "./payroll-flow";

describe("branch and work location", () => {
  it("keeps a stored pair and rejects a location from another branch", () => {
    expect(placementError("jakarta", null, true)).toBe("");
    expect(placementError("jakarta", "bandung", false)).toBe("That work location does not belong to the selected branch.");
    expect(placementError("", "jakarta", false)).toBe("Choose a branch before the work location.");
    expect(placementError("jakarta", "jakarta", false)).toBe("");
  });
});

describe("payroll manual edit", () => {
  it("allows the preparer to edit a draft, a processed payroll, and a revision", () => {
    expect(canEditPayroll("DRAFT", "", "dewi")).toBe(true);
    expect(canEditPayroll("PROCESSED", "dewi", "dewi")).toBe(true);
    expect(canEditPayroll("NEEDS_REVISION", "dewi", "dewi")).toBe(true);
    expect(canEditPayroll("NEEDS_REVISION", "dewi", "andi")).toBe(false);
    expect(canEditPayroll("SUBMITTED", "dewi", "dewi")).toBe(false);
    expect(canEditPayroll("APPROVED", "dewi", "dewi")).toBe(false);
    expect(canEditPayroll("LOCKED", "dewi", "dewi")).toBe(false);
  });

  it("keeps the component amount already stored before the next change", () => {
    expect(componentBefore(0, 0, 0)).toBe(0);
    expect(componentBefore(500000, 0, 0)).toBe(500000);
    expect(componentBefore(0, 0, 350000)).toBe(350000);
    expect(componentBefore(500000, 0, 100000)).toBe(600000);
    expect(componentBefore(700000, 200000, 0)).toBe(700000);
  });

  it("asks for a recalculation before a revised payroll can be submitted", () => {
    expect(canSubmitPayroll("PROCESSED", false)).toBe(true);
    expect(canSubmitPayroll("NEEDS_REVISION", false)).toBe(true);
    expect(canSubmitPayroll("NEEDS_REVISION", true)).toBe(false);
    expect(canSubmitPayroll("SUBMITTED", false)).toBe(false);
  });
});
