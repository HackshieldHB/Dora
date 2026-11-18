export const WORKFLOW_MODULES = [
  { key: "LEAVE", label: "Leave and permission" },
  { key: "OVERTIME", label: "Overtime" },
  { key: "OFFSITE", label: "Offsite attendance" },
  { key: "TRAVEL", label: "Business travel" },
  { key: "PAYROLL", label: "Payroll" },
] as const;

export type WorkflowModule = (typeof WORKFLOW_MODULES)[number]["key"];

export type ApprovalLevel = { kind: "DIRECT" | "ROLE" | "USER"; roleId: string; userId: string };

export function parseLevels(raw: string): ApprovalLevel[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const levels: ApprovalLevel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: string }).kind;
    if (kind !== "DIRECT" && kind !== "ROLE" && kind !== "USER") continue;
    levels.push({
      kind,
      roleId: String((item as { roleId?: string }).roleId || ""),
      userId: String((item as { userId?: string }).userId || ""),
    });
  }
  return levels;
}

export function validateLevels(levels: ApprovalLevel[], roles: { id: string; active: boolean }[], users: { id: string; status: string }[]): string | null {
  if (levels.length < 1) return "Add at least one approval level.";
  for (const level of levels) {
    if (level.kind === "ROLE") {
      const role = roles.find((row) => row.id === level.roleId);
      if (!role?.active) return "Each role approver must be an active role.";
    }
    if (level.kind === "USER" && !users.some((row) => row.id === level.userId && row.status === "ACTIVE")) {
      return "Each specific approver must be an active user.";
    }
  }
  return null;
}

export function isLastApprovalLevel(currentLevel: number, total: number) {
  return currentLevel >= total;
}

export function workflowModuleLabel(key: string) {
  return WORKFLOW_MODULES.find((item) => item.key === key)?.label || key;
}
