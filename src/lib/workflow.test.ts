import { describe, expect, it } from "vitest";
import { isLastApprovalLevel, parseLevels, validateLevels } from "./workflow";

describe("approval workflow levels", () => {
  it("keeps only complete levels", () => {
    expect(parseLevels('[{"kind":"DIRECT"},{"kind":"ROLE","roleId":"r1"},{"kind":"NOPE"}]')).toEqual([
      { kind: "DIRECT", roleId: "", userId: "" },
      { kind: "ROLE", roleId: "r1", userId: "" },
    ]);
  });

  it("rejects an empty chain and an inactive role", () => {
    expect(validateLevels([], [], [])).toBe("Add at least one approval level.");
    expect(validateLevels([{ kind: "ROLE", roleId: "old", userId: "" }], [{ id: "old", active: false }], [])).toBe("Each role approver must be an active role.");
    expect(validateLevels([{ kind: "USER", roleId: "", userId: "gone" }], [], [{ id: "gone", status: "DISABLED" }])).toBe("Each specific approver must be an active user.");
  });

  it("treats only the current last level as final", () => {
    expect(isLastApprovalLevel(1, 2)).toBe(false);
    expect(isLastApprovalLevel(2, 2)).toBe(true);
  });
});
