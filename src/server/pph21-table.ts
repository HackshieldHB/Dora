import { prisma } from "@/lib/db";
import type { PphResultRow } from "@/components/pph21-workspace";

export async function loadPph21Rows(companyId: string, query: { period?: string; employee?: string; status?: string }): Promise<PphResultRow[]> {
  const items = await prisma.payrollItem.findMany({
    where: { period: { companyId } },
    include: { employee: true, period: true },
    orderBy: [{ period: { startDate: "desc" } }, { employee: { fullName: "asc" } }],
  });
  const ruleIds = [...new Set(items.map((item) => item.period.statutoryRuleId).filter(Boolean))];
  const rules = ruleIds.length ? await prisma.statutoryRule.findMany({ where: { id: { in: ruleIds } } }) : [];
  const official = new Map(rules.map((rule) => [rule.id, rule.approvalStatus === "APPROVED"]));
  const needle = (query.employee || "").trim().toLowerCase();
  return items.flatMap((item) => {
    const period = item.period.startDate.slice(0, 7);
    const note = item.period.warningNote || "";
    const own = note.split("\n").filter((line) => line.startsWith(`${item.employee.fullName}: `)).join(" ");
    const ter = own.match(/monthly TER ([ABC])/);
    const method = own.includes("last tax month") ? "Last tax month" : ter ? `Monthly TER ${ter[1]}` : own.includes("divided by 12") || note.includes("divided by 12") ? "Stored annual method" : "Stored result";
    const verified = official.get(item.period.statutoryRuleId) === true && !note.includes("sample rule");
    const status = item.period.status === "LOCKED" ? "Locked payroll" : verified ? "Stored result" : "Not verified for official use";
    if (query.period && period !== query.period) return [];
    if (needle && !item.employee.fullName.toLowerCase().includes(needle) && !item.employee.employeeCode.toLowerCase().includes(needle)) return [];
    if (query.status && !status.toLowerCase().includes(query.status.toLowerCase())) return [];
    let lines: { name: string; kind: string; amount: number }[] = [];
    try { lines = JSON.parse(item.breakdown); } catch { lines = []; }
    return [{
      id: item.id,
      period,
      employeeId: item.employeeId,
      employeeCode: item.employee.employeeCode,
      name: item.employee.fullName,
      ptkp: item.employee.ptkp,
      method,
      gross: item.gross,
      pph21: item.pph21,
      status,
      lines,
    }];
  });
}
