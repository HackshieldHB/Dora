export type BpjsProgram = {
  code: string;
  family: "health" | "tk";
  name: string;
  kind: string;
  description: string;
  membership: string;
  payer: string;
  law: string;
  article: string;
  special: string;
  wage: string;
  formula: string;
};

export const BPJS_PROGRAMS: BpjsProgram[] = [
  {
    code: "JKN",
    family: "health",
    name: "Jaminan Kesehatan",
    kind: "BPJS Kesehatan",
    description: "Health insurance for wage-earning participants. It is a separate program from BPJS Ketenagakerjaan.",
    membership: "Wage-earning participant enrolled by the employer.",
    payer: "Employee and employer, by the verified participant category.",
    law: "Presidential Regulation 82/2018 as amended, including Presidential Regulation 59/2024.",
    article: "The contribution article that applies to wage-earning participants for the period.",
    special: "Perpres 59/2024 amends the earlier regulation. It does not by itself replace every operational contribution rule in Perpres 82/2018.",
    wage: "Wage base and cap for the participant category, only when a verified parameter is stored.",
    formula: "Employee contribution and employer contribution are calculated separately. A stored 1% and 4% pair is a stored parameter until that rule is approved.",
  },
  {
    code: "JHT",
    family: "tk",
    name: "Jaminan Hari Tua",
    kind: "BPJS Ketenagakerjaan",
    description: "Old-age savings for wage-earning participants covered by the stored rule.",
    membership: "Wage-earning participant enrolled in JHT.",
    payer: "Employee 2% and employer 3.7% where PP 46/2015 article 16 applies.",
    law: "Government Regulation 46/2015.",
    article: "Article 16.",
    special: "The whole payroll gross is not automatically the JHT wage base. Fixed pay is used. Reviewed overtime is included only when the company parameter says so.",
    wage: "Wage base under the applicable wage rule for that participant. No separate cap is stored.",
    formula: "Each party's contribution = JHT wage base × that party's percentage.",
  },
  {
    code: "JKK",
    family: "tk",
    name: "Jaminan Kecelakaan Kerja",
    kind: "BPJS Ketenagakerjaan",
    description: "Work-accident cover. The employer pays the contribution.",
    membership: "Wage-earning participant enrolled in JKK.",
    payer: "Employer.",
    law: "Government Regulation 44/2015.",
    article: "Article 16 and the amendments that apply to the period.",
    special: "The risk class is the class stored for the company. It is not chosen per calculation.",
    wage: "Wage base for the work-accident program. No wage cap is stored.",
    formula: "Employer contribution = wage base × the rate of the stored risk class.",
  },
  {
    code: "JKM",
    family: "tk",
    name: "Jaminan Kematian",
    kind: "BPJS Ketenagakerjaan",
    description: "Death benefit. The employer pays the contribution.",
    membership: "Wage-earning participant enrolled in JKM.",
    payer: "Employer.",
    law: "Government Regulation 44/2015.",
    article: "Article 18.",
    special: "JKM is not an employee deduction.",
    wage: "Wage base for JKM. No wage cap is stored.",
    formula: "Contribution = JKM wage base × the rate in force. The stored rate for this category is 0.30%.",
  },
  {
    code: "JP",
    family: "tk",
    name: "Jaminan Pensiun",
    kind: "BPJS Ketenagakerjaan",
    description: "Pension contribution on basic salary plus fixed allowances, subject to the cap for the period.",
    membership: "Wage-earning participant enrolled in JP.",
    payer: "Employee 1% and employer 2%.",
    law: "Government Regulation 45/2015.",
    article: "Article 28 and Article 29.",
    special: "The Rp7,000,000 figure in that regulation is the 2015 starting cap, not a permanent cap. Payroll uses the cap stored on the rule for the period.",
    wage: "Basic salary plus fixed allowances, then the stored maximum for the period.",
    formula: "Wage used = the wage base, limited by the period cap. Employee = wage used × 1%. Employer = wage used × 2%.",
  },
  {
    code: "JKP",
    family: "tk",
    name: "Jaminan Kehilangan Pekerjaan",
    kind: "BPJS Ketenagakerjaan",
    description: "Job-loss benefit. It is its own program and is funded through the central government and recomposition of other contributions.",
    membership: "Not stored as a separate employee deduction.",
    payer: "Not an extra employee deduction.",
    law: "BPJS Ketenagakerjaan publication of 17 December 2025, pending the regulation that sets the active formula.",
    article: "The funding article has not been stored as a verified rate.",
    special: "Percentage, wage cap, and funding are not activated until a verified JKP regulation is stored. JKP is not deducted from pay.",
    wage: "Not activated.",
    formula: "No verified formula is stored, so no contribution is calculated.",
  },
];

export function bpjsProgram(code: string) {
  return BPJS_PROGRAMS.find((item) => item.code === code) ?? null;
}
