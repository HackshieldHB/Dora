export const PERMISSIONS = [
  "overview.view",
  "employees.view",
  "employees.manage",
  "employees.salary",
  "employees.activate",
  "employees.export",
  "employees.self",
  "organization.view",
  "organization.manage",
  "attendance.view",
  "attendance.self",
  "attendance.correct",
  "attendance.configure",
  "leave.view",
  "leave.self",
  "leave.approve",
  "leave.manage",
  "overtime.view",
  "overtime.self",
  "overtime.approve",
  "overtime.review",
  "overtime.configure",
  "payroll.view",
  "payroll.prepare",
  "payroll.approve",
  "payroll.finalize",
  "payroll.publish",
  "payroll.simulate",
  "payroll.self",
  "tax.view",
  "tax.configure",
  "tax.platform",
  "tax.export",
  "approvals.view",
  "approvals.act",
  "approvals.delegate",
  "approvals.configure",
  "reports.view",
  "reports.export",
  "reports.payroll",
  "settings.users",
  "settings.roles",
  "settings.security",
  "settings.audit",
  "settings.platform",
  "training.view",
  "training.manage",
  "training.self",
  "training.export",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "overview.view": "View home",
  "employees.view": "View employee data",
  "employees.manage": "Manage employee data",
  "employees.salary": "View salary information",
  "employees.activate": "Activate employees",
  "employees.export": "Export employee data",
  "employees.self": "My employee profile",
  "organization.view": "View organization",
  "organization.manage": "Manage organization",
  "attendance.view": "View attendance data",
  "attendance.self": "My attendance",
  "attendance.correct": "Correct attendance",
  "attendance.configure": "Configure attendance",
  "leave.view": "View leave requests",
  "leave.self": "Request leave and permission",
  "leave.approve": "Approve leave and permission",
  "leave.manage": "Manage leave",
  "overtime.view": "View overtime data",
  "overtime.self": "Request overtime",
  "overtime.approve": "Approve overtime",
  "overtime.review": "Review overtime pay",
  "overtime.configure": "Configure overtime",
  "payroll.view": "View payroll data",
  "payroll.prepare": "Process payroll",
  "payroll.approve": "Approve payroll",
  "payroll.finalize": "Finalize payroll",
  "payroll.publish": "Publish payslips",
  "payroll.simulate": "Simulate salary",
  "payroll.self": "My payslip",
  "tax.view": "View tax and BPJS",
  "tax.configure": "Configure tax and BPJS",
  "tax.platform": "Manage platform tax rules",
  "tax.export": "Export tax reports",
  "approvals.view": "View approval list",
  "approvals.act": "Process approvals",
  "approvals.delegate": "Delegate approvals",
  "approvals.configure": "Configure approval workflow",
  "reports.view": "View reports",
  "reports.export": "Export reports",
  "reports.payroll": "View payroll reports",
  "settings.users": "Manage users",
  "settings.roles": "Manage roles and access",
  "settings.security": "Manage security settings",
  "settings.audit": "View audit log",
  "settings.platform": "Manage platform",
  "training.view": "View training data",
  "training.manage": "Manage training",
  "training.self": "My training",
  "training.export": "Export training",
};

export const PERMISSION_GROUPS: { title: string; permissions: Permission[] }[] = [
  { title: "Home and dashboard", permissions: ["overview.view"] },
  { title: "Employees", permissions: ["employees.view", "employees.manage", "employees.salary", "employees.activate", "employees.export", "employees.self"] },
  { title: "Organization", permissions: ["organization.view", "organization.manage"] },
  { title: "Attendance", permissions: ["attendance.view", "attendance.self", "attendance.correct", "attendance.configure"] },
  { title: "Leave and permission", permissions: ["leave.view", "leave.self", "leave.approve", "leave.manage"] },
  { title: "Overtime", permissions: ["overtime.view", "overtime.self", "overtime.approve", "overtime.review", "overtime.configure"] },
  { title: "Payroll", permissions: ["payroll.view", "payroll.prepare", "payroll.approve", "payroll.finalize", "payroll.publish", "payroll.simulate", "payroll.self"] },
  { title: "Tax and BPJS", permissions: ["tax.view", "tax.configure", "tax.platform", "tax.export"] },
  { title: "Approvals", permissions: ["approvals.view", "approvals.act", "approvals.delegate", "approvals.configure"] },
  { title: "Reports", permissions: ["reports.view", "reports.export", "reports.payroll"] },
  { title: "Training", permissions: ["training.view", "training.manage", "training.self", "training.export"] },
  { title: "Settings", permissions: ["settings.users", "settings.roles", "settings.security", "settings.audit", "settings.platform"] },
];

export function permissionLabelList(value: string): string[] {
  let codes: string[] = [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) codes = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    codes = [];
  }
  return codes.map((code) => PERMISSION_LABELS[code as Permission] || code);
}

const ESS: Permission[] = ["overview.view", "employees.self", "attendance.self", "leave.self", "overtime.self", "payroll.self", "training.self"];

export const DEFAULT_ROLE_TEMPLATES: Record<string, { name: string; scope: string; layout: string; permissions: Permission[] }> = {
  employee: { name: "Employee", scope: "SELF", layout: "employee", permissions: ESS },
  manager: {
    name: "Manager",
    scope: "DIRECT_REPORTS",
    layout: "manager",
    permissions: [...ESS, "employees.view", "attendance.view", "leave.view", "leave.approve", "overtime.view", "overtime.approve", "approvals.view", "approvals.act", "approvals.delegate", "reports.view", "reports.export", "training.view"],
  },
  hr: {
    name: "HR",
    scope: "COMPANY",
    layout: "hr",
    permissions: [...ESS, "employees.view", "employees.manage", "employees.salary", "employees.activate", "employees.export", "organization.view", "organization.manage", "attendance.view", "attendance.correct", "attendance.configure", "leave.view", "leave.manage", "overtime.view", "overtime.review", "overtime.configure", "approvals.view", "approvals.act", "reports.view", "reports.export", "training.view", "training.manage", "training.export"],
  },
  payroll: {
    name: "Payroll",
    scope: "COMPANY",
    layout: "payroll",
    permissions: [...ESS, "payroll.view", "payroll.prepare", "payroll.approve", "payroll.finalize", "payroll.publish", "payroll.simulate", "tax.view", "tax.configure", "tax.export", "approvals.view", "approvals.act", "reports.view", "reports.export", "reports.payroll"],
  },
  company_admin: {
    name: "Company Admin",
    scope: "COMPANY",
    layout: "company_admin",
    permissions: ["overview.view", "organization.view", "organization.manage", "settings.users", "settings.roles", "settings.security", "settings.audit", "reports.view", "reports.export", "approvals.configure"],
  },
};

export const PLATFORM_PERMISSIONS: Permission[] = ["overview.view", "tax.platform", "settings.platform", "settings.security", "settings.audit"];

export type NavItem = { label: string; href?: string; permission?: Permission; anyPermission?: Permission[]; children?: NavItem[] };

export const NAV: NavItem[] = [
  { label: "Overview", href: "/overview", permission: "overview.view" },
  {
    label: "Employee Management",
    children: [
      { label: "Employee Directory", href: "/employees", permission: "employees.view" },
      { label: "Employee Onboarding", href: "/employees/onboarding", permission: "employees.manage" },
      { label: "My Profile", href: "/me/profile", permission: "employees.self" },
    ],
  },
  {
    label: "Organization",
    children: [
      { label: "Company Profile", href: "/organization", permission: "organization.view" },
      { label: "Branch & Work Location", href: "/organization/branches", permission: "organization.view" },
      { label: "Organization Management", href: "/organization/manage", permission: "organization.view" },
    ],
  },
  {
    label: "Attendance & Leave",
    children: [
      { label: "Attendance Overview", href: "/attendance", permission: "attendance.view" },
      { label: "Attendance Records", href: "/attendance/records", permission: "attendance.view" },
      { label: "Work Schedule & Shift", href: "/attendance/schedules", permission: "attendance.view" },
      { label: "Attendance Correction", href: "/attendance/corrections", permission: "attendance.correct" },
      { label: "Attendance Policy", href: "/attendance/policy", anyPermission: ["attendance.view", "attendance.configure"] },
      { label: "Holiday Calendar", href: "/attendance/holidays", anyPermission: ["attendance.view", "attendance.self"] },
      { label: "My Attendance", href: "/me/attendance", permission: "attendance.self" },
      { label: "Leave Overview", href: "/leave", permission: "leave.view" },
      { label: "Leave Requests", href: "/leave/requests", permission: "leave.view" },
      { label: "Permission & Sick Leave", href: "/leave/permission", permission: "leave.view" },
      { label: "Leave Balance", href: "/leave/balances", permission: "leave.view" },
      { label: "Leave Policy", href: "/leave/policy", anyPermission: ["leave.view", "leave.self", "leave.manage"] },
      { label: "Leave History", href: "/leave/history", permission: "leave.view" },
      { label: "My Leave & Permission", href: "/me/leave", permission: "leave.self" },
    ],
  },
  {
    label: "Overtime",
    children: [
      { label: "Overtime Overview", href: "/overtime", permission: "overtime.view" },
      { label: "Overtime Requests", href: "/overtime/requests", permission: "overtime.view" },
      { label: "Overtime Records", href: "/overtime/records", permission: "overtime.view" },
      { label: "Overtime Calculation", href: "/overtime/calculation", permission: "overtime.review" },
      { label: "Overtime Policy", href: "/overtime/policy", permission: "overtime.configure" },
      { label: "My Overtime", href: "/me/overtime", permission: "overtime.self" },
    ],
  },
  {
    label: "Payroll",
    children: [
      { label: "Payroll Overview", href: "/payroll", permission: "payroll.view" },
      { label: "Payroll Period", href: "/payroll/periods", permission: "payroll.view" },
      { label: "Salary Components", href: "/payroll/components", permission: "payroll.view" },
      { label: "Payroll Processing", href: "/payroll/processing", permission: "payroll.prepare" },
      { label: "Salary simulation", href: "/payroll/simulate", permission: "payroll.simulate" },
      { label: "Pay Comparison", href: "/payroll/compare", permission: "payroll.view" },
      { label: "Payroll Adjustment", href: "/payroll/adjustments", permission: "payroll.prepare" },
      { label: "Payroll Approval", href: "/payroll/approval", permission: "payroll.approve" },
      { label: "Payslip Management", href: "/payroll/payslips", permission: "payroll.publish" },
      { label: "THR & Bonus", href: "/payroll/thr", permission: "payroll.prepare" },
      { label: "Employee Loans", href: "/payroll/loans", permission: "payroll.prepare" },
      { label: "My Payslip", href: "/me/payslip", permission: "payroll.self" },
      { label: "Benefits & Loans", href: "/me/benefits", permission: "payroll.self" },
    ],
  },
  {
    label: "Tax & BPJS",
    children: [
      { label: "Tax & Statutory Overview", href: "/tax", permission: "tax.view" },
      { label: "PPh 21 Management", href: "/tax/pph21", permission: "tax.view" },
      { label: "BPJS Kesehatan", href: "/tax/bpjs-health", permission: "tax.view" },
      { label: "BPJS Ketenagakerjaan", href: "/tax/bpjs-tk", permission: "tax.view" },
      { label: "Tax & Statutory Configuration", href: "/tax/config", permission: "tax.configure" },
      { label: "Tax & Statutory Reports", href: "/tax/reports", permission: "tax.view" },
      { label: "Platform Statutory Rules", href: "/platform/rules", permission: "tax.platform" },
    ],
  },
  {
    label: "Performance",
    children: [
      { label: "Goals & KPI", href: "/goals", permission: "employees.view" },
      { label: "My Goals", href: "/me/goals", permission: "employees.self" },
    ],
  },
  {
    label: "Training & Development",
    children: [
      { label: "Training Overview", href: "/training", permission: "training.view" },
      { label: "Training Catalog", href: "/training/catalog", anyPermission: ["training.view", "training.self"] },
      { label: "Training Schedule", href: "/training/schedule", anyPermission: ["training.view", "training.self"] },
      { label: "Participants & Attendance", href: "/training/attendance", permission: "training.manage" },
      { label: "Training History", href: "/training/history", anyPermission: ["training.view", "training.self"] },
      { label: "Training Evaluation", href: "/training/evaluation", permission: "training.manage" },
      { label: "My Training", href: "/me/training", permission: "training.self" },
    ],
  },
  {
    label: "Approvals",
    children: [
      { label: "Approval Overview", href: "/approvals", permission: "approvals.view" },
      { label: "Pending Approvals", href: "/approvals/pending", permission: "approvals.act" },
      { label: "Approval History", href: "/approvals/history", permission: "approvals.view" },
      { label: "Workflow Configuration", href: "/approvals/workflow", permission: "approvals.view" },
      { label: "Approval Delegation", href: "/approvals/delegation", permission: "approvals.delegate" },
    ],
  },
  {
    label: "Reports",
    children: [
      { label: "Reports Overview", href: "/reports", permission: "reports.view" },
      { label: "Employee Reports", href: "/reports/employee", permission: "reports.view" },
      { label: "Attendance Reports", href: "/reports/attendance", permission: "reports.view" },
      { label: "Leave & Permission Reports", href: "/reports/leave", permission: "reports.view" },
      { label: "Overtime Reports", href: "/reports/overtime", permission: "reports.view" },
      { label: "Payroll Reports", href: "/reports/payroll", permission: "reports.payroll" },
      { label: "Tax & Statutory Reports", href: "/reports/tax", permission: "tax.view" },
      { label: "Approval & Workflow Reports", href: "/reports/approval", permission: "reports.view" },
    ],
  },
  {
    label: "Settings",
    children: [
      { label: "User Management", href: "/settings/users", permission: "settings.users" },
      { label: "Role Management", href: "/settings/roles", permission: "settings.roles" },
      { label: "Permission Management", href: "/settings/permissions", permission: "settings.roles" },
      { label: "User Access Matrix", href: "/settings/matrix", permission: "settings.roles" },
      { label: "Security Settings", href: "/settings/security", permission: "settings.security" },
      { label: "Audit Log", href: "/settings/audit", permission: "settings.audit" },
      { label: "Platform Administration", href: "/platform/tenants", permission: "settings.platform" },
    ],
  },
];

export function visibleNav(permissions: Set<string>, hasEmployee: boolean): NavItem[] {
  const allow = (item: NavItem) => {
    if (item.href?.startsWith("/me/") && !hasEmployee) return false;
    if (item.anyPermission) return item.anyPermission.some((permission) => permissions.has(permission));
    if (!item.permission) return true;
    return permissions.has(item.permission);
  };
  return NAV.map((item) => {
    if (!item.children) return allow(item) ? item : null;
    const children = item.children.filter(allow);
    return children.length ? { ...item, children } : null;
  }).filter((item): item is NavItem => item !== null);
}
