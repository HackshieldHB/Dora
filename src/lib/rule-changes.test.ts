import { describe, expect, it } from "vitest";
import { companyParameterChanges } from "./rule-changes";

describe("company parameter history", () => {
  it("reads a JKK class change and ignores a sample-rule note", () => {
    const rows = companyParameterChanges([
      { id: "1", detail: "company-parameter | JKK class | 1 | 3 | 2026-12-01 | Annual review", createdAt: new Date("2026-11-23T02:00:00.000Z"), actor: "payroll@ilt.com" },
      { id: "2", detail: "JKK 3", createdAt: new Date("2026-11-23T02:00:00.000Z"), actor: "payroll@ilt.com" },
    ]);
    expect(rows).toEqual([{
      id: "1",
      program: "JKK",
      field: "JKK class",
      before: "1",
      after: "3",
      effectiveFrom: "2026-12-01",
      reason: "Annual review",
      user: "payroll@ilt.com",
      when: "2026-11-23 02:00",
    }]);
  });
});
