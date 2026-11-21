"use server";

import { assertPerm, getCtx, isNextRedirect, requireUser } from "@/lib/context";
import { checked, chosen, decimal, integer, text } from "@/lib/format";
import { act } from "@/server/flash";
import { changeOwnPassword, checkRegulatoryUpdate, createTenant, decideStatutoryRule, deleteAssignment, deleteShift, replaceTemporaryPassword, resetPassword, saveAssignment, saveAttendancePolicy, saveBranch, saveCompanyProfile, saveComponent, saveDelegation, saveDepartment, saveExtra, saveHoliday, saveLeaveType, saveLocation, saveOvertimePolicy, savePeriod, savePlatformRule, savePosition, saveRole, saveSecurity, saveShift, saveStatutoryChoice, saveUser, setRoleActive } from "@/server/admin";
import { activateEmployee, addDocument, addOwnDocument, changeEmployment, decideContract, decideProfileChange, inviteEmployee, offboardEmployee, saveDraft, setPayslipPin, updateOwnProfile } from "@/server/people";
import { applyEmployeeImport, cancelEmployeeImport, stageEmployeeImport } from "@/server/import";
import { redirect } from "next/navigation";
import { addAdjustment, decidePayroll, finalizePayroll, openAdjustmentPeriod, processPayroll, publishPayslips, resendPayslips, submitPayroll } from "@/server/payroll";
import { cancelLeave, clock, correctAttendance, decideLeave, decideLeaveCancel, decideOvertime, resubmitLeave, resubmitOvertime, reviewOvertimeCompensation, submitLeave, submitOvertime } from "@/server/time";
import { cancelTravel, createGoal, decideClaim, decideLoan, decideOffsite, postClaim, postLoanInstallment, reviseGoal, saveBenefits, saveTravelDay, submitClaim, submitGoal, submitLoan, submitOffsite, submitTravel, updateGoal } from "@/server/workforce";
import { assignParticipant, cancelTraining, createTraining, markAttendance, registerTraining, removeParticipant, submitEvaluation, updateTraining, uploadCertificate } from "@/server/training";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { payslipCanOpen } from "@/lib/domain";
import { applyJointHolidays } from "@/server/holidays";
import { decideShiftSwap, decideTimesheet, issueWarning, postAnnouncement, submitShiftSwap, submitTimesheet, writeOneOnOne } from "@/server/workplace";
import { requireCompany } from "@/server/scope";
import { saveWorkflow } from "@/server/workflow";

export async function saveEmployeeAction(formData: FormData) {
  const id = text(formData.get("id"));
  const path = id ? `/employees/${id}` : "/employees/onboarding";
  await act(path, async () => {
    const ctx = await assertPerm("employees.manage");
    const input = Object.fromEntries([...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const employee = await saveDraft(ctx, input, id || undefined);
    const { redirect } = await import("next/navigation");
    const draftNote = "Draft saved. HR will complete payroll details and activate the employee.";
    const message = id ? "Employee saved." : ctx.permissions.has("employees.activate") ? "Draft saved. The employee is not active and has no ESS access." : draftNote;
    redirect(`/employees/${employee.id}?ok=${encodeURIComponent(message)}`);
  });
}

export async function importAction(formData: FormData) {
  await act("/employees", async () => {
    const batch = await stageEmployeeImport(await assertPerm("employees.manage"), formData.get("file") as File);
    redirect(`/employees/import?batch=${batch}`);
  });
}

export async function confirmImportAction(formData: FormData) {
  await act("/employees", async () => applyEmployeeImport(await assertPerm("employees.manage"), text(formData.get("batch"))));
}

export async function cancelImportAction(formData: FormData) {
  await act("/employees", async () => cancelEmployeeImport(await assertPerm("employees.manage"), text(formData.get("batch"))));
}

export async function activateAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/employees/${id}`, async () => {
    await activateEmployee(await assertPerm("employees.activate"), id);
    return "Employee activated.";
  });
}

export async function inviteAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/employees/${id}`, async () => {
    const password = await inviteEmployee(await assertPerm("employees.activate"), id);
    return `ESS invitation created. Temporary password: ${password}`;
  });
}

export async function employmentAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/employees/${id}/employment`, async () => changeEmployment(await assertPerm("employees.manage"), id, Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]))));
}

export async function offboardAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/employees/${id}`, async () => offboardEmployee(await assertPerm("employees.manage"), id, {
    exitType: text(formData.get("exitType")),
    exitReason: text(formData.get("exitReason")),
    lastWorkingDay: text(formData.get("lastWorkingDay")),
    clearanceAccess: checked(formData.get("clearanceAccess")),
    clearanceAssets: checked(formData.get("clearanceAssets")),
    clearanceBpjs: checked(formData.get("clearanceBpjs")),
    finalPayrollDone: checked(formData.get("finalPayrollDone")),
  }));
}

export async function documentAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/employees/${id}?tab=documents`, async () => addDocument(await assertPerm("employees.manage"), id, formData.get("file") as File, text(formData.get("expiresOn"))));
}

export async function profileAction(formData: FormData) {
  await act("/me/profile", async () => updateOwnProfile(await assertPerm("employees.self"), Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]))));
}

export async function profileDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => {
    await decideProfileChange(await assertPerm("employees.manage"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED", text(formData.get("note")));
    return "Profile decision saved.";
  });
}

export async function companyAction(formData: FormData) {
  await act("/organization", async () => saveCompanyProfile(await assertPerm("organization.manage"), Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]))));
}

export async function branchAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(id ? `/organization/branches?branch=${id}` : "/organization/branches", async () => saveBranch(await assertPerm("organization.manage"), { id, name: text(formData.get("name")), code: text(formData.get("code")), address: text(formData.get("address")) }));
}

export async function locationAction(formData: FormData) {
  const branchId = text(formData.get("branchId"));
  await act(`/organization/branches?branch=${branchId}`, async () => saveLocation(await assertPerm("organization.manage"), { id: text(formData.get("id")), branchId, name: text(formData.get("name")), address: text(formData.get("address")), lat: text(formData.get("lat")), lng: text(formData.get("lng")), radiusMeters: integer(formData.get("radiusMeters")) }));
}

export async function departmentAction(formData: FormData) {
  await act("/organization/manage?tab=divisions", async () => saveDepartment(await assertPerm("organization.manage"), { name: text(formData.get("name")), parentId: text(formData.get("parentId")), effectiveDate: text(formData.get("effectiveDate")), maxOnLeave: integer(formData.get("maxOnLeave")) }));
}

export async function positionAction(formData: FormData) {
  await act("/organization/manage?tab=positions", async () => savePosition(await assertPerm("organization.manage"), text(formData.get("name"))));
}

export async function shiftAction(formData: FormData) {
  await act("/attendance/schedules?tab=shift", async () => saveShift(await assertPerm("attendance.configure"), {
    id: text(formData.get("id")),
    name: text(formData.get("name")),
    startTime: text(formData.get("startTime")),
    endTime: text(formData.get("endTime")),
    description: text(formData.get("description")),
  }));
}

export async function deleteShiftAction(formData: FormData) {
  await act("/attendance/schedules?tab=shift", async () => deleteShift(await assertPerm("attendance.configure"), text(formData.get("id"))));
}

export async function scheduleAction(formData: FormData) {
  await act("/attendance/schedules", async () => saveAssignment(await assertPerm("attendance.configure"), {
    employeeId: text(formData.get("employeeId")),
    shiftId: text(formData.get("shiftId")),
    days: formData.getAll("days").map((value) => integer(value)),
    effectiveStart: text(formData.get("effectiveStart")),
    effectiveEnd: text(formData.get("effectiveEnd")),
    previousStart: text(formData.get("previousStart")),
    previousEnd: text(formData.get("previousEnd")),
    previousShiftId: text(formData.get("previousShiftId")),
  }));
}

export async function deleteScheduleAction(formData: FormData) {
  await act("/attendance/schedules", async () => deleteAssignment(await assertPerm("attendance.configure"), {
    employeeId: text(formData.get("employeeId")),
    shiftId: text(formData.get("shiftId")),
    effectiveStart: text(formData.get("effectiveStart")),
    effectiveEnd: text(formData.get("effectiveEnd")),
  }));
}

export async function holidayAction(formData: FormData) {
  await act("/attendance/holidays", async () => saveHoliday(await assertPerm("attendance.configure"), text(formData.get("date")), text(formData.get("name"))));
}

export async function jointHolidayAction(formData: FormData) {
  const year = integer(formData.get("year"));
  await act(`/attendance/holidays?year=${year}`, async () => {
    const ctx = await assertPerm("attendance.configure");
    const added = await applyJointHolidays(prisma, requireCompany(ctx), year);
    await audit(ctx, "holiday.joint", "Holiday", ctx.companyId || "", String(year));
    return added ? `${added} joint-leave dates now count as company holidays, so leave requests skip them.` : "Those joint-leave dates are already on the company calendar.";
  });
}

export async function attendancePolicyAction(formData: FormData) {
  await act("/attendance/policy", async () => saveAttendancePolicy(await assertPerm("attendance.configure"), {
    graceMinutes: integer(formData.get("graceMinutes")),
    lateDeductionPerMinute: integer(formData.get("lateDeductionPerMinute")),
    lateIntervalMinutes: Math.max(1, integer(formData.get("lateIntervalMinutes")) || 1),
    lateCapEnabled: checked(formData.get("lateCapEnabled")),
    lateDailyMax: integer(formData.get("lateDailyMax")),
  }));
}

export async function correctionAction(formData: FormData) {
  await act("/attendance/corrections", async () => correctAttendance(await assertPerm("attendance.correct"), text(formData.get("id")), { clockInAt: text(formData.get("clockInAt")), clockOutAt: text(formData.get("clockOutAt")), reason: text(formData.get("reason")) }));
}

export async function clockAction(formData: FormData) {
  await act("/me/attendance", async () => {
    return clock(await assertPerm("attendance.self"), text(formData.get("direction")) as "in" | "out", {
      lat: Number(formData.get("lat")),
      lng: Number(formData.get("lng")),
      accuracy: formData.get("accuracy") === "" || formData.get("accuracy") == null ? null : Number(formData.get("accuracy")),
      photo: formData.get("photo") as File,
    });
  });
}

export async function leaveAction(formData: FormData) {
  await act("/me/leave", async () => {
    const file = formData.get("attachment");
    const cover = text(formData.get("cover"));
    if (cover !== "yes" && cover !== "no") throw new Error("Choose whether someone will cover for you.");
    return submitLeave(await assertPerm("leave.self"), {
      leaveTypeId: text(formData.get("leaveTypeId")),
      startDate: text(formData.get("startDate")),
      endDate: text(formData.get("endDate")),
      halfDay: checked(formData.get("halfDay")),
      halfStart: text(formData.get("halfStart")),
      halfEnd: text(formData.get("halfEnd")),
      reason: text(formData.get("reason")),
      attachment: file instanceof File ? file : null,
      cover,
      coverId: text(formData.get("coverId")),
    });
  });
}

export async function leaveDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => {
    await decideLeave(await assertPerm("leave.approve"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED" | "RETURNED", text(formData.get("note")));
    return "Leave decision saved.";
  });
}

export async function cancelLeaveAction(formData: FormData) {
  await act("/me/leave", async () => cancelLeave(await assertPerm("leave.self"), text(formData.get("id"))));
}

export async function leaveCancelDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => {
    await decideLeaveCancel(await assertPerm("leave.manage"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED", decimal(formData.get("restoreDays")), text(formData.get("note")));
    return "Cancellation decision saved.";
  });
}

export async function resubmitLeaveAction(formData: FormData) {
  await act("/me/leave", async () => {
    const file = formData.get("attachment");
    const cover = text(formData.get("cover"));
    if (cover !== "yes" && cover !== "no") throw new Error("Choose whether someone will cover for you.");
    return resubmitLeave(await assertPerm("leave.self"), text(formData.get("id")), {
      leaveTypeId: text(formData.get("leaveTypeId")),
      startDate: text(formData.get("startDate")),
      endDate: text(formData.get("endDate")),
      halfDay: checked(formData.get("halfDay")),
      halfStart: text(formData.get("halfStart")),
      halfEnd: text(formData.get("halfEnd")),
      reason: text(formData.get("reason")),
      attachment: file instanceof File ? file : null,
      cover,
      coverId: text(formData.get("coverId")),
    });
  });
}

export async function overtimeAction(formData: FormData) {
  await act("/me/overtime", async () => submitOvertime(await assertPerm("overtime.self"), { workDate: text(formData.get("workDate")), startTime: text(formData.get("startTime")), endTime: text(formData.get("endTime")), reason: text(formData.get("reason")) }));
}

export async function overtimeDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => {
    await decideOvertime(await assertPerm("overtime.approve"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED" | "RETURNED", text(formData.get("note")));
    return "Overtime decision saved. Compensation review is a separate HR check, not another approval.";
  });
}

export async function overtimeReviewAction(formData: FormData) {
  await act("/overtime/calculation", async () => reviewOvertimeCompensation(await assertPerm("overtime.review"), text(formData.get("id")), text(formData.get("note"))));
}

export async function resubmitOvertimeAction(formData: FormData) {
  await act("/me/overtime", async () => resubmitOvertime(await assertPerm("overtime.self"), text(formData.get("id")), { startTime: text(formData.get("startTime")), endTime: text(formData.get("endTime")), reason: text(formData.get("reason")) }));
}

export async function leaveTypeAction(formData: FormData) {
  await act("/leave/policy", async () => saveLeaveType(await assertPerm("leave.manage"), {
    id: text(formData.get("id")),
    name: text(formData.get("name")),
    useQuota: text(formData.get("useQuota")) === "yes",
    quotaDays: decimal(formData.get("quotaDays")),
    quotaPeriod: text(formData.get("quotaPeriod")),
    allocation: text(formData.get("allocation")),
    accrualRate: decimal(formData.get("accrualRate")),
    carryForward: text(formData.get("carryForward")) === "yes",
    carryForwardDays: decimal(formData.get("carryForwardDays")),
    expiryMode: text(formData.get("expiryMode")),
    expiryDate: text(formData.get("expiryDate")),
    requiresAttachment: text(formData.get("requiresAttachment")) === "yes",
    paid: text(formData.get("paid")) === "yes",
    allowHalfDay: text(formData.get("allowHalfDay")) === "yes",
  }));
}

export async function overtimePolicyAction(formData: FormData) {
  await act("/overtime/policy", async () => saveOvertimePolicy(await assertPerm("overtime.configure"), {
    allowBefore: checked(formData.get("allowBefore")),
    allowAfter: checked(formData.get("allowAfter")),
    multiplier: decimal(formData.get("multiplier")),
    hourlyDivisor: decimal(formData.get("hourlyDivisor")),
    maxHoursPerDay: decimal(formData.get("maxHoursPerDay")),
    roundingMinutes: integer(formData.get("roundingMinutes")) || 1,
    mealAllowance: integer(formData.get("mealAllowance")),
    payMethod: integer(formData.get("fixedHourlyRate")) > 0 ? "FIXED_HOURLY" : "FORMULA",
    fixedHourlyRate: integer(formData.get("fixedHourlyRate")),
    submitLimitEnabled: checked(formData.get("submitLimitEnabled")),
    submitLimitDays: integer(formData.get("submitLimitDays")),
  }));
}

export async function periodAction(formData: FormData) {
  await act("/payroll/periods", async () => {
    await savePeriod(await assertPerm("payroll.prepare"), { name: text(formData.get("name")), kind: text(formData.get("kind")) || "REGULAR", startDate: text(formData.get("startDate")), endDate: text(formData.get("endDate")), cutoffDate: text(formData.get("cutoffDate")), payDate: text(formData.get("payDate")) });
    return "Payroll period created.";
  });
}

export async function componentAction(formData: FormData) {
  await act("/payroll/components", async () => saveComponent(await assertPerm("payroll.prepare"), { name: text(formData.get("name")), kind: text(formData.get("kind")), calc: text(formData.get("calc")), amount: integer(formData.get("amount")) }));
}

export async function processAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/payroll/processing?period=${id}`, async () => {
    await processPayroll(await assertPerm("payroll.prepare"), id);
    return "Payroll calculated from the current employee, attendance, leave, overtime, and statutory data.";
  });
}

export async function submitPayrollAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/payroll/processing?period=${id}`, async () => submitPayroll(await assertPerm("payroll.prepare"), id));
}

export async function payrollDecisionAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/payroll/approval?period=${id}`, async () => {
    await decidePayroll(await assertPerm("payroll.approve"), id, chosen(formData, "decision") as "APPROVED" | "RETURNED", text(formData.get("note")));
    return "Payroll decision saved.";
  });
}

export async function finalizeAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/payroll/approval?period=${id}`, async () => {
    if (!checked(formData.get("confirm"))) throw new Error("Confirm finalization before locking the payroll.");
    await finalizePayroll(await assertPerm("payroll.finalize"), id);
    return "Payroll is locked. Payslips are not visible until they are published.";
  });
}

export async function publishAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act("/payroll/payslips", async () => {
    return publishPayslips(await assertPerm("payroll.publish"), id);
  });
}

export async function resendPayslipAction(formData: FormData) {
  await act("/payroll/payslips", async () => resendPayslips(await assertPerm("payroll.publish"), text(formData.get("month"))));
}

export async function contractAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/employees/${id}?tab=contract`, async () => {
    const decision = chosen(formData, "decision");
    if (decision !== "RENEW" && decision !== "END") throw new Error("Choose renew or do not renew.");
    return decideContract(await assertPerm("employees.manage"), id, decision, text(formData.get("contractEnd")));
  });
}

export async function languageAction(formData: FormData) {
  const locale = text(formData.get("locale")) === "id" ? "id" : "en";
  const back = text(formData.get("return"));
  const next = back.startsWith("/") && !back.startsWith("//") ? back : "/overview";
  const jar = await cookies();
  jar.set("dora_lang", locale, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const ctx = await getCtx();
  if (ctx) await prisma.user.update({ where: { id: ctx.userId }, data: { locale } });
  redirect(next);
}

function adjustmentKind(value: string): "EARNING" | "DEDUCTION" | "INCENTIVE" {
  if (value === "DEDUCTION" || value === "INCENTIVE" || value === "EARNING") return value;
  throw new Error("Choose earning, deduction, or incentive.");
}

export async function processingAdjustmentAction(formData: FormData) {
  const id = text(formData.get("periodId"));
  await act(`/payroll/processing?period=${id}`, async () => {
    await addAdjustment(await assertPerm("payroll.prepare"), {
      periodId: id,
      employeeId: text(formData.get("employeeId")),
      name: text(formData.get("name")),
      kind: adjustmentKind(text(formData.get("kind"))),
      amount: integer(formData.get("amount")),
      reason: text(formData.get("reason")),
    });
    return "Manual change saved. Recalculate before submitting.";
  });
}

export async function adjustmentAction(formData: FormData) {
  const id = text(formData.get("periodId"));
  await act(`/payroll/adjustments?period=${id}`, async () => addAdjustment(await assertPerm("payroll.prepare"), {
    periodId: id,
    employeeId: text(formData.get("employeeId")),
    name: text(formData.get("name")),
    kind: adjustmentKind(text(formData.get("kind"))),
    amount: integer(formData.get("amount")),
    reason: text(formData.get("reason")),
  }));
}

export async function adjustmentPeriodAction(formData: FormData) {
  await act("/payroll/adjustments", async () => {
    const id = await openAdjustmentPeriod(await assertPerm("payroll.prepare"), text(formData.get("id")));
    const { redirect } = await import("next/navigation");
    redirect(`/payroll/adjustments?period=${id}&ok=${encodeURIComponent("Controlled adjustment period opened. The locked payroll was not changed.")}`);
  });
}

export async function extraAction(formData: FormData) {
  await act("/payroll/thr", async () => saveExtra(await assertPerm("payroll.prepare"), { employeeId: text(formData.get("employeeId")), year: integer(formData.get("year")), kind: text(formData.get("kind")), mode: text(formData.get("mode")), amount: integer(formData.get("amount")) }));
}

export async function checkRegulatoryAction(formData: FormData) {
  const path = text(formData.get("return")) === "platform" ? "/platform/rules" : "/tax/config";
  await act(path, async () => checkRegulatoryUpdate(await requireUser()));
}

export async function decideRuleAction(formData: FormData) {
  await act("/platform/rules", async () => {
    const decision = text(formData.get("decision")) === "REJECTED" ? "REJECTED" : "APPROVED";
    await decideStatutoryRule(await assertPerm("tax.platform"), text(formData.get("id")), decision, text(formData.get("reason")));
    return decision === "APPROVED" ? "Rule approved for calculation from its effective date." : "Rule rejected.";
  });
}

export async function statutoryAction(formData: FormData) {
  await act("/tax/config", async () => saveStatutoryChoice(await assertPerm("tax.configure"), { jkkClass: integer(formData.get("jkkClass")), bpjsKesEnabled: checked(formData.get("bpjsKesEnabled")), includeOvertime: checked(formData.get("includeOvertime")) }));
}

export async function platformRuleAction(formData: FormData) {
  await act("/platform/rules", async () => savePlatformRule(await assertPerm("tax.platform"), { code: text(formData.get("code")), name: text(formData.get("name")), effectiveFrom: text(formData.get("effectiveFrom")), definition: text(formData.get("definition")), note: text(formData.get("note")), source: text(formData.get("source")), reference: text(formData.get("reference")), review: checked(formData.get("review")) }));
}

export async function tenantAction(formData: FormData) {
  await act("/platform/tenants", async () => {
    const password = await createTenant(await assertPerm("settings.platform"), text(formData.get("name")), text(formData.get("email")));
    return `Tenant created. Temporary admin password: ${password}`;
  });
}

export async function userAction(formData: FormData) {
  await act("/settings/users", async () => {
    const password = await saveUser(await assertPerm("settings.users"), { id: text(formData.get("id")), email: text(formData.get("email")).toLowerCase(), roleId: text(formData.get("roleId")), employeeId: text(formData.get("employeeId")), status: text(formData.get("status")) || "ACTIVE" });
    return password ? `User saved. Temporary password: ${password}` : "User saved. One role is active.";
  });
}

export async function resetAction(formData: FormData) {
  await act("/settings/users", async () => {
    const ctx = await assertPerm("settings.users");
    const id = text(formData.get("id"));
    const password = await resetPassword(ctx, id);
    const user = await prisma.user.findFirst({ where: { id, companyId: ctx.companyId }, select: { email: true } });
    return `Temporary password for ${user?.email || id}: ${password}`;
  });
}

export async function userDetailAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/settings/users/${id}`, async () => {
    await saveUser(await assertPerm("settings.users"), { id, email: text(formData.get("email")).toLowerCase(), roleId: text(formData.get("roleId")), employeeId: text(formData.get("employeeId")), status: text(formData.get("status")) || "ACTIVE", dataScope: text(formData.get("dataScope")) });
    return "Role saved. Access follows that role.";
  });
}

export async function roleActiveAction(formData: FormData) {
  const active = text(formData.get("active")) === "true";
  await act("/settings/permissions", async () => {
    await setRoleActive(await assertPerm("settings.roles"), text(formData.get("id")), active);
    return active ? "Role activated." : "Role deactivated. Employees who already use it keep that access.";
  });
}

export async function workflowAction(formData: FormData) {
  await act("/settings/permissions", async () => {
    await saveWorkflow(await assertPerm("approvals.configure"), {
      id: text(formData.get("id")),
      name: text(formData.get("name")),
      module: text(formData.get("module")),
      active: text(formData.get("active")) !== "false",
      allowReturn: text(formData.get("allowReturn")) === "RETURN",
      levelsJson: text(formData.get("levels")),
    });
    return "Workflow saved.";
  });
}

export async function roleAction(formData: FormData) {
  await act("/settings/roles", async () => {
    const permissions = formData.getAll("permissions").map(String);
    await saveRole(await assertPerm("settings.roles"), { id: text(formData.get("id")), name: text(formData.get("name")), dataScope: text(formData.get("dataScope")), scopeRefId: text(formData.get("scopeRefId")), permissions });
    return "Role saved. A custom role keeps the standard overview layout.";
  });
}

export async function roleAccessAction(formData: FormData) {
  const userId = text(formData.get("userId"));
  await act(userId ? `/settings/users/${userId}` : "/settings/permissions", async () => {
    await saveRole(await assertPerm("settings.roles"), { id: text(formData.get("id")), name: text(formData.get("name")), dataScope: text(formData.get("dataScope")), scopeRefId: text(formData.get("scopeRefId")), permissions: formData.getAll("permissions").map(String) });
    return "Role access saved. Every user with this role now has these permissions.";
  });
}

export async function securityAction(formData: FormData) {
  await act("/settings/security", async () => saveSecurity(await assertPerm("settings.security"), {
    minLength: integer(formData.get("minLength")),
    requireUpper: checked(formData.get("requireUpper")),
    requireLower: checked(formData.get("requireLower")),
    requireDigit: checked(formData.get("requireDigit")),
    sessionTimeoutMin: integer(formData.get("sessionTimeoutMin")),
    maxFailedLogins: integer(formData.get("maxFailedLogins")),
    lockoutMin: integer(formData.get("lockoutMin")),
    tempPasswordHours: integer(formData.get("tempPasswordHours")),
  }));
}

export async function delegationAction(formData: FormData) {
  await act("/approvals/delegation", async () => saveDelegation(await assertPerm("approvals.delegate"), { toUserId: text(formData.get("toUserId")), modules: formData.getAll("modules").map(String), startDate: text(formData.get("startDate")), endDate: text(formData.get("endDate")) }));
}

export async function passwordAction(formData: FormData) {
  await act("/change-password", async () => {
    const ctx = await requireUser({ allowPasswordChange: true });
    const next = text(formData.get("next"));
    if (ctx.mustChangePassword) {
      if (next !== text(formData.get("confirm"))) throw new Error("The new password does not match.");
      await replaceTemporaryPassword(ctx, next);
    } else {
      await changeOwnPassword(ctx, text(formData.get("current")), next);
    }
    const { redirect } = await import("next/navigation");
    redirect("/overview?ok=Password%20changed.");
  });
}

export async function payslipAction(formData: FormData) {
  const periodId = text(formData.get("periodId"));
  try {
    const ctx = await assertPerm("payroll.self");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!user.payslipPinHash) throw new Error("Set a 6-digit payslip PIN on your profile first.");
    const passwordOk = await verifyPassword(text(formData.get("pin")), user.payslipPinHash);
    const item = ctx.employeeId ? await prisma.payrollItem.findFirst({ where: { periodId, employeeId: ctx.employeeId }, include: { period: true } }) : null;
    if (!payslipCanOpen({ published: Boolean(item?.period.payslipPublished), owner: Boolean(item), passwordOk })) {
      throw new Error("Payslip access needs your PIN, and only your own published payslip can be opened.");
    }
    const token = randomBytes(24).toString("hex");
    await prisma.payslipGrant.create({ data: { userId: ctx.userId, periodId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    const jar = await cookies();
    jar.set("dora_payslip", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
    await audit(ctx, "payslip.view", "PayrollPeriod", periodId, "reauthenticated");
    const { redirect } = await import("next/navigation");
    redirect(`/me/payslip?period=${periodId}&ok=Payslip%20unlocked%20for%20five%20minutes.`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const { redirect } = await import("next/navigation");
    redirect(`/me/payslip?period=${periodId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Payslip access failed.")}`);
  }
}

export async function readNotificationAction(formData: FormData) {
  await act("/notifications", async () => {
    const ctx = await requireUser();
    await prisma.notification.updateMany({ where: { id: text(formData.get("id")), userId: ctx.userId }, data: { readAt: new Date() } });
  });
}

function safePath(value: string, fallback: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.includes("://")) return value;
  return fallback;
}

export async function openNotificationAction(formData: FormData) {
  const ctx = await requireUser();
  const row = await prisma.notification.findFirst({ where: { id: text(formData.get("id")), userId: ctx.userId } });
  if (row) await prisma.notification.update({ where: { id: row.id }, data: { readAt: new Date() } });
  redirect(safePath(row?.href || "", "/notifications"));
}

export async function readAllNotificationsAction(formData: FormData) {
  const ctx = await requireUser();
  await prisma.notification.updateMany({ where: { userId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
  redirect(`${safePath(text(formData.get("return")), "/notifications")}?ok=${encodeURIComponent("All notifications marked read.")}`);
}

export async function avatarAction(formData: FormData) {
  await act("/me/profile", async () => {
    const ctx = await assertPerm("employees.self");
    if (!ctx.employeeId || !ctx.companyId) throw new Error("Your account is not linked to an employee.");
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a profile photo.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Upload a JPG, PNG, or WEBP photo.");
    const { saveEmployeeFile } = await import("@/lib/files");
    const fileId = await saveEmployeeFile({ companyId: ctx.companyId, employeeId: ctx.employeeId, file });
    await prisma.employeeDocument.create({ data: { employeeId: ctx.employeeId, name: "Profile photo", fileId } });
    return "Profile photo saved.";
  });
}

export async function ownDocumentAction(formData: FormData) {
  await act("/me/profile", async () => addOwnDocument(await assertPerm("employees.self"), text(formData.get("kind")), text(formData.get("label")), formData.get("file") as File, text(formData.get("expiresOn")), { name: text(formData.get("trainingName")), provider: text(formData.get("trainingProvider")), date: text(formData.get("trainingDate")) }));
}

export async function payslipPinAction(formData: FormData) {
  await act("/me/profile", async () => setPayslipPin(await requireUser(), text(formData.get("current")), text(formData.get("pin")), text(formData.get("confirm"))));
}

export async function offsiteAction(formData: FormData) {
  await act("/me/attendance", async () => {
    const ctx = await assertPerm("attendance.self");
    if (text(formData.get("kind")) === "TRAVEL") {
      return submitTravel(ctx, {
        start: text(formData.get("start")),
        end: text(formData.get("end")),
        place: text(formData.get("place")),
        note: text(formData.get("note")),
        requestId: text(formData.get("requestId")),
      });
    }
    return submitOffsite(ctx, {
      workDate: text(formData.get("workDate")),
      kind: text(formData.get("kind")),
      place: text(formData.get("place")),
      note: text(formData.get("note")),
      clockIn: text(formData.get("clockIn")),
      clockOut: text(formData.get("clockOut")),
    });
  });
}

export async function travelCancelAction(formData: FormData) {
  await act("/me/attendance", async () => cancelTravel(await assertPerm("attendance.self"), text(formData.get("id"))));
}

export async function travelDayAction(formData: FormData) {
  await act("/me/attendance", async () => saveTravelDay(await assertPerm("attendance.self"), {
    requestId: text(formData.get("requestId")),
    workDate: text(formData.get("workDate")),
    clockIn: text(formData.get("clockIn")),
    clockOut: text(formData.get("clockOut")),
    note: text(formData.get("note")),
  }));
}

export async function offsiteDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => {
    await decideOffsite(await assertPerm("approvals.act"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED" | "RETURNED", text(formData.get("note")));
    return "Attendance decision saved.";
  });
}

export async function benefitsAction(formData: FormData) {
  await act("/me/benefits", async () => saveBenefits(await assertPerm("payroll.self"), {
    bpjsHealthNo: text(formData.get("bpjsHealthNo")),
    bpjsTkNo: text(formData.get("bpjsTkNo")),
    insuranceName: text(formData.get("insuranceName")),
    insuranceNo: text(formData.get("insuranceNo")),
  }));
}

export async function swapAction(formData: FormData) {
  await act("/me/attendance", async () => submitShiftSwap(await assertPerm("attendance.self"), { counterpartId: text(formData.get("counterpartId")), workDate: text(formData.get("workDate")), note: text(formData.get("note")) }));
}

export async function swapDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => decideShiftSwap(await assertPerm("approvals.act"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED", text(formData.get("note"))));
}

export async function timesheetAction(formData: FormData) {
  await act("/me/attendance", async () => submitTimesheet(await assertPerm("attendance.self"), { workDate: text(formData.get("workDate")), client: text(formData.get("client")), hours: decimal(formData.get("hours")), note: text(formData.get("note")) }));
}

export async function timesheetDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => decideTimesheet(await assertPerm("approvals.act"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED", text(formData.get("note"))));
}

export async function announcementAction(formData: FormData) {
  await act("/overview", async () => postAnnouncement(await assertPerm("organization.manage"), { title: text(formData.get("title")), body: text(formData.get("body")), endsOn: text(formData.get("endsOn")) }));
}

export async function warningAction(formData: FormData) {
  const id = text(formData.get("employeeId"));
  await act(`/employees/${id}`, async () => issueWarning(await requireUser(), id, text(formData.get("month")), text(formData.get("note"))));
}

export async function meetingAction(formData: FormData) {
  await act("/goals", async () => writeOneOnOne(await requireUser(), text(formData.get("employeeId")), text(formData.get("meetingDate")), text(formData.get("note"))));
}

export async function claimAction(formData: FormData) {
  await act("/me/benefits", async () => submitClaim(await assertPerm("payroll.self"), {
    kind: text(formData.get("kind")),
    amount: integer(formData.get("amount")),
    expenseDate: text(formData.get("expenseDate")),
    note: text(formData.get("note")),
    file: formData.get("file") as File,
  }));
}

export async function claimDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => decideClaim(await assertPerm("approvals.act"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED", text(formData.get("note"))));
}

export async function claimPostAction(formData: FormData) {
  await act("/payroll/loans", async () => postClaim(await assertPerm("payroll.prepare"), text(formData.get("claimId")), text(formData.get("periodId"))));
}

export async function loanAction(formData: FormData) {
  await act("/me/benefits", async () => submitLoan(await assertPerm("payroll.self"), {
    amount: integer(formData.get("amount")),
    tenor: integer(formData.get("tenor")),
    reason: text(formData.get("reason")),
  }));
}

export async function loanDecisionAction(formData: FormData) {
  await act("/approvals/pending", async () => {
    await decideLoan(await assertPerm("approvals.act"), text(formData.get("id")), chosen(formData, "decision") as "APPROVED" | "REJECTED", text(formData.get("note")));
    return "Loan decision saved.";
  });
}

export async function loanInstallmentAction(formData: FormData) {
  await act("/payroll/loans", async () => postLoanInstallment(await assertPerm("payroll.prepare"), text(formData.get("loanId")), text(formData.get("periodId"))));
}

export async function goalAction(formData: FormData) {
  const back = text(formData.get("return")) === "/goals" ? "/goals" : "/me/goals";
  await act(back, async () => createGoal(await assertPerm("employees.self"), {
    employeeId: text(formData.get("employeeId")),
    team: checked(formData.get("team")),
    title: text(formData.get("title")),
    metric: text(formData.get("metric")),
    unit: text(formData.get("unit")),
    target: decimal(formData.get("target")),
    startDate: text(formData.get("startDate")),
    endDate: text(formData.get("endDate")),
  }));
}

export async function goalProgressAction(formData: FormData) {
  const back = text(formData.get("return")) === "/goals" ? "/goals" : "/me/goals";
  const targetRaw = formData.get("target");
  await act(back, async () => updateGoal(await assertPerm("employees.self"), text(formData.get("id")), {
    current: decimal(formData.get("current")),
    target: typeof targetRaw === "string" && targetRaw.trim() !== "" ? decimal(targetRaw) : undefined,
    status: text(formData.get("status")),
  }));
}

export async function goalReviseAction(formData: FormData) {
  await act("/me/goals", async () => reviseGoal(await assertPerm("employees.self"), text(formData.get("id")), {
    title: text(formData.get("title")),
    metric: text(formData.get("metric")),
    unit: text(formData.get("unit")),
    target: decimal(formData.get("target")),
    startDate: text(formData.get("startDate")),
    endDate: text(formData.get("endDate")),
  }));
}

export async function goalSubmitAction(formData: FormData) {
  await act("/me/goals", async () => submitGoal(await assertPerm("employees.self"), text(formData.get("id"))));
}

function trainingInput(formData: FormData) {
  return {
    name: text(formData.get("name")),
    category: text(formData.get("category")),
    description: text(formData.get("description")),
    objective: text(formData.get("objective")),
    sessionDate: text(formData.get("sessionDate")),
    startTime: text(formData.get("startTime")),
    endTime: text(formData.get("endTime")),
    method: text(formData.get("method")),
    place: text(formData.get("place")),
    trainer: text(formData.get("trainer")),
    capacity: integer(formData.get("capacity")),
    target: text(formData.get("target")),
    materialUrl: text(formData.get("materialUrl")),
    enrollment: text(formData.get("enrollment")),
  };
}

export async function trainingCreateAction(formData: FormData) {
  await act("/training/catalog", async () => {
    const id = await createTraining(await assertPerm("training.manage"), { ...trainingInput(formData), employeeId: text(formData.get("employeeId")) });
    redirect(`/training/${id}?ok=${encodeURIComponent("Training saved.")}`);
  });
}

export async function trainingUpdateAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/training/${id}`, async () => updateTraining(await assertPerm("training.manage"), id, trainingInput(formData)));
}

export async function trainingCancelAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/training/${id}`, async () => cancelTraining(await assertPerm("training.manage"), id));
}

export async function trainingAssignAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/training/${id}?tab=people`, async () => assignParticipant(await assertPerm("training.manage"), id, text(formData.get("employeeId"))));
}

export async function trainingRemoveAction(formData: FormData) {
  const id = text(formData.get("trainingId"));
  await act(`/training/${id}?tab=people`, async () => removeParticipant(await assertPerm("training.manage"), text(formData.get("participantId"))));
}

export async function trainingAttendanceAction(formData: FormData) {
  const id = text(formData.get("trainingId"));
  await act(`/training/${id}?tab=people`, async () => markAttendance(await assertPerm("training.manage"), text(formData.get("participantId")), text(formData.get("attendance")), text(formData.get("completion"))));
}

export async function trainingCertificateAction(formData: FormData) {
  const id = text(formData.get("trainingId"));
  await act(`/training/${id}?tab=people`, async () => uploadCertificate(await assertPerm("training.manage"), text(formData.get("participantId")), formData.get("file") as File));
}

export async function trainingRegisterAction(formData: FormData) {
  const id = text(formData.get("id"));
  await act(`/me/training/${id}`, async () => registerTraining(await requireUser(), id));
}

export async function trainingEvaluationAction(formData: FormData) {
  const id = text(formData.get("trainingId"));
  await act(`/me/training/${id}`, async () => submitEvaluation(await requireUser(), text(formData.get("participantId")), {
    overall: integer(formData.get("overall")),
    material: integer(formData.get("material")),
    delivery: integer(formData.get("delivery")),
    facility: integer(formData.get("facility")),
    relevance: integer(formData.get("relevance")),
    comment: text(formData.get("comment")),
  }));
}

export async function profilePasswordAction(formData: FormData) {
  await act("/me/profile", async () => {
    const ctx = await requireUser();
    await changeOwnPassword(ctx, text(formData.get("current")), text(formData.get("next")));
    return "Password changed.";
  });
}
