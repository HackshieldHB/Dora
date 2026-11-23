import { ruleDiff, ruleError, type RuleDefinition } from "@/lib/domain";

type RuleRow = {
  id: string;
  code: string;
  definition: string;
  effectiveFrom: string;
  source: string;
  approvalStatus: string;
  reviewedBy: string;
  createdAt: Date;
};

export function recordedRuleChanges(rules: RuleRow[]) {
  const ordered = [...rules].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.createdAt.getTime() - right.createdAt.getTime());
  const rows: { id: string; code: string; program: string; field: string; before: string; after: string; source: string; effectiveFrom: string; status: string; user: string; when: string }[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const next = ordered[index];
    let before: unknown;
    let after: unknown;
    try {
      before = JSON.parse(previous.definition);
      after = JSON.parse(next.definition);
    } catch {
      continue;
    }
    if (ruleError(before) || ruleError(after)) continue;
    const when = next.createdAt.toISOString().slice(0, 16).replace("T", " ");
    for (const change of ruleDiff(before as RuleDefinition, after as RuleDefinition)) {
      rows.push({
        id: `${next.id}:${change.field}`,
        code: next.code,
        program: programOf(change.field),
        field: change.field,
        before: change.before,
        after: change.after,
        source: next.source,
        effectiveFrom: next.effectiveFrom,
        status: next.approvalStatus,
        user: next.reviewedBy,
        when,
      });
    }
  }
  return rows;
}

function programOf(field: string) {
  if (field.startsWith("kes")) return "JKN";
  if (field.startsWith("jht")) return "JHT";
  if (field.startsWith("jkk")) return "JKK";
  if (field.startsWith("jkm")) return "JKM";
  if (field.startsWith("jp")) return "JP";
  if (field.startsWith("PTKP") || field === "brackets") return "PPh 21";
  return "";
}

export type CompanyParameterChange = {
  id: string;
  program: string;
  field: string;
  before: string;
  after: string;
  effectiveFrom: string;
  reason: string;
  user: string;
  when: string;
};

/** Reads company-parameter audit lines. A sample statutory rule is not a change. */
export function companyParameterChanges(logs: { id: string; detail: string; createdAt: Date; actor: string }[]): CompanyParameterChange[] {
  const rows: CompanyParameterChange[] = [];
  for (const log of logs) {
    const parts = log.detail.split(" | ");
    if (parts[0] !== "company-parameter" || parts.length < 6) continue;
    const field = parts[1];
    rows.push({
      id: log.id,
      program: field === "JKK class" ? "JKK" : field === "BPJS Kesehatan participation" ? "JKN" : "BPJS",
      field,
      before: parts[2],
      after: parts[3],
      effectiveFrom: parts[4],
      reason: parts.slice(5).join(" | "),
      user: log.actor,
      when: log.createdAt.toISOString().slice(0, 16).replace("T", " "),
    });
  }
  return rows;
}
