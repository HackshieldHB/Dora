import { prisma } from "../src/lib/db";
import { addDays, calculatePay, SAMPLE_RULE, weekday } from "../src/lib/domain";
import { monthBounds, todayJakarta } from "../src/lib/format";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_ROLE_TEMPLATES, PLATFORM_PERMISSIONS } from "../src/lib/permissions";
import { ensureLeaveCatalog } from "../src/server/leave-catalog";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment.
}

// Demo data only. This wipes every table and creates accounts that all share one known password,
// so it must never run on a client's server. Use `npm run setup:production` there instead.
if (process.env.NODE_ENV === "production" && process.env.DORA_ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to run the demo seed with NODE_ENV=production. Use `npm run setup:production` for a real installation.");
  process.exit(1);
}

const password = "Dora#2026";

async function empty() {
  await prisma.payslipGrant.deleteMany();
  await prisma.approvalDecision.deleteMany();
  await prisma.approvalTask.deleteMany();
  await prisma.delegation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.payrollAdjustment.deleteMany();
  await prisma.payrollItem.deleteMany();
  await prisma.payrollPeriod.deleteMany();
  await prisma.extraPay.deleteMany();
  await prisma.payrollComponent.deleteMany();
  await prisma.overtimeRequest.deleteMany();
  await prisma.loanInstallment.deleteMany();
  await prisma.employeeLoan.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.attendanceRequest.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.attendanceCorrection.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.employeeSchedule.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.attendancePolicy.deleteMany();
  await prisma.overtimePolicy.deleteMany();
  await prisma.profileChange.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.storedFile.deleteMany();
  await prisma.employmentEvent.deleteMany();
  await prisma.orgChange.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.updateMany({ data: { managerId: null } });
  await prisma.employee.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.updateMany({ data: { parentId: null } });
  await prisma.department.deleteMany();
  await prisma.workLocation.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.role.deleteMany();
  await prisma.companyStatutorySetting.deleteMany();
  await prisma.statutoryRule.deleteMany();
  await prisma.company.deleteMany();
  await prisma.platformSetting.deleteMany();
}

function nextWeekday(from: string, step: number) {
  let cursor = addDays(from, step);
  while (weekday(cursor) === 0 || weekday(cursor) === 6) cursor = addDays(cursor, step > 0 ? 1 : -1);
  return cursor;
}

async function main() {
  await empty();
  const today = todayJakarta();
  const month = today.slice(0, 7);
  const bounds = monthBounds(month);
  const previous = monthBounds(addDays(`${month}-01`, -1).slice(0, 7));
  await prisma.platformSetting.create({ data: { id: 1 } });
  const rule = await prisma.statutoryRule.create({
    data: {
      code: "SAMPLE-STATUTORY-1",
      name: "Sample platform statutory rule",
      effectiveFrom: "2024-01-01",
      active: true,
      status: "VALIDATED",
      approvalStatus: "SAMPLE",
      source: "Seeded sample. Not an official government feed.",
      definition: JSON.stringify(SAMPLE_RULE),
      note: "Illustrative platform rule for PPh 21 and BPJS. It is not a locked official regulation. Replace it from Platform Statutory Rules before treating the figures as statutory filing numbers.",
    },
  });
  const demo = await prisma.company.create({
    data: { name: "DORA Demo", legalName: "PT DORA Demo", npwp: "01.234.567.8-901.000", address: "Jl. Sudirman No. 1, Jakarta", phone: "021-555-0101", email: "admin@dora.local" },
  });
  const cendana = await prisma.company.create({ data: { name: "Cendana", legalName: "PT Cendana", email: "cendana.admin@dora.local" } });
  async function rolesFor(companyId: string) {
    const map = new Map<string, string>();
    for (const [key, template] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
      const role = await prisma.role.create({
        data: { companyId, key, name: template.name, isDefault: true, dataScope: template.scope, layout: template.layout, permissions: JSON.stringify(template.permissions) },
      });
      map.set(key, role.id);
    }
    return map;
  }
  const demoRoles = await rolesFor(demo.id);
  const cendanaRoles = await rolesFor(cendana.id);
  const engineering = await prisma.department.create({ data: { companyId: demo.id, name: "Engineering" } });
  const field = await prisma.department.create({ data: { companyId: demo.id, name: "Field Operations", parentId: engineering.id } });
  const hrDept = await prisma.department.create({ data: { companyId: demo.id, name: "HR" } });
  const finance = await prisma.department.create({ data: { companyId: demo.id, name: "Finance" } });
  const recruiterRole = await prisma.role.create({
    data: {
      companyId: demo.id,
      key: "recruiter",
      name: "Recruiter",
      isCustom: true,
      dataScope: "DEPARTMENT",
      scopeRefId: engineering.id,
      layout: "standard",
      permissions: JSON.stringify(["overview.view", "employees.view", "employees.manage"]),
    },
  });
  const hq = await prisma.branch.create({ data: { companyId: demo.id, name: "Jakarta HQ", code: "JKT", address: "Sudirman" } });
  const bandung = await prisma.branch.create({ data: { companyId: demo.id, name: "Bandung", code: "BDO", address: "Dago" } });
  const office = await prisma.workLocation.create({ data: { companyId: demo.id, name: "Office Sudirman", address: "Sudirman Tower" } });
  const site = await prisma.workLocation.create({ data: { companyId: demo.id, name: "Site Bandung", address: "Warehouse Dago" } });
  const staff = await prisma.position.create({ data: { companyId: demo.id, name: "Staff" } });
  const supervisor = await prisma.position.create({ data: { companyId: demo.id, name: "Supervisor" } });
  const hrOfficer = await prisma.position.create({ data: { companyId: demo.id, name: "HR Officer" } });
  const payrollOfficer = await prisma.position.create({ data: { companyId: demo.id, name: "Payroll Officer" } });
  const day = await prisma.shift.create({ data: { companyId: demo.id, name: "Day", startTime: "08:00", endTime: "17:00" } });
  const night = await prisma.shift.create({ data: { companyId: demo.id, name: "Night", startTime: "22:00", endTime: "06:00", crossesMidnight: true } });
  const person = async (input: { code: string; name: string; email: string; departmentId: string; positionId: string; branchId: string; locationId: string; managerId?: string; salary: number; joinDate: string }) => prisma.employee.create({
    data: {
      companyId: demo.id,
      employeeCode: input.code,
      fullName: input.name,
      email: input.email,
      status: "ACTIVE",
      departmentId: input.departmentId,
      positionId: input.positionId,
      branchId: input.branchId,
      locationId: input.locationId,
      managerId: input.managerId,
      basicSalary: input.salary,
      joinDate: input.joinDate,
      employmentType: "PERMANENT",
      ptkp: "TK/0",
      bankName: "BCA",
      bankAccount: `123${input.code.replace(/\D/g, "")}`,
    },
  });
  const sari = await person({ code: "EMP-001", name: "Sari Manager", email: "manager@dora.local", departmentId: field.id, positionId: supervisor.id, branchId: hq.id, locationId: office.id, salary: 15_000_000, joinDate: "2024-01-08" });
  const rina = await person({ code: "EMP-002", name: "Rina HR", email: "hr@dora.local", departmentId: hrDept.id, positionId: hrOfficer.id, branchId: hq.id, locationId: office.id, managerId: sari.id, salary: 12_000_000, joinDate: "2024-02-01" });
  const andi = await person({ code: "EMP-003", name: "Andi Payroll", email: "payroll.andi@dora.local", departmentId: finance.id, positionId: payrollOfficer.id, branchId: hq.id, locationId: office.id, managerId: sari.id, salary: 12_000_000, joinDate: "2024-03-01" });
  const dewi = await person({ code: "EMP-004", name: "Dewi Payroll", email: "payroll.dewi@dora.local", departmentId: finance.id, positionId: payrollOfficer.id, branchId: hq.id, locationId: office.id, managerId: sari.id, salary: 12_000_000, joinDate: "2024-03-01" });
  const budi = await person({ code: "EMP-005", name: "Budi Santoso", email: "budi@dora.local", departmentId: field.id, positionId: staff.id, branchId: hq.id, locationId: office.id, managerId: sari.id, salary: 10_000_000, joinDate: "2025-06-02" });
  const joko = await person({ code: "EMP-006", name: "Joko Malam", email: "joko@dora.local", departmentId: field.id, positionId: staff.id, branchId: bandung.id, locationId: site.id, managerId: sari.id, salary: 8_000_000, joinDate: "2025-08-01" });
  const hash = await hashPassword(password);
  const platformRole = await prisma.role.create({ data: { key: "platform_admin", name: "Platform Admin", isDefault: true, dataScope: "PLATFORM", layout: "platform", permissions: JSON.stringify(PLATFORM_PERMISSIONS) } });
  const link = async (email: string, roleId: string, employeeId?: string) => prisma.user.create({ data: { companyId: email.endsWith("@dora.local") && email !== "platform@dora.local" && email !== "cendana.admin@dora.local" ? demo.id : email.startsWith("cendana") ? cendana.id : null, email, passwordHash: hash, roleId, employeeId } });
  await link("platform@dora.local", platformRole.id);
  await prisma.user.create({ data: { companyId: demo.id, email: "admin@dora.local", passwordHash: hash, roleId: demoRoles.get("company_admin")! } });
  await prisma.user.create({ data: { companyId: demo.id, email: "hr@dora.local", passwordHash: hash, roleId: demoRoles.get("hr")!, employeeId: rina.id } });
  await prisma.user.create({ data: { companyId: demo.id, email: "payroll.andi@dora.local", passwordHash: hash, roleId: demoRoles.get("payroll")!, employeeId: andi.id } });
  await prisma.user.create({ data: { companyId: demo.id, email: "payroll.dewi@dora.local", passwordHash: hash, roleId: demoRoles.get("payroll")!, employeeId: dewi.id } });
  await prisma.user.create({ data: { companyId: demo.id, email: "manager@dora.local", passwordHash: hash, roleId: demoRoles.get("manager")!, employeeId: sari.id } });
  await prisma.user.create({ data: { companyId: demo.id, email: "budi@dora.local", passwordHash: hash, roleId: demoRoles.get("employee")!, employeeId: budi.id } });
  await prisma.user.create({ data: { companyId: demo.id, email: "recruiter@dora.local", passwordHash: hash, roleId: recruiterRole.id } });
  await prisma.user.create({ data: { companyId: cendana.id, email: "cendana.admin@dora.local", passwordHash: hash, roleId: cendanaRoles.get("company_admin")! } });
  const cendanaBranch = await prisma.branch.create({ data: { companyId: cendana.id, name: "Cendana HQ", code: "CDN" } });
  const cendanaDept = await prisma.department.create({ data: { companyId: cendana.id, name: "General" } });
  const cendanaPos = await prisma.position.create({ data: { companyId: cendana.id, name: "Staff" } });
  const cendanaLoc = await prisma.workLocation.create({ data: { companyId: cendana.id, name: "Cendana Office" } });
  await prisma.employee.create({ data: { companyId: cendana.id, employeeCode: "CDN-001", fullName: "Cendana Staff", email: "staff@cendana.local", status: "ACTIVE", departmentId: cendanaDept.id, positionId: cendanaPos.id, branchId: cendanaBranch.id, locationId: cendanaLoc.id, joinDate: "2025-01-06", basicSalary: 7_000_000 } });
  for (const employeeId of [sari.id, rina.id, andi.id, dewi.id, budi.id]) {
    for (const dayOfWeek of [1, 2, 3, 4, 5]) await prisma.employeeSchedule.create({ data: { employeeId, dayOfWeek, shiftId: day.id } });
  }
  for (const dayOfWeek of [1, 2, 3, 4, 5]) await prisma.employeeSchedule.create({ data: { employeeId: joko.id, dayOfWeek, shiftId: night.id } });
  await prisma.holiday.create({ data: { companyId: demo.id, date: "2026-08-17", name: "Independence Day" } });
  await prisma.holiday.create({ data: { companyId: demo.id, date: "2026-12-24", name: "Company year-end close" } });
  await prisma.attendancePolicy.create({ data: { companyId: demo.id, graceMinutes: 0, lateDeductionPerMinute: 0 } });
  await prisma.overtimePolicy.create({ data: { companyId: demo.id, allowAfter: true, multiplier: 1.5, hourlyDivisor: 173 } });
  await prisma.attendancePolicy.create({ data: { companyId: cendana.id } });
  await prisma.overtimePolicy.create({ data: { companyId: cendana.id } });
  const annual = await prisma.leaveType.create({ data: { companyId: demo.id, name: "Annual leave", balanceMode: "UPFRONT", quotaDays: 12, paid: true, allowHalfDay: true, carryForwardDays: 5 } });
  await prisma.leaveType.create({ data: { companyId: demo.id, name: "Sick leave", balanceMode: "NONE", requiresAttachment: true, paid: true } });
  await prisma.leaveType.create({ data: { companyId: demo.id, name: "Permission", balanceMode: "NONE", requiresAttachment: false, paid: false } });
  await ensureLeaveCatalog(prisma, demo.id);
  await prisma.leaveBalance.create({ data: { employeeId: budi.id, leaveTypeId: annual.id, year: Number(today.slice(0, 4)), entitled: 12, used: 1 } });
  const future = nextWeekday(today, 7);
  const pending = nextWeekday(future, 7);
  const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: "manager@dora.local" } });
  const budiUser = await prisma.user.findUniqueOrThrow({ where: { email: "budi@dora.local" } });
  await prisma.leaveRequest.create({ data: { companyId: demo.id, employeeId: budi.id, leaveTypeId: annual.id, startDate: future, endDate: future, days: 1, reason: "Family visit", status: "APPROVED", approverId: managerUser.id } });
  await prisma.attendanceRecord.create({ data: { companyId: demo.id, employeeId: budi.id, workDate: future, status: "APPROVED_LEAVE", source: "LEAVE" } });
  const pendingLeave = await prisma.leaveRequest.create({ data: { companyId: demo.id, employeeId: budi.id, leaveTypeId: annual.id, startDate: pending, endDate: pending, days: 1, reason: "Personal errand", status: "PENDING", approverId: managerUser.id } });
  await prisma.approvalTask.create({ data: { companyId: demo.id, module: "LEAVE", subjectId: pendingLeave.id, assigneeId: managerUser.id, originalAssigneeId: managerUser.id, requesterId: budiUser.id, title: `Leave: Budi Santoso ${pending}`, href: "/approvals/pending" } });
  let cursor = nextWeekday(today, -1);
  for (let index = 0; index < 6; index += 1) {
    const late = index === 0;
    await prisma.attendanceRecord.create({
      data: {
        companyId: demo.id,
        employeeId: budi.id,
        workDate: cursor,
        shiftName: "Day",
        shiftStart: "08:00",
        shiftEnd: "17:00",
        clockInAt: late ? "08:20" : "07:55",
        clockOutAt: "17:05",
        status: late ? "LATE" : "PRESENT",
        lateMinutes: late ? 20 : 0,
        source: "CLOCK",
      },
    });
    cursor = nextWeekday(cursor, -1);
  }
  const nightDate = nextWeekday(today, -2);
  await prisma.attendanceRecord.create({
    data: {
      companyId: demo.id,
      employeeId: joko.id,
      workDate: nightDate,
      shiftName: "Night",
      shiftStart: "22:00",
      shiftEnd: "06:00",
      clockInAt: "22:10",
      clockOutAt: "06:05",
      status: "LATE",
      lateMinutes: 10,
      source: "CLOCK",
    },
  });
  const overtime = await prisma.overtimeRequest.create({
    data: { companyId: demo.id, employeeId: budi.id, workDate: nextWeekday(today, -1), startTime: "18:00", endTime: "20:00", reason: "Release support", status: "PENDING", approverId: managerUser.id },
  });
  await prisma.approvalTask.create({ data: { companyId: demo.id, module: "OVERTIME", subjectId: overtime.id, assigneeId: managerUser.id, originalAssigneeId: managerUser.id, requesterId: budiUser.id, title: "Overtime: Budi Santoso", href: "/approvals/pending" } });
  await prisma.payrollComponent.create({ data: { companyId: demo.id, name: "Transport allowance", kind: "EARNING", calc: "FIXED", amount: 500_000 } });
  await prisma.companyStatutorySetting.create({ data: { companyId: demo.id, ruleId: rule.id, jkkClass: 1 } });
  await prisma.companyStatutorySetting.create({ data: { companyId: cendana.id, ruleId: rule.id, jkkClass: 2 } });
  const published = await prisma.payrollPeriod.create({
    data: {
      companyId: demo.id,
      name: `Payroll ${previous.start.slice(0, 7)}`,
      kind: "REGULAR",
      startDate: previous.start,
      endDate: previous.end,
      cutoffDate: previous.end,
      payDate: previous.end,
      status: "LOCKED",
      payslipPublished: true,
      preparedById: (await prisma.user.findUniqueOrThrow({ where: { email: "payroll.andi@dora.local" } })).id,
      approvedById: (await prisma.user.findUniqueOrThrow({ where: { email: "payroll.dewi@dora.local" } })).id,
    },
  });
  const pay = calculatePay({
    kind: "REGULAR",
    basicSalary: 10_000_000,
    factor: 1,
    components: [{ name: "Transport allowance", kind: "EARNING", calc: "FIXED", amount: 500_000 }],
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
  });
  await prisma.payrollItem.create({
    data: { periodId: published.id, employeeId: budi.id, breakdown: JSON.stringify(pay.lines), gross: pay.gross, deduction: pay.deduction, net: pay.net, pph21: pay.pph21, bpjsEmployee: pay.bpjsEmployee, bpjsEmployer: pay.bpjsEmployer },
  });
  await prisma.payrollPeriod.create({
    data: { companyId: demo.id, name: `Payroll ${month}`, kind: "REGULAR", startDate: bounds.start, endDate: bounds.end, cutoffDate: bounds.end, payDate: bounds.end, status: "DRAFT" },
  });
  console.log(`Seeded DORA. Password for every demo account: ${password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
