import { describe, expect, it } from "vitest";
import { assertDecision } from "./decision";
import { inApprovalScope } from "./approval-scope";

describe("approval decisions", () => {
  it("rejects an empty decision before any status is changed", () => {
    expect(() => assertDecision("", ["APPROVED", "REJECTED", "RETURNED"])).toThrow(/Choose approve, reject, or return/);
  });

  it("keeps a real approve, reject, or return", () => {
    expect(assertDecision("APPROVED", ["APPROVED", "REJECTED", "RETURNED"])).toBe("APPROVED");
    expect(assertDecision("RETURNED", ["APPROVED", "REJECTED", "RETURNED"])).toBe("RETURNED");
  });

  it("shows a manager only their own scope, and payroll history only to company payroll", () => {
    const manager = { dataScope: "DIRECT_REPORTS", userId: "sari", scopeIds: new Set(["budi"]) };
    expect(inApprovalScope({ ...manager, actorId: "rina", assigneeId: "sari", originalAssigneeId: "", requesterId: "budi", module: "LEAVE", employeeId: "other" })).toBe(true);
    expect(inApprovalScope({ ...manager, actorId: "rina", assigneeId: "andi", originalAssigneeId: "", requesterId: "other", module: "LEAVE", employeeId: "other" })).toBe(false);
    expect(inApprovalScope({ ...manager, actorId: "rina", assigneeId: "andi", originalAssigneeId: "", requesterId: "budi", module: "LEAVE", employeeId: "budi" })).toBe(true);
    expect(inApprovalScope({ dataScope: "COMPANY", userId: "andi", actorId: "dewi", assigneeId: "andi", originalAssigneeId: "", requesterId: "dewi", module: "PAYROLL", employeeId: "", scopeIds: null })).toBe(true);
    expect(inApprovalScope({ ...manager, actorId: "dewi", assigneeId: "andi", originalAssigneeId: "", requesterId: "dewi", module: "PAYROLL", employeeId: "" })).toBe(false);
  });
});
