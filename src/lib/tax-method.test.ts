import { describe, expect, it } from "vitest";
import { SAMPLE_RULE, calculatePay } from "@/lib/domain";
import { isLastTaxMonth, lastMonthPph21, monthlyTerRate, terCategory } from "@/lib/tax-method";

describe("PPh 21 TER", () => {
  it("maps PTKP to TER and uses the PP 58/2023 monthly table", () => {
    expect(terCategory("TK/0")).toBe("A");
    expect(terCategory("K/1")).toBe("B");
    expect(terCategory("K/3")).toBe("C");
    expect(terCategory("X")).toBeNull();
    expect(monthlyTerRate("A", 10_000_000)).toBe(0.02);
    expect(monthlyTerRate("A", 5_400_000)).toBe(0);
    expect(monthlyTerRate("B", 10_000_000)).toBe(0.015);
    expect(monthlyTerRate("C", 10_000_000)).toBe(0.015);
  });

  it("settles the last tax month as annual Pasal 17 minus tax already withheld", () => {
    const settled = lastMonthPph21({
      grossYear: 120_000_000,
      months: 12,
      pensionYear: 0,
      ptkp: 54_000_000,
      priorPph: 2_200_000,
      brackets: SAMPLE_RULE.progressiveAnnual,
    });
    expect(settled.jabatan).toBe(6_000_000);
    expect(settled.pkp).toBe(60_000_000);
    expect(settled.annual).toBe(3_000_000);
    expect(settled.pph21).toBe(800_000);
    expect(isLastTaxMonth("2026-12-31", "2026-12-01", "")).toBe(true);
    expect(isLastTaxMonth("2026-06-30", "2026-06-01", "2026-06-15")).toBe(true);
    expect(isLastTaxMonth("2026-06-30", "2026-06-01", "")).toBe(false);
  });

  it("does not deduct an unenrolled program and does not tax an unsupported recipient as a permanent employee", () => {
    const base = {
      kind: "REGULAR" as const,
      basicSalary: 10_000_000,
      factor: 1,
      components: [],
      overtimeIdr: 0,
      unpaidLeaveDays: 0,
      workdaysInPeriod: 22,
      lateMinutes: 0,
      lateDeductionPerMinute: 0,
      adjustments: [],
      thrAmount: 0,
      bonusAmount: 0,
      ptkp: "TK/0",
      rule: SAMPLE_RULE,
      jkkClass: 1,
      bpjsKesEnabled: true,
      includeOvertime: false,
    };
    const skipped = calculatePay({ ...base, enrollment: { jkn: false, jht: true, jkk: true, jkm: true, jp: false } });
    expect(skipped.lines.some((line) => line.name.startsWith("BPJS Kesehatan"))).toBe(false);
    expect(skipped.lines.some((line) => line.name.startsWith("JP"))).toBe(false);
    expect(skipped.lines.some((line) => line.name.startsWith("JHT"))).toBe(true);
    const outsider = calculatePay({ ...base, employmentType: "DAILY" });
    expect(outsider.pph21).toBe(0);
    expect(outsider.warnings.some((line) => line.includes("not used"))).toBe(true);
  });
});
