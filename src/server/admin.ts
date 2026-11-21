import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasPerm, type Ctx } from "@/lib/context";
import { addDays, coordinateError, normalizeNpwp, passwordError, rangesOverlap, ruleError, type PasswordPolicy } from "@/lib/domain";
import { parsePermissions, todayJakarta } from "@/lib/format";
import { hashPassword, temporaryPassword } from "@/lib/password";
import { requireCompany } from "./scope";

async function tempUntil(companyId: string | null) {
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
  const hours = company?.tempPasswordHours ?? platform?.tempPasswordHours ?? 24;
  const span = hours > 0 ? hours : 24;
  return new Date(Date.now() + span * 60 * 60 * 1000);
}

export async function policyFor(ctx: Ctx): Promise<PasswordPolicy> {
  if (!ctx.companyId) {
    const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
    return {
      minLength: platform?.passwordMinLength ?? 8,
      requireUpper: platform?.requireUpper ?? true,
      requireLower: platform?.requireLower ?? true,
      requireDigit: platform?.requireDigit ?? true,
    };
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
  return { minLength: company.passwordMinLength, requireUpper: company.requireUpper, requireLower: company.requireLower, requireDigit: company.requireDigit };
}

export async function saveCompanyProfile(ctx: Ctx, input: Record<string, string>) {
  if (!hasPerm(ctx, "organization.manage")) throw new Error("You do not have permission to edit the company profile.");
  const companyId = requireCompany(ctx);
  await prisma.company.update({
    where: { id: companyId },
    data: { name: input.name, legalName: input.legalName, npwp: companyNpwp(input.npwp || ""), address: input.address, phone: input.phone, email: input.email, prorateSalary: input.prorateSalary === "true" },
  });
  await audit(ctx, "company.profile", "Company", companyId, input.name);
}

export async function saveBranch(ctx: Ctx, input: { id?: string; name: string; code: string; address: string }) {
  if (!hasPerm(ctx, "organization.manage")) throw new Error("You do not have permission to edit branches.");
  const companyId = requireCompany(ctx);
  if (!input.name || !input.code) throw new Error("Branch name and code are required.");
  if (input.id) await prisma.branch.update({ where: { id: input.id }, data: { name: input.name, code: input.code, address: input.address } });
  else await prisma.branch.create({ data: { companyId, name: input.name, code: input.code, address: input.address } });
  await audit(ctx, "branch.save", "Branch", input.id || input.code, input.name);
}

function companyNpwp(value: string) {
  const parsed = normalizeNpwp(value);
  if (parsed.error) throw new Error(parsed.error);
  return parsed.value;
}

export async function saveLocation(ctx: Ctx, input: { id?: string; branchId: string; name: string; address: string; lat: string; lng: string; radiusMeters: number }) {
  if (!hasPerm(ctx, "organization.manage")) throw new Error("You do not have permission to edit work locations.");
  const companyId = requireCompany(ctx);
  if (!input.name) throw new Error("Location name is required.");
  if (!input.branchId) throw new Error("Choose the branch for this work location.");
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, companyId } });
  if (!branch) throw new Error("Branch not found.");
  const lat = input.lat.trim() ? Number(input.lat) : null;
  const lng = input.lng.trim() ? Number(input.lng) : null;
  const coordinates = coordinateError(input.lat, input.lng);
  if (coordinates) throw new Error(coordinates);
  if (input.radiusMeters < 0) throw new Error("The office radius cannot be negative.");
  if (input.radiusMeters > 0 && (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng))) {
    throw new Error("A radius needs the office latitude and longitude.");
  }
  const data = { branchId: branch.id, name: input.name, address: input.address, lat, lng, radiusMeters: input.radiusMeters };
  if (input.id) {
    const current = await prisma.workLocation.findFirst({ where: { id: input.id, companyId } });
    if (!current) throw new Error("Work location not found.");
    await prisma.workLocation.update({ where: { id: current.id }, data });
  } else await prisma.workLocation.create({ data: { companyId, ...data } });
  await audit(ctx, "location.save", "WorkLocation", input.id || input.name, `${branch.name} ${input.name}`);
}

export async function saveDepartment(ctx: Ctx, input: { id?: string; name: string; parentId: string; effectiveDate: string; maxOnLeave: number }) {
  if (!hasPerm(ctx, "organization.manage")) throw new Error("You do not have permission to edit departments.");
  const companyId = requireCompany(ctx);
  if (!input.name) throw new Error("Department name is required.");
  if (input.maxOnLeave < 0) throw new Error("The leave limit cannot be negative.");
  if (input.parentId && input.parentId === input.id) throw new Error("A department cannot be its own parent.");
  if (!input.id) {
    await prisma.department.create({ data: { companyId, name: input.name, parentId: input.parentId || null, maxOnLeave: input.maxOnLeave } });
    await audit(ctx, "department.save", "Department", input.name, input.name);
    return;
  }
  const current = await prisma.department.findFirst({ where: { id: input.id, companyId } });
  if (!current) throw new Error("Department not found.");
  const parentId = input.parentId || null;
  if ((current.parentId || null) !== parentId && input.effectiveDate > todayJakarta()) {
    await prisma.orgChange.create({
      data: {
        companyId,
        entityType: "DEPARTMENT",
        entityId: current.id,
        effectiveDate: input.effectiveDate,
        beforeJson: JSON.stringify({ parentId: current.parentId }),
        afterJson: JSON.stringify({ parentId }),
        actorId: ctx.userId,
      },
    });
    await prisma.department.update({ where: { id: current.id }, data: { name: input.name, maxOnLeave: input.maxOnLeave } });
    await audit(ctx, "department.schedule", "Department", current.id, input.effectiveDate);
    return;
  }
  await prisma.department.update({ where: { id: current.id }, data: { name: input.name, parentId, maxOnLeave: input.maxOnLeave } });
  await audit(ctx, "department.save", "Department", current.id, input.name);
}

export async function savePosition(ctx: Ctx, name: string) {
  if (!hasPerm(ctx, "organization.manage")) throw new Error("You do not have permission to edit positions.");
  const companyId = requireCompany(ctx);
  if (!name) throw new Error("Position name is required.");
  await prisma.position.create({ data: { companyId, name } });
  await audit(ctx, "position.save", "Position", name, name);
}

export async function saveShift(ctx: Ctx, input: { id?: string; name: string; startTime: string; endTime: string; description: string }) {
  if (!hasPerm(ctx, "attendance.configure")) throw new Error("You do not have permission to edit shifts.");
  const companyId = requireCompany(ctx);
  if (!input.name || !input.startTime || !input.endTime) throw new Error("Shift name, start time, and end time are required.");
  if (input.startTime === input.endTime) throw new Error("Start time and end time are the same. Choose a different end time so the duration is clear.");
  const crossesMidnight = input.endTime < input.startTime;
  const data = { name: input.name, startTime: input.startTime, endTime: input.endTime, crossesMidnight, description: input.description };
  if (input.id) {
    const current = await prisma.shift.findFirst({ where: { id: input.id, companyId } });
    if (!current) throw new Error("Shift not found.");
    await prisma.shift.update({ where: { id: current.id }, data });
    const used = await prisma.employeeSchedule.count({ where: { shiftId: current.id } });
    await audit(ctx, "shift.save", "Shift", current.id, input.name);
    return used ? "Shift saved. Past attendance keeps the hours already recorded." : "Shift saved.";
  }
  const created = await prisma.shift.create({ data: { companyId, ...data } });
  await audit(ctx, "shift.save", "Shift", created.id, input.name);
  return "Shift added.";
}

export async function deleteShift(ctx: Ctx, id: string) {
  if (!hasPerm(ctx, "attendance.configure")) throw new Error("You do not have permission to edit shifts.");
  const companyId = requireCompany(ctx);
  const shift = await prisma.shift.findFirst({ where: { id, companyId } });
  if (!shift) throw new Error("Shift not found.");
  const today = todayJakarta();
  const active = await prisma.employeeSchedule.count({
    where: { shiftId: shift.id, OR: [{ effectiveEnd: "" }, { effectiveEnd: { gte: today } }] },
  });
  if (active > 0) throw new Error("This shift is used by an active schedule. End those assignments before deleting it.");
  await prisma.shift.delete({ where: { id: shift.id } });
  await audit(ctx, "shift.delete", "Shift", shift.id, shift.name);
  return "Shift removed. Past attendance keeps the hours already recorded.";
}

export async function saveAssignment(ctx: Ctx, input: { employeeId: string; shiftId: string; days: number[]; effectiveStart: string; effectiveEnd: string; previousStart: string; previousEnd: string; previousShiftId: string }) {
  if (!hasPerm(ctx, "attendance.configure")) throw new Error("You do not have permission to assign schedules.");
  const companyId = requireCompany(ctx);
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
  if (!employee) throw new Error("Employee not found.");
  const shift = await prisma.shift.findFirst({ where: { id: input.shiftId, companyId } });
  if (!shift) throw new Error("Choose a shift from Shift Management.");
  const days = [...new Set(input.days.filter((day) => day >= 0 && day <= 6))];
  if (days.length === 0) throw new Error("Choose at least one workday. Other days are day off.");
  if (!input.effectiveStart) throw new Error("Effective start date is required.");
  if (input.effectiveEnd && input.effectiveEnd < input.effectiveStart) throw new Error("Effective end date is before the start date.");
  const today = todayJakarta();
  const previous = input.previousShiftId
    ? await prisma.employeeSchedule.findMany({
      where: { employeeId: input.employeeId, shiftId: input.previousShiftId, effectiveStart: input.previousStart, effectiveEnd: input.previousEnd },
    })
    : [];
  const previousIds = new Set(previous.map((row) => row.id));
  const dayKey = [...days].sort((left, right) => left - right).join(",");
  const previousKey = previous.map((row) => row.dayOfWeek).sort((left, right) => left - right).join(",");
  const keepHistory = previous.length > 0 && previous[0].effectiveStart < today && (input.effectiveStart !== previous[0].effectiveStart || input.shiftId !== previous[0].shiftId || dayKey !== previousKey);
  const existing = await prisma.employeeSchedule.findMany({ where: { employeeId: input.employeeId, id: { notIn: [...previousIds] } } });
  const nextStart = keepHistory ? (input.effectiveStart > today ? input.effectiveStart : today) : input.effectiveStart;
  const nextEnd = input.effectiveEnd;
  if (existing.some((row) => row.shiftId && days.includes(row.dayOfWeek) && rangesOverlap(nextStart, nextEnd || "9999-12-31", row.effectiveStart || "0000-01-01", row.effectiveEnd || "9999-12-31"))) {
    throw new Error("This assignment overlaps an existing schedule on the same dates.");
  }
  if (keepHistory) {
    const closedEnd = addDays(nextStart, -1);
    if (closedEnd < previous[0].effectiveStart) await prisma.employeeSchedule.deleteMany({ where: { id: { in: [...previousIds] } } });
    else await prisma.employeeSchedule.updateMany({ where: { id: { in: [...previousIds] } }, data: { effectiveEnd: closedEnd } });
  } else if (previousIds.size) {
    await prisma.employeeSchedule.deleteMany({ where: { id: { in: [...previousIds] } } });
  }
  await prisma.employeeSchedule.createMany({
    data: days.map((dayOfWeek) => ({ employeeId: input.employeeId, dayOfWeek, shiftId: input.shiftId, effectiveStart: nextStart, effectiveEnd: nextEnd })),
  });
  await audit(ctx, "schedule.save", "Employee", input.employeeId, days.join(","));
  return keepHistory ? "Schedule saved. The previous assignment was closed, and past attendance stays unchanged." : "Schedule saved.";
}

export async function deleteAssignment(ctx: Ctx, input: { employeeId: string; shiftId: string; effectiveStart: string; effectiveEnd: string }) {
  if (!hasPerm(ctx, "attendance.configure")) throw new Error("You do not have permission to assign schedules.");
  const companyId = requireCompany(ctx);
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
  if (!employee) throw new Error("Employee not found.");
  const rows = await prisma.employeeSchedule.findMany({
    where: { employeeId: input.employeeId, shiftId: input.shiftId, effectiveStart: input.effectiveStart, effectiveEnd: input.effectiveEnd },
    include: { shift: true },
  });
  if (rows.length === 0) throw new Error("Assignment not found.");
  const today = todayJakarta();
  const used = await prisma.attendanceRecord.count({
    where: {
      employeeId: input.employeeId,
      shiftName: rows[0].shift?.name ?? "",
      source: { in: ["CLOCK", "CORRECTION"] },
      workDate: { gte: input.effectiveStart || "0000-01-01", ...(input.effectiveEnd ? { lte: input.effectiveEnd } : {}) },
    },
  });
  if (used > 0 && input.effectiveStart < today) {
    await prisma.employeeSchedule.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { effectiveEnd: addDays(today, -1) } });
    await audit(ctx, "schedule.end", "Employee", input.employeeId, input.shiftId);
    return "This assignment already has attendance. It was ended yesterday so the history stays unchanged.";
  }
  await prisma.employeeSchedule.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  await audit(ctx, "schedule.delete", "Employee", input.employeeId, input.shiftId);
  return "Assignment removed.";
}

export async function saveHoliday(ctx: Ctx, date: string, name: string) {
  if (!hasPerm(ctx, "attendance.configure")) throw new Error("You do not have permission to edit the holiday calendar.");
  const companyId = requireCompany(ctx);
  await prisma.holiday.upsert({ where: { companyId_date: { companyId, date } }, update: { name }, create: { companyId, date, name } });
  await audit(ctx, "holiday.save", "Holiday", date, name);
}

export async function saveAttendancePolicy(ctx: Ctx, input: { graceMinutes: number; lateDeductionPerMinute: number; lateIntervalMinutes: number; lateCapEnabled: boolean; lateDailyMax: number }) {
  if (!hasPerm(ctx, "attendance.configure")) throw new Error("You do not have permission to edit attendance policy.");
  if (input.lateIntervalMinutes < 1) throw new Error("The penalty interval must be at least 1 minute.");
  if (input.lateDeductionPerMinute < 0 || input.lateDailyMax < 0) throw new Error("The penalty amount cannot be negative.");
  const companyId = requireCompany(ctx);
  await prisma.attendancePolicy.upsert({
    where: { companyId },
    update: input,
    create: { companyId, ...input },
  });
  await audit(ctx, "attendance.policy", "AttendancePolicy", companyId, `${input.graceMinutes} grace`);
}

export async function saveOvertimePolicy(ctx: Ctx, input: { allowBefore: boolean; allowAfter: boolean; multiplier: number; hourlyDivisor: number; maxHoursPerDay: number; roundingMinutes: number; mealAllowance: number; payMethod: string; fixedHourlyRate: number; submitLimitEnabled: boolean; submitLimitDays: number }) {
  if (input.mealAllowance < 0 || input.fixedHourlyRate < 0) throw new Error("The meal allowance cannot be negative.");
  if (!hasPerm(ctx, "overtime.configure")) throw new Error("You do not have permission to edit overtime policy.");
  if (input.submitLimitEnabled && input.submitLimitDays < 0) throw new Error("The overtime submission limit cannot be negative.");
  const companyId = requireCompany(ctx);
  if (input.hourlyDivisor <= 0) throw new Error("The hourly divisor must be greater than zero.");
  const stored = { ...input, payMethod: input.fixedHourlyRate > 0 ? "FIXED_HOURLY" : "FORMULA" };
  await prisma.overtimePolicy.upsert({ where: { companyId }, update: stored, create: { companyId, ...stored } });
  await audit(ctx, "overtime.policy", "OvertimePolicy", companyId, String(input.multiplier));
}

export async function saveLeaveType(ctx: Ctx, input: {
  id: string;
  name: string;
  useQuota: boolean;
  quotaDays: number;
  quotaPeriod: string;
  allocation: string;
  accrualRate: number;
  carryForward: boolean;
  carryForwardDays: number;
  expiryMode: string;
  expiryDate: string;
  requiresAttachment: boolean;
  paid: boolean;
  allowHalfDay: boolean;
}) {
  if (!hasPerm(ctx, "leave.manage")) throw new Error("You do not have permission to edit leave policy.");
  const companyId = requireCompany(ctx);
  if (!input.name) throw new Error("Leave type name is required.");
  let balanceMode = "NONE";
  let quotaDays = 0;
  let quotaPeriod = "YEARLY";
  let accrualRate = 0;
  let carryForwardDays = 0;
  let expiryDate = "";
  if (input.useQuota) {
    if (input.quotaDays <= 0) throw new Error("Leave quota must be greater than zero.");
    if (input.quotaPeriod !== "MONTHLY" && input.quotaPeriod !== "YEARLY") throw new Error("Choose a monthly or yearly quota period.");
    if (input.allocation !== "UPFRONT" && input.allocation !== "ACCRUAL") throw new Error("Choose an allocation method.");
    balanceMode = input.allocation;
    quotaDays = input.quotaDays;
    quotaPeriod = input.quotaPeriod;
    if (balanceMode === "ACCRUAL") {
      if (input.accrualRate <= 0) throw new Error("Accrual rate must be greater than zero.");
      if (input.accrualRate > input.quotaDays) throw new Error("Accrual rate cannot be larger than the leave quota.");
      accrualRate = input.accrualRate;
    }
    if (input.carryForward) {
      if (input.carryForwardDays <= 0) throw new Error("Carry forward cap must be greater than zero.");
      carryForwardDays = input.carryForwardDays;
    }
    if (input.expiryMode === "DATE") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) throw new Error("Choose an expiry date.");
      expiryDate = input.expiryDate;
    }
  }
  const data = {
    name: input.name,
    balanceMode,
    quotaDays,
    quotaPeriod,
    accrualRate,
    requiresAttachment: input.requiresAttachment,
    paid: input.paid,
    allowHalfDay: input.allowHalfDay,
    carryForwardDays,
    expiryMonth: 0,
    expiryDate,
  };
  if (input.id) {
    const current = await prisma.leaveType.findFirst({ where: { id: input.id, companyId } });
    if (!current) throw new Error("Leave type not found.");
    await prisma.leaveType.update({ where: { id: current.id }, data });
    await audit(ctx, "leave.policy", "LeaveType", current.id, input.name);
    return "Leave policy saved.";
  }
  const created = await prisma.leaveType.create({ data: { companyId, ...data } });
  await audit(ctx, "leave.policy", "LeaveType", created.id, input.name);
  return "Leave type added.";
}

export async function saveComponent(ctx: Ctx, input: { name: string; kind: string; calc: string; amount: number }) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required.");
  const companyId = requireCompany(ctx);
  await prisma.payrollComponent.create({ data: { companyId, name: input.name, kind: input.kind, calc: input.calc, amount: input.amount } });
  await audit(ctx, "payroll.component", "PayrollComponent", input.name, input.name);
}

export async function savePeriod(ctx: Ctx, input: { name: string; kind: string; startDate: string; endDate: string; cutoffDate: string; payDate: string }) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required.");
  const companyId = requireCompany(ctx);
  if (!input.name || input.endDate < input.startDate) throw new Error("A period needs a name and a valid date range.");
  const period = await prisma.payrollPeriod.create({ data: { companyId, ...input } });
  await audit(ctx, "payroll.period", "PayrollPeriod", period.id, input.name);
  return period.id;
}

export async function saveExtra(ctx: Ctx, input: { employeeId: string; year: number; kind: string; mode: string; amount: number }) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required.");
  const companyId = requireCompany(ctx);
  await prisma.extraPay.upsert({
    where: { employeeId_year_kind: { employeeId: input.employeeId, year: input.year, kind: input.kind } },
    update: { mode: input.mode, amount: input.amount },
    create: { companyId, ...input },
  });
  await audit(ctx, "payroll.extra", "ExtraPay", input.employeeId, input.kind);
}

export async function saveStatutoryChoice(ctx: Ctx, input: { jkkClass: number; bpjsKesEnabled: boolean; includeOvertime: boolean }) {
  if (!hasPerm(ctx, "tax.configure")) throw new Error("You can change only the allowed company statutory parameters.");
  const companyId = requireCompany(ctx);
  if (input.jkkClass < 1 || input.jkkClass > 5) throw new Error("JKK class must be from 1 to 5.");
  const rule = await prisma.statutoryRule.findFirst({ where: { active: true } });
  if (!rule) throw new Error("No active platform rule.");
  await prisma.companyStatutorySetting.upsert({
    where: { companyId },
    update: input,
    create: { companyId, ruleId: rule.id, ...input },
  });
  await audit(ctx, "tax.parameters", "CompanyStatutorySetting", companyId, `JKK ${input.jkkClass}`);
}

const DATA_SCOPES = new Set(["SELF", "DIRECT_REPORTS", "DEPARTMENT", "BRANCH", "COMPANY"]);

function storedScope(chosen: string | undefined, roleScope: string) {
  if (!chosen) return "";
  if (!DATA_SCOPES.has(chosen)) throw new Error("Choose a data scope.");
  return chosen === roleScope ? "" : chosen;
}

export async function savePlatformRule(ctx: Ctx, input: { code: string; name: string; effectiveFrom: string; definition: string; note: string; source: string; reference: string; review: boolean }) {
  if (!hasPerm(ctx, "tax.platform")) throw new Error("Only a platform administrator can change statutory formulas.");
  const code = input.code.trim();
  if (!code || !input.name.trim() || !input.effectiveFrom || !input.source.trim()) throw new Error("A rule version needs a code, name, effective date, and source.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new Error("Effective from is not a valid date.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.definition);
  } catch {
    throw new Error("Rule JSON is not valid.");
  }
  if (ruleError(parsed)) throw new Error("The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.");
  const existing = await prisma.statutoryRule.findUnique({ where: { code } });
  if (existing && (existing.active || existing.approvalStatus === "SAMPLE" || existing.approvalStatus === "APPROVED")) throw new Error("This version is already used by a payroll period. Save a new version code.");
  const approvalStatus = input.review ? "PENDING_REVIEW" : "DRAFT";
  const data = { name: input.name.trim(), effectiveFrom: input.effectiveFrom, definition: input.definition, note: input.note, source: input.source.trim(), reference: input.reference.trim(), status: "VALIDATED", approvalStatus, active: false, rejectionReason: "", reviewedBy: "" };
  await prisma.statutoryRule.upsert({ where: { code }, update: data, create: { code, ...data } });
  await audit(ctx, "tax.rule", "StatutoryRule", code, `${approvalStatus} ${input.effectiveFrom} ${input.source.trim()}`);
}

export async function decideStatutoryRule(ctx: Ctx, id: string, decision: "APPROVED" | "REJECTED", reason: string) {
  if (!hasPerm(ctx, "tax.platform")) throw new Error("Only a platform administrator can change statutory formulas.");
  const rule = await prisma.statutoryRule.findUnique({ where: { id } });
  if (!rule) throw new Error("That rule was not found.");
  if (rule.approvalStatus === "SAMPLE") throw new Error("The sample rule is not an official regulation and cannot be approved.");
  if (decision === "REJECTED" && !reason.trim()) throw new Error("A rejection needs a reason.");
  if (decision === "APPROVED" && rule.status !== "VALIDATED") throw new Error("Technical validation must pass before approval.");
  await prisma.statutoryRule.update({ where: { id: rule.id }, data: { approvalStatus: decision, active: decision === "APPROVED", rejectionReason: decision === "REJECTED" ? reason.trim() : "", reviewedBy: ctx.email } });
  await audit(ctx, decision === "APPROVED" ? "tax.rule.approve" : "tax.rule.reject", "StatutoryRule", rule.code, reason.trim());
}

export async function checkRegulatoryUpdate(ctx: Ctx) {
  if (!hasPerm(ctx, "tax.platform") && !hasPerm(ctx, "tax.configure")) throw new Error("You can change only the allowed company statutory parameters.");
  const result = "No official programmable source is connected. No rule was created.";
  await prisma.platformSetting.update({ where: { id: 1 }, data: { regulatoryCheckedAt: new Date(), regulatoryCheckResult: result } });
  await audit(ctx, "tax.check", "StatutoryRule", "source", result);
  return result;
}

export async function createTenant(ctx: Ctx, name: string, adminEmail: string) {
  if (!hasPerm(ctx, "settings.platform")) throw new Error("Platform permission is required.");
  if (!name || !adminEmail) throw new Error("Tenant name and admin email are required.");
  const company = await prisma.company.create({ data: { name, email: adminEmail } });
  const { DEFAULT_ROLE_TEMPLATES } = await import("@/lib/permissions");
  let adminRoleId = "";
  for (const [key, template] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    const role = await prisma.role.create({
      data: { companyId: company.id, key, name: template.name, isDefault: true, dataScope: template.scope, layout: template.layout, permissions: JSON.stringify(template.permissions) },
    });
    if (key === "company_admin") adminRoleId = role.id;
  }
  const password = temporaryPassword();
  await prisma.user.create({ data: { companyId: company.id, email: adminEmail, passwordHash: await hashPassword(password), roleId: adminRoleId, mustChangePassword: true } });
  await prisma.attendancePolicy.create({ data: { companyId: company.id } });
  await prisma.overtimePolicy.create({ data: { companyId: company.id } });
  const rule = await prisma.statutoryRule.findFirst({ where: { active: true } });
  if (rule) await prisma.companyStatutorySetting.create({ data: { companyId: company.id, ruleId: rule.id } });
  await audit(ctx, "platform.tenant", "Company", company.id, name);
  return password;
}

export async function saveUser(ctx: Ctx, input: { id?: string; email: string; roleId: string; employeeId: string; status: string; dataScope?: string }) {
  if (!hasPerm(ctx, "settings.users")) throw new Error("You do not have permission to manage users.");
  const companyId = requireCompany(ctx);
  const role = await prisma.role.findFirst({ where: { id: input.roleId, companyId } });
  if (!role) throw new Error("Choose one role from this company.");
  const current = input.id ? await prisma.user.findFirst({ where: { id: input.id, companyId } }) : null;
  if (!role.active && role.id !== current?.roleId) throw new Error("That role is inactive.");
  if (input.employeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
    if (!employee) throw new Error("Employee not found in this company.");
    const linked = await prisma.user.findFirst({ where: { employeeId: input.employeeId, NOT: input.id ? { id: input.id } : undefined } });
    if (linked) throw new Error("That employee is already linked to a user.");
  }
  if (input.id) {
    if (!current) throw new Error("User not found.");
    const previous = await prisma.role.findUnique({ where: { id: current.roleId } });
    const dataScope = storedScope(input.dataScope, role.dataScope);
    await prisma.user.update({ where: { id: current.id }, data: { email: input.email, roleId: role.id, employeeId: input.employeeId || null, status: input.status, ...(input.dataScope ? { dataScope } : {}) } });
    await audit(ctx, "user.update", "User", current.id, `${previous?.name || ""} → ${role.name}; scope ${current.dataScope || previous?.dataScope || ""} → ${input.dataScope || current.dataScope || role.dataScope}`);
    return "";
  }
  const password = temporaryPassword();
  const error = passwordError(password, await policyFor(ctx));
  if (error) throw new Error(error);
  await prisma.user.create({
    data: { companyId, email: input.email, passwordHash: await hashPassword(password), roleId: role.id, employeeId: input.employeeId || null, mustChangePassword: true, tempPasswordUntil: await tempUntil(companyId), status: input.status || "ACTIVE" },
  });
  await audit(ctx, "user.create", "User", input.email, role.name);
  return password;
}

export async function resetPassword(ctx: Ctx, userId: string) {
  if (!hasPerm(ctx, "settings.users")) throw new Error("You do not have permission to reset a password.");
  const companyId = requireCompany(ctx);
  const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!user) throw new Error("User not found.");
  const password = temporaryPassword();
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, tempPasswordUntil: await tempUntil(companyId), failedLogins: 0, lockedUntil: null } });
  await audit(ctx, "user.reset-password", "User", user.id, user.email);
  return password;
}

export async function saveRole(ctx: Ctx, input: { id?: string; name: string; dataScope: string; scopeRefId: string; permissions: string[] }) {
  if (!hasPerm(ctx, "settings.roles")) throw new Error("You do not have permission to edit roles.");
  const companyId = requireCompany(ctx);
  const permissions = JSON.stringify(input.permissions);
  if (input.id) {
    const role = await prisma.role.findFirst({ where: { id: input.id, companyId } });
    if (!role) throw new Error("Role not found.");
    if (role.key === "company_admin" && !input.permissions.includes("settings.users")) throw new Error("Company Admin must keep user management.");
    await prisma.role.update({
      where: { id: role.id },
      data: { name: input.name || role.name, dataScope: input.dataScope, scopeRefId: input.scopeRefId, permissions, layout: role.isCustom ? "standard" : role.layout },
    });
    await audit(ctx, "role.update", "Role", role.id, `${role.name}: ${input.permissions.length} permissions`);
    return;
  }
  const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `custom-${Date.now()}`;
  await prisma.role.create({ data: { companyId, key, name: input.name, isCustom: true, dataScope: input.dataScope, scopeRefId: input.scopeRefId, layout: "standard", permissions } });
  await audit(ctx, "role.create", "Role", key, input.name);
}

export async function saveSecurity(ctx: Ctx, input: PasswordPolicy & { sessionTimeoutMin: number; maxFailedLogins: number; lockoutMin: number; tempPasswordHours: number }) {
  if (!hasPerm(ctx, "settings.security")) throw new Error("You do not have permission to edit security settings.");
  if (input.minLength < 8) throw new Error("Minimum password length cannot be below 8.");
  if (input.tempPasswordHours < 1 || input.tempPasswordHours > 720) throw new Error("Temporary password hours must be between 1 and 720.");
  if (!ctx.companyId) {
    await prisma.platformSetting.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
  } else {
    await prisma.company.update({ where: { id: ctx.companyId }, data: input });
  }
  await audit(ctx, "security.update", "Security", ctx.companyId ?? "platform", `${input.sessionTimeoutMin} min`);
}

export async function saveDelegation(ctx: Ctx, input: { toUserId: string; modules: string[]; startDate: string; endDate: string }) {
  if (!hasPerm(ctx, "approvals.delegate")) throw new Error("You do not have permission to delegate approvals.");
  const companyId = requireCompany(ctx);
  if (input.toUserId === ctx.userId) throw new Error("You cannot delegate to yourself.");
  if (input.endDate < input.startDate || input.modules.length === 0) throw new Error("Delegation needs a module scope and an end date.");
  const target = await prisma.user.findFirst({ where: { id: input.toUserId, companyId, status: "ACTIVE" } });
  if (!target) throw new Error("The delegate must be an active user in this company.");
  await prisma.delegation.create({ data: { companyId, fromUserId: ctx.userId, toUserId: target.id, modules: JSON.stringify(input.modules), startDate: input.startDate, endDate: input.endDate } });
  await audit(ctx, "approval.delegate", "Delegation", target.id, input.modules.join(","));
}

export async function changeOwnPassword(ctx: Ctx, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const { verifyPassword } = await import("@/lib/password");
  if (!(await verifyPassword(current, user.passwordHash))) throw new Error("The current password is not correct.");
  const error = passwordError(next, await policyFor(ctx));
  if (error) throw new Error(error);
  await prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, tempPasswordUntil: null } });
  await audit(ctx, "password.change", "User", ctx.userId, "");
}

export async function replaceTemporaryPassword(ctx: Ctx, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!user.mustChangePassword) throw new Error("The current password is not correct.");
  const { verifyPassword } = await import("@/lib/password");
  if (await verifyPassword(next, user.passwordHash)) throw new Error("The temporary password cannot be reused.");
  const error = passwordError(next, await policyFor(ctx));
  if (error) throw new Error(error);
  await prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, tempPasswordUntil: null } });
  await audit(ctx, "password.change", "User", ctx.userId, "");
}

export async function setRoleActive(ctx: Ctx, id: string, active: boolean) {
  if (!hasPerm(ctx, "settings.roles")) throw new Error("You do not have permission to edit roles.");
  const companyId = requireCompany(ctx);
  const role = await prisma.role.findFirst({ where: { id, companyId } });
  if (!role) throw new Error("Role not found.");
  if (!role.isCustom) throw new Error("A built-in role stays available.");
  const used = await prisma.user.count({ where: { roleId: role.id } });
  await prisma.role.update({ where: { id: role.id }, data: { active } });
  await audit(ctx, active ? "role.activate" : "role.deactivate", "Role", role.id, used ? `${role.name} · ${used} existing users keep this role` : role.name);
}

export function rolePermissions(value: string): string[] {
  return parsePermissions(value);
}
