const MODULE_PERMISSIONS: [string, string[]][] = [
  ["LEAVE", ["leave.view", "leave.approve", "leave.manage"]],
  ["LEAVE_CANCEL", ["leave.view", "leave.approve", "leave.manage"]],
  ["OVERTIME", ["overtime.view", "overtime.approve", "overtime.review"]],
  ["PAYROLL", ["payroll.view", "payroll.approve", "payroll.prepare"]],
  ["PROFILE", ["employees.view", "employees.manage"]],
  ["ATTENDANCE", ["attendance.view", "attendance.correct", "approvals.act"]],
  ["SHIFT", ["attendance.view", "approvals.act"]],
  ["TIMESHEET", ["attendance.view", "approvals.act"]],
  ["LOAN", ["payroll.view", "payroll.prepare", "approvals.act"]],
  ["REIMBURSEMENT", ["payroll.view", "payroll.prepare", "approvals.act"]],
];

export function approvalModules(permissions: { has: (permission: string) => boolean }) {
  return MODULE_PERMISSIONS.filter(([, perms]) => perms.some((permission) => permissions.has(permission))).map(([module]) => module);
}

export function inApprovalScope(input: {
  dataScope: string;
  userId: string;
  actorId: string;
  assigneeId: string;
  originalAssigneeId: string;
  requesterId: string;
  module: string;
  employeeId: string;
  scopeIds: Set<string> | null;
}) {
  if (input.dataScope === "COMPANY") return true;
  if (input.actorId === input.userId || input.assigneeId === input.userId || input.originalAssigneeId === input.userId || input.requesterId === input.userId) return true;
  if (input.module === "PAYROLL" || !input.employeeId || !input.scopeIds) return false;
  return input.scopeIds.has(input.employeeId);
}
