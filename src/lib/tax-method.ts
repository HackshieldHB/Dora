export type TerCategory = "A" | "B" | "C";

type Band = { upTo: number; rate: number };

const TER_A: Band[] = [
  { upTo: 5_400_000, rate: 0 },
  { upTo: 5_650_000, rate: 0.0025 },
  { upTo: 5_950_000, rate: 0.005 },
  { upTo: 6_300_000, rate: 0.0075 },
  { upTo: 6_750_000, rate: 0.01 },
  { upTo: 7_500_000, rate: 0.0125 },
  { upTo: 8_550_000, rate: 0.015 },
  { upTo: 9_650_000, rate: 0.0175 },
  { upTo: 10_050_000, rate: 0.02 },
  { upTo: 10_350_000, rate: 0.0225 },
  { upTo: 10_700_000, rate: 0.025 },
  { upTo: 11_050_000, rate: 0.03 },
  { upTo: 11_600_000, rate: 0.035 },
  { upTo: 12_500_000, rate: 0.04 },
  { upTo: 13_750_000, rate: 0.05 },
  { upTo: 15_100_000, rate: 0.06 },
  { upTo: 16_950_000, rate: 0.07 },
  { upTo: 19_750_000, rate: 0.08 },
  { upTo: 24_150_000, rate: 0.09 },
  { upTo: 26_450_000, rate: 0.1 },
  { upTo: 28_000_000, rate: 0.11 },
  { upTo: 30_050_000, rate: 0.12 },
  { upTo: 32_400_000, rate: 0.13 },
  { upTo: 35_400_000, rate: 0.14 },
  { upTo: 39_100_000, rate: 0.15 },
  { upTo: 43_850_000, rate: 0.16 },
  { upTo: 47_800_000, rate: 0.17 },
  { upTo: 51_400_000, rate: 0.18 },
  { upTo: 56_300_000, rate: 0.19 },
  { upTo: 62_200_000, rate: 0.2 },
  { upTo: 68_600_000, rate: 0.21 },
  { upTo: 77_500_000, rate: 0.22 },
  { upTo: 89_000_000, rate: 0.23 },
  { upTo: 103_000_000, rate: 0.24 },
  { upTo: 125_000_000, rate: 0.25 },
  { upTo: 157_000_000, rate: 0.26 },
  { upTo: 206_000_000, rate: 0.27 },
  { upTo: 337_000_000, rate: 0.28 },
  { upTo: 454_000_000, rate: 0.29 },
  { upTo: 550_000_000, rate: 0.3 },
  { upTo: 695_000_000, rate: 0.31 },
  { upTo: 910_000_000, rate: 0.32 },
  { upTo: 1_400_000_000, rate: 0.33 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.34 },
];

const TER_B: Band[] = [
  { upTo: 6_200_000, rate: 0 },
  { upTo: 6_500_000, rate: 0.0025 },
  { upTo: 6_850_000, rate: 0.005 },
  { upTo: 7_300_000, rate: 0.0075 },
  { upTo: 9_200_000, rate: 0.01 },
  { upTo: 10_750_000, rate: 0.015 },
  { upTo: 11_250_000, rate: 0.02 },
  { upTo: 11_600_000, rate: 0.025 },
  { upTo: 12_600_000, rate: 0.03 },
  { upTo: 13_600_000, rate: 0.04 },
  { upTo: 14_950_000, rate: 0.05 },
  { upTo: 16_400_000, rate: 0.06 },
  { upTo: 18_450_000, rate: 0.07 },
  { upTo: 21_850_000, rate: 0.08 },
  { upTo: 26_000_000, rate: 0.09 },
  { upTo: 27_700_000, rate: 0.1 },
  { upTo: 29_350_000, rate: 0.11 },
  { upTo: 31_450_000, rate: 0.12 },
  { upTo: 33_950_000, rate: 0.13 },
  { upTo: 37_100_000, rate: 0.14 },
  { upTo: 41_100_000, rate: 0.15 },
  { upTo: 45_800_000, rate: 0.16 },
  { upTo: 49_500_000, rate: 0.17 },
  { upTo: 53_800_000, rate: 0.18 },
  { upTo: 58_500_000, rate: 0.19 },
  { upTo: 64_000_000, rate: 0.2 },
  { upTo: 71_000_000, rate: 0.21 },
  { upTo: 80_000_000, rate: 0.22 },
  { upTo: 93_000_000, rate: 0.23 },
  { upTo: 109_000_000, rate: 0.24 },
  { upTo: 129_000_000, rate: 0.25 },
  { upTo: 163_000_000, rate: 0.26 },
  { upTo: 211_000_000, rate: 0.27 },
  { upTo: 374_000_000, rate: 0.28 },
  { upTo: 459_000_000, rate: 0.29 },
  { upTo: 555_000_000, rate: 0.3 },
  { upTo: 704_000_000, rate: 0.31 },
  { upTo: 957_000_000, rate: 0.32 },
  { upTo: 1_405_000_000, rate: 0.33 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.34 },
];

const TER_C: Band[] = [
  { upTo: 6_600_000, rate: 0 },
  { upTo: 6_950_000, rate: 0.0025 },
  { upTo: 7_350_000, rate: 0.005 },
  { upTo: 7_800_000, rate: 0.0075 },
  { upTo: 8_850_000, rate: 0.01 },
  { upTo: 9_800_000, rate: 0.0125 },
  { upTo: 10_950_000, rate: 0.015 },
  { upTo: 11_200_000, rate: 0.0175 },
  { upTo: 12_050_000, rate: 0.02 },
  { upTo: 12_950_000, rate: 0.03 },
  { upTo: 14_150_000, rate: 0.04 },
  { upTo: 15_550_000, rate: 0.05 },
  { upTo: 17_050_000, rate: 0.06 },
  { upTo: 19_500_000, rate: 0.07 },
  { upTo: 22_700_000, rate: 0.08 },
  { upTo: 26_600_000, rate: 0.09 },
  { upTo: 28_100_000, rate: 0.1 },
  { upTo: 30_100_000, rate: 0.11 },
  { upTo: 32_600_000, rate: 0.12 },
  { upTo: 35_400_000, rate: 0.13 },
  { upTo: 38_900_000, rate: 0.14 },
  { upTo: 43_000_000, rate: 0.15 },
  { upTo: 47_400_000, rate: 0.16 },
  { upTo: 51_200_000, rate: 0.17 },
  { upTo: 55_800_000, rate: 0.18 },
  { upTo: 60_400_000, rate: 0.19 },
  { upTo: 66_700_000, rate: 0.2 },
  { upTo: 74_500_000, rate: 0.21 },
  { upTo: 83_200_000, rate: 0.22 },
  { upTo: 95_600_000, rate: 0.23 },
  { upTo: 110_000_000, rate: 0.24 },
  { upTo: 134_000_000, rate: 0.25 },
  { upTo: 169_000_000, rate: 0.26 },
  { upTo: 221_000_000, rate: 0.27 },
  { upTo: 390_000_000, rate: 0.28 },
  { upTo: 463_000_000, rate: 0.29 },
  { upTo: 561_000_000, rate: 0.3 },
  { upTo: 709_000_000, rate: 0.31 },
  { upTo: 965_000_000, rate: 0.32 },
  { upTo: 1_419_000_000, rate: 0.33 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.34 },
];

export const TER_TABLES: Record<TerCategory, Band[]> = { A: TER_A, B: TER_B, C: TER_C };

export const DAILY_TER = [
  { upTo: 450_000, rate: 0 },
  { upTo: 2_500_000, rate: 0.005 },
];

export const TER_SOURCE = "PP 58/2023 and PMK 168/2023, effective 1 January 2024";

const EMPLOYEES = new Set(["PERMANENT", "CONTRACT", "PROBATION"]);

export function terCategory(ptkp: string): TerCategory | null {
  if (ptkp === "TK/0" || ptkp === "TK/1" || ptkp === "K/0") return "A";
  if (ptkp === "TK/2" || ptkp === "TK/3" || ptkp === "K/1" || ptkp === "K/2") return "B";
  if (ptkp === "K/3") return "C";
  return null;
}

export function monthlyTerRate(category: TerCategory, gross: number): number {
  const table = TER_TABLES[category];
  for (const band of table) {
    if (gross <= band.upTo) return band.rate;
  }
  return table[table.length - 1].rate;
}

export function isLastTaxMonth(periodEnd: string, periodStart: string, lastWorkingDay: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return false;
  if (periodEnd.slice(5, 7) === "12") return true;
  return Boolean(lastWorkingDay) && lastWorkingDay >= periodStart && lastWorkingDay <= periodEnd;
}

export function positionCost(grossYear: number, months: number): number {
  return Math.min(Math.round(grossYear * 0.05), 500_000 * Math.max(months, 1));
}

function progressiveAnnualTax(taxable: number, brackets: { upTo: number | null; rate: number }[]): number {
  if (taxable <= 0) return 0;
  let remaining = taxable;
  let previous = 0;
  let tax = 0;
  for (const bracket of brackets) {
    const spanWidth = bracket.upTo == null ? remaining : Math.max(0, Math.min(remaining, bracket.upTo - previous));
    tax += spanWidth * bracket.rate;
    remaining -= spanWidth;
    previous = bracket.upTo ?? previous;
    if (remaining <= 0) break;
  }
  return tax;
}

export function lastMonthPph21(input: {
  grossYear: number;
  months: number;
  pensionYear: number;
  ptkp: number;
  priorPph: number;
  brackets: { upTo: number | null; rate: number }[];
}) {
  const jabatan = positionCost(input.grossYear, input.months);
  const pkp = Math.max(0, input.grossYear - jabatan - input.pensionYear - input.ptkp);
  const annual = Math.round(progressiveAnnualTax(pkp, input.brackets));
  return { jabatan, pkp, annual, pph21: annual - input.priorPph };
}

export function withholdPph21(input: {
  kind: "REGULAR" | "THR" | "BONUS" | "ADJUSTMENT";
  earnings: number;
  ptkpStatus: string;
  ptkpAnnual: Record<string, number>;
  brackets: { upTo: number | null; rate: number }[];
  pensionThisPeriod: number;
  employmentType?: string;
  periodStart?: string;
  periodEnd?: string;
  lastWorkingDay?: string;
  priorGross?: number;
  priorPph?: number;
  priorMonths?: number;
  priorPension?: number;
  sameMonthGross?: number;
  sameMonthPph?: number;
  sameMonthKnown?: boolean;
}): { amount: number; warnings: string[] } {
  const warnings: string[] = [];
  const employment = input.employmentType || "PERMANENT";
  if (!EMPLOYEES.has(employment)) {
    warnings.push("PPh 21 was not calculated. This person is outside the supported employee categories, so the permanent-employee method was not used.");
    return { amount: 0, warnings };
  }
  const category = terCategory(input.ptkpStatus);
  const ptkp = input.ptkpAnnual[input.ptkpStatus];
  if (!category || ptkp == null) {
    warnings.push(`PTKP status ${input.ptkpStatus} is not in the active platform rule, so PPh 21 was not calculated.`);
    return { amount: 0, warnings };
  }
  const last = Boolean(input.periodEnd && input.periodStart && isLastTaxMonth(input.periodEnd, input.periodStart, input.lastWorkingDay || ""));
  const extra = input.kind === "THR" || input.kind === "BONUS";
  if (extra && !input.sameMonthKnown) {
    warnings.push("THR or bonus was not taxed on its own. Monthly TER uses the combined gross of that tax month, and the regular payroll for that month is not recorded.");
    return { amount: 0, warnings };
  }
  if (last && input.kind === "REGULAR") {
    const months = (input.priorMonths ?? 0) + 1;
    const settled = lastMonthPph21({
      grossYear: (input.priorGross ?? 0) + input.earnings,
      months,
      pensionYear: (input.priorPension ?? 0) + input.pensionThisPeriod,
      ptkp,
      priorPph: input.priorPph ?? 0,
      brackets: input.brackets,
    });
    warnings.push("PPh 21 method: last tax month. Earlier months without a stored payroll are not estimated.");
    return { amount: settled.pph21, warnings };
  }
  if (last && extra) {
    const months = (input.priorMonths ?? 0) + 1;
    const settled = lastMonthPph21({
      grossYear: (input.priorGross ?? 0) + (input.sameMonthGross ?? 0) + input.earnings,
      months,
      pensionYear: (input.priorPension ?? 0) + input.pensionThisPeriod,
      ptkp,
      priorPph: (input.priorPph ?? 0) + (input.sameMonthPph ?? 0),
      brackets: input.brackets,
    });
    warnings.push("PPh 21 method: last tax month. THR or bonus is included in the annual settlement for that month.");
    return { amount: settled.pph21, warnings };
  }
  const gross = extra ? (input.sameMonthGross ?? 0) + input.earnings : input.earnings;
  const full = Math.round(gross * monthlyTerRate(category, gross));
  const amount = extra ? full - (input.sameMonthPph ?? 0) : full;
  warnings.push(`PPh 21 method: monthly TER ${category}.`);
  return { amount, warnings };
}
