import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { deliverEmail } from "@/lib/mail";
import { buildPayslipPdf } from "./payslip-pdf";
import { hasPerm, type Ctx } from "@/lib/context";
import { assertDecision } from "@/lib/decision";
import {
  calculatePay,
  canApprovePayroll,
  countLeaveDays,
  eachDate,
  employmentFactor,
  payrollApproverIds,
  ruleError,
  ruleForDate,
  weekday,
  type DelegationWindow,
  type RuleDefinition,
} from "@/lib/domain";
import { todayJakarta } from "@/lib/format";
import { canSubmitPayroll, componentBefore } from "@/lib/payroll-flow";
import { requireCompany } from "./scope";
import { commitApproval, planApproval, stageDecision } from "./workflow";

const employeeSelect = {
  id: true,
  fullName: true,
  employeeCode: true,
  status: true,
  basicSalary: true,
  ptkp: true,
  joinDate: true,
  lastWorkingDay: true,
} as const;

function workdayCount(start: string, end: string, workdays: number[], holidays: Set<string>) {
  return eachDate(start, end).filter((date) => workdays.includes(weekday(date)) && !holidays.has(date)).length;
}

async function loadStatutoryRule(startDate: string) {
  const rules = await prisma.statutoryRule.findMany();
  const row = ruleForDate(rules, startDate);
  if (!row) throw new Error("No validated statutory rule is effective for this period.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.definition);
  } catch {
    throw new Error("The statutory rule for this period failed validation.");
  }
  if (ruleError(parsed)) throw new Error("The statutory rule for this period failed validation.");
  return { row, rule: parsed as RuleDefinition };
}

export async function statutoryRuleLine(period: { startDate: string; status: string; statutoryRuleId: string }, hasItems: boolean) {
  if (period.statutoryRuleId) {
    const row = await prisma.statutoryRule.findUnique({ where: { id: period.statutoryRuleId } });
    if (!row) return { state: "missing" as const };
    return { state: "stored" as const, code: row.code, name: row.name, effectiveFrom: row.effectiveFrom, source: row.source, official: row.approvalStatus === "APPROVED" };
  }
  if (hasItems || period.status === "LOCKED" || period.status === "APPROVED" || period.status === "SUBMITTED") return { state: "unrecorded" as const };
  const row = ruleForDate(await prisma.statutoryRule.findMany(), period.startDate);
  if (!row) return { state: "none" as const };
  return { state: "pending" as const, code: row.code, name: row.name, effectiveFrom: row.effectiveFrom, source: row.source, official: row.approvalStatus === "APPROVED" };
}

export async function processPayroll(ctx: Ctx, periodId: string) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required.");
  const companyId = requireCompany(ctx);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period) throw new Error("Payroll period not found.");
  if (period.status === "LOCKED" || period.status === "APPROVED" || period.status === "SUBMITTED") {
    throw new Error("This payroll can no longer be recalculated. Return it for revision or open a controlled adjustment period.");
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const setting = await prisma.companyStatutorySetting.findUnique({ where: { companyId } });
  const { row: ruleRow, rule } = await loadStatutoryRule(period.startDate);
  const components = await prisma.payrollComponent.findMany({ where: { companyId, active: true } });
  const policy = await prisma.attendancePolicy.findUnique({ where: { companyId } });
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId } })).map((row) => row.date));
  const employees = await prisma.employee.findMany({ where: { companyId, status: { in: ["ACTIVE", "PENDING OFFBOARDING", "INACTIVE"] } }, select: employeeSelect });
  const warnings: string[] = [];
  if (ruleRow.approvalStatus !== "APPROVED") warnings.push("This calculation uses a sample rule. It is not verified for official filing.");
  const items: Prisma.PayrollItemCreateManyInput[] = [];
  for (const employee of employees) {
    const factor = employmentFactor({
      prorate: company.prorateSalary,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      joinDate: employee.joinDate,
      lastWorkingDay: employee.lastWorkingDay,
    });
    if (factor == null) continue;
    const schedules = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id } });
    const active = schedules.filter((row) => row.shiftId && row.effectiveStart <= period.startDate && (!row.effectiveEnd || row.effectiveEnd >= period.startDate));
    const workdays = active.map((row) => row.dayOfWeek);
    const activeDays = workdays.length ? workdays : [1, 2, 3, 4, 5];
    const workdaysInPeriod = workdayCount(period.startDate, period.endDate, activeDays, holidays);
    const unpaid = await unpaidLeaveDays(employee.id, period.startDate, period.endDate, activeDays, holidays);
    const late = await prisma.attendanceRecord.aggregate({
      where: { employeeId: employee.id, workDate: { gte: period.startDate, lte: period.endDate }, source: { in: ["CLOCK", "CORRECTION"] } },
      _sum: { lateMinutes: true },
    });
    const overtime = await prisma.overtimeRequest.aggregate({
      where: {
        employeeId: employee.id,
        status: "APPROVED",
        compensationStatus: "REVIEWED",
        workDate: { gte: period.startDate, lte: period.endDate },
        OR: [{ payrollPeriodId: "" }, { payrollPeriodId: period.id }],
      },
      _sum: { compensationIdr: true },
    });
    const adjustments = await prisma.payrollAdjustment.findMany({ where: { periodId: period.id, employeeId: employee.id } });
    if (period.kind === "ADJUSTMENT" && adjustments.length === 0) continue;
    const extra = period.kind === "THR" || period.kind === "BONUS"
      ? await prisma.extraPay.findUnique({ where: { employeeId_year_kind: { employeeId: employee.id, year: Number(period.startDate.slice(0, 4)), kind: period.kind } } })
      : null;
    const thrAmount = period.kind === "THR" ? (extra?.mode === "ONE_MONTH_BASIC" ? employee.basicSalary : extra?.amount ?? 0) : 0;
    const bonusAmount = period.kind === "BONUS" ? extra?.amount ?? 0 : 0;
    if ((period.kind === "THR" && thrAmount <= 0) || (period.kind === "BONUS" && bonusAmount <= 0)) continue;
    const adjustmentOnly = period.kind === "ADJUSTMENT";
    const result = calculatePay({
      kind: period.kind as "REGULAR" | "THR" | "BONUS" | "ADJUSTMENT",
      basicSalary: adjustmentOnly ? 0 : employee.basicSalary,
      factor: adjustmentOnly ? 1 : factor,
      components: adjustmentOnly ? [] : components.map((row) => ({ name: row.name, kind: row.kind as "EARNING" | "DEDUCTION", calc: row.calc as "FIXED" | "PERCENT_BASIC", amount: row.amount })),
      overtimeIdr: overtime._sum.compensationIdr ?? 0,
      unpaidLeaveDays: unpaid,
      workdaysInPeriod,
      lateMinutes: late._sum.lateMinutes ?? 0,
      lateDeductionPerMinute: policy?.lateDeductionPerMinute ?? 0,
      adjustments: adjustments.map((row) => ({ name: row.name, kind: row.kind as "EARNING" | "DEDUCTION", amount: row.amount })),
      thrAmount,
      bonusAmount,
      ptkp: employee.ptkp,
      rule,
      jkkClass: setting?.jkkClass ?? 1,
      bpjsKesEnabled: setting?.bpjsKesEnabled ?? true,
      includeOvertime: setting?.includeOvertime ?? false,
    });
    if (employee.basicSalary <= 0 && period.kind === "REGULAR") warnings.push(`${employee.fullName} has no basic salary.`);
    warnings.push(...result.warnings.map((warning) => `${employee.fullName}: ${warning}`));
    items.push({
      periodId: period.id,
      employeeId: employee.id,
      breakdown: JSON.stringify(result.lines),
      gross: result.gross,
      deduction: result.deduction,
      net: result.net,
      pph21: result.pph21,
      bpjsEmployee: result.bpjsEmployee,
      bpjsEmployer: result.bpjsEmployer,
    });
  }
  await prisma.payrollItem.deleteMany({ where: { periodId: period.id } });
  if (items.length) await prisma.payrollItem.createMany({ data: items });
  await prisma.overtimeRequest.updateMany({
    where: { companyId, status: "APPROVED", compensationStatus: "REVIEWED", workDate: { gte: period.startDate, lte: period.endDate }, payrollPeriodId: "" },
    data: { payrollPeriodId: period.id },
  });
  const saved = await prisma.payrollItem.findMany({ where: { periodId: period.id } });
  for (const item of saved) {
    await prisma.payrollAdjustment.updateMany({ where: { periodId: period.id, employeeId: item.employeeId }, data: { afterNet: item.net } });
  }
  await prisma.payrollPeriod.update({
    where: { id: period.id },
    data: { status: period.status === "NEEDS_REVISION" ? "NEEDS_REVISION" : "PROCESSED", preparedById: period.preparedById || ctx.userId, approvedById: "", warningNote: warnings.slice(0, 20).join("\n"), needsRecalc: false, statutoryRuleId: ruleRow.id },
  });
  await audit(ctx, "payroll.process", "PayrollPeriod", period.id, `${items.length} employees`);
}

async function unpaidLeaveDays(employeeId: string, start: string, end: string, workdays: number[], holidays: Set<string>) {
  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId, status: "APPROVED", leaveType: { paid: false }, startDate: { lte: end }, endDate: { gte: start } },
  });
  return requests.reduce((sum, request) => {
    const from = request.startDate > start ? request.startDate : start;
    const to = request.endDate < end ? request.endDate : end;
    return sum + countLeaveDays({ start: from, end: to, halfDay: request.halfDay && request.startDate === request.endDate, workdays, holidays: [...holidays] });
  }, 0);
}

export async function submitPayroll(ctx: Ctx, periodId: string) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required to submit.");
  const companyId = requireCompany(ctx);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period || !canSubmitPayroll(period.status, period.needsRecalc)) {
    throw new Error(period?.needsRecalc ? "Recalculate after the manual change before submitting." : "Process the payroll before submitting it.");
  }
  if (period.preparedById !== ctx.userId) throw new Error("Only the user who prepared this payroll can submit it.");
  const plan = await planApproval({ companyId, workflowKey: "PAYROLL", requesterId: ctx.userId, employeeId: ctx.employeeId || "", taskModule: "PAYROLL" });
  const approvers = plan.mode === "workflow" ? plan.assignees.map((assignee) => assignee.assigneeId) : await eligibleApprovers(companyId, period.preparedById);
  if (!approvers.length) throw new Error("This payroll stays waiting. Another user with Approve Payroll must exist. Self-approval is not allowed.");
  await prisma.approvalTask.updateMany({ where: { companyId, module: "PAYROLL", subjectId: period.id, status: "PENDING" }, data: { status: "DONE" } });
  const payrollAssignees = await commitApproval({ plan, companyId, workflowKey: "PAYROLL", taskModule: "PAYROLL", subjectId: period.id, requesterId: ctx.userId, employeeId: ctx.employeeId || "", title: `Payroll approval: ${period.name}`, href: `/payroll/approval?period=${period.id}`, fallbackAssigneeId: approvers[0], fallbackOriginalId: approvers[0] });
  if (plan.mode === "fallback") {
    for (const approverId of approvers.slice(1)) {
      await prisma.approvalTask.create({
        data: { companyId, module: "PAYROLL", subjectId: period.id, assigneeId: approverId, originalAssigneeId: approverId, requesterId: ctx.userId, title: `Payroll approval: ${period.name}`, href: `/payroll/approval?period=${period.id}` },
      });
    }
  }
  for (const approverId of (plan.mode === "workflow" ? payrollAssignees : approvers)) await notify(approverId, "Payroll waiting for approval", period.name, `/payroll/approval?period=${period.id}`);
  await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "SUBMITTED" } });
  await audit(ctx, "payroll.submit", "PayrollPeriod", period.id, approvers.join(","));
}

async function eligibleApprovers(companyId: string, preparerId: string) {
  const roles = await prisma.role.findMany({ where: { companyId } });
  const roleIds = roles.filter((role) => (JSON.parse(role.permissions) as string[]).includes("payroll.approve")).map((role) => role.id);
  const users = roleIds.length ? await prisma.user.findMany({ where: { companyId, status: "ACTIVE", roleId: { in: roleIds } } }) : [];
  const today = todayJakarta();
  const delegations = await prisma.delegation.findMany({ where: { companyId, active: true } });
  const windows: DelegationWindow[] = delegations.map((row) => ({
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    modules: JSON.parse(row.modules) as string[],
    startDate: row.startDate,
    endDate: row.endDate,
    active: row.active,
  }));
  return payrollApproverIds(users.map((user) => user.id), preparerId, windows, today);
}

export async function decidePayroll(ctx: Ctx, periodId: string, decision: "APPROVED" | "RETURNED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "RETURNED"]);
  if (decision === "RETURNED" && !note.trim()) throw new Error("A return for revision needs a note.");
  if (!hasPerm(ctx, "payroll.approve")) throw new Error("Approve Payroll permission is required.");
  const companyId = requireCompany(ctx);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period || period.status !== "SUBMITTED") throw new Error("This payroll is not waiting for approval.");
  if (!canApprovePayroll(ctx.userId, period.preparedById)) throw new Error("You cannot approve payroll that you prepared.");
  const route = await prisma.approvalRoute.findUnique({ where: { companyId_subjectId: { companyId, subjectId: period.id } } });
  const assigned = await prisma.approvalTask.findFirst({ where: { companyId, module: "PAYROLL", subjectId: period.id, status: "PENDING", assigneeId: ctx.userId } });
  if (route) {
    if (!assigned) throw new Error("This payroll is not assigned to you.");
    const stage = await stageDecision({ companyId, subjectId: period.id, taskId: assigned.id, actorId: ctx.userId, decision, note });
    if (stage === "next") {
      if (period.preparedById) await notify(period.preparedById, "Payroll moved to the next approver", note || period.name, "/payroll/processing");
      await audit(ctx, "payroll.decide", "PayrollPeriod", period.id, "NEXT");
      return;
    }
  } else {
    const approvers = await eligibleApprovers(companyId, period.preparedById);
    if (!approvers.includes(ctx.userId)) throw new Error("This payroll is not assigned to you.");
  }
  const tasks = await prisma.approvalTask.findMany({ where: { companyId, module: "PAYROLL", subjectId: period.id, status: "PENDING" } });
  for (const task of tasks) {
    await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
    await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  }
  if (decision === "APPROVED") {
    await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "APPROVED", approvedById: ctx.userId, decisionNote: note } });
  } else {
    await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "NEEDS_REVISION", decisionNote: note } });
  }
  if (period.preparedById) await notify(period.preparedById, `Payroll ${decision.toLowerCase()}`, note || period.name, "/payroll/processing");
  await audit(ctx, "payroll.decide", "PayrollPeriod", period.id, decision);
}

export async function finalizePayroll(ctx: Ctx, periodId: string) {
  if (!hasPerm(ctx, "payroll.finalize")) throw new Error("You do not have permission to finalize payroll.");
  const companyId = requireCompany(ctx);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period || period.status !== "APPROVED") throw new Error("Only an approved payroll can be finalized.");
  if (!canApprovePayroll(period.approvedById, period.preparedById)) throw new Error("Finalization is blocked because the approver is not different from the preparer.");
  await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "LOCKED" } });
  await audit(ctx, "payroll.lock", "PayrollPeriod", period.id, "LOCKED");
}

const slipInclude = { period: true, employee: { include: { user: true, company: true } } } as const;

export async function publishPayslips(ctx: Ctx, periodId: string) {
  if (!hasPerm(ctx, "payroll.publish")) throw new Error("You do not have permission to publish payslips.");
  const companyId = requireCompany(ctx);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period || period.status !== "LOCKED") throw new Error("Publish is available only after the payroll is finalized and locked.");
  if (period.payslipPublished) throw new Error("Payslips for this period are already published.");
  await prisma.payrollPeriod.update({ where: { id: period.id }, data: { payslipPublished: true } });
  const items = await prisma.payrollItem.findMany({ where: { periodId: period.id }, include: slipInclude });
  const counts = await emailPayslips(companyId, items);
  await audit(ctx, "payroll.publish", "PayrollPeriod", period.id, `${items.length} payslips`);
  return `Payslips published. ${mailSummary(counts)}`;
}

export async function resendPayslips(ctx: Ctx, month: string) {
  if (!hasPerm(ctx, "payroll.publish")) throw new Error("You do not have permission to resend payslips.");
  const companyId = requireCompany(ctx);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a month.");
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId, payslipPublished: true, startDate: { lte: `${month}-31` }, endDate: { gte: `${month}-01` } },
  });
  if (periods.length === 0) throw new Error("No published payslip covers that month.");
  const items = await prisma.payrollItem.findMany({ where: { periodId: { in: periods.map((period) => period.id) } }, include: slipInclude });
  const counts = await emailPayslips(companyId, items);
  await audit(ctx, "payroll.resend", "PayrollPeriod", periods[0]?.id || "", month);
  return `Payslips for ${month} were emailed again. ${mailSummary(counts)}`;
}

async function emailPayslips(companyId: string, items: Prisma.PayrollItemGetPayload<{ include: typeof slipInclude }>[]) {
  const counts = { sent: 0, logged: 0, failed: 0, skipped: 0 };
  for (const item of items) {
    const to = item.employee.user?.email || item.employee.email;
    const subject = `Payslip ${item.period.name}`;
    const body = `Your payslip for ${item.period.name} is attached as a PDF.`;
    if (item.employee.user) {
      await prisma.notification.create({ data: { userId: item.employee.user.id, title: subject, body, href: "/me/payslip" } });
    }
    if (!to) {
      counts.skipped += 1;
      continue;
    }
    let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
    try {
      const pdf = Buffer.from(await buildPayslipPdf(item));
      status = await deliverEmail({ to, subject, body, attachment: { filename: `payslip-${item.period.payDate}.pdf`, content: pdf } });
    } catch {
      status = "FAILED";
    }
    await prisma.emailLog.create({ data: { companyId, to, subject, body, status } });
    if (status === "SENT") counts.sent += 1;
    else if (status === "FAILED") counts.failed += 1;
    else counts.logged += 1;
  }
  return counts;
}

function mailSummary(counts: { sent: number; logged: number; failed: number; skipped: number }) {
  return `Sent ${counts.sent}. Saved in the email log ${counts.logged}. Failed ${counts.failed}. Skipped ${counts.skipped} with no email address.`;
}

export async function recordAdjustment(ctx: Ctx, input: { periodId: string; employeeId: string; name: string; kind: "EARNING" | "DEDUCTION"; amount: number; reason: string }) {
  const companyId = requireCompany(ctx);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: input.periodId, companyId } });
  if (!period) throw new Error("Payroll period not found.");
  if (!["DRAFT", "PROCESSED", "NEEDS_REVISION"].includes(period.status)) {
    throw new Error("A locked or submitted payroll cannot be edited. Open a controlled adjustment period.");
  }
  if (period.preparedById && period.preparedById !== ctx.userId) throw new Error("Only the preparer can change this payroll.");
  if (!input.reason.trim() || input.amount === 0) throw new Error("An adjustment needs a reason and a non-zero amount.");
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
  if (!employee) throw new Error("Employee not found.");
  const current = await prisma.payrollItem.findUnique({ where: { periodId_employeeId: { periodId: period.id, employeeId: employee.id } } });
  const earlier = await prisma.payrollAdjustment.findMany({ where: { periodId: period.id, employeeId: employee.id, name: input.name, kind: input.kind } });
  const applied = earlier.filter((row) => row.afterNet != null).reduce((sum, row) => sum + row.amount, 0);
  const pending = earlier.filter((row) => row.afterNet == null).reduce((sum, row) => sum + row.amount, 0);
  const lines = JSON.parse(current?.breakdown || "[]") as { name: string; kind: string; amount: number }[];
  const listed = lines.filter((line) => line.name === input.name && line.kind === input.kind).reduce((sum, line) => sum + line.amount, 0);
  await prisma.payrollAdjustment.create({
    data: {
      periodId: period.id,
      employeeId: employee.id,
      name: input.name,
      kind: input.kind,
      amount: input.amount,
      reason: input.reason,
      actorId: ctx.userId,
      beforeGross: current?.gross ?? 0,
      beforeDeduction: current?.deduction ?? 0,
      beforeNet: current?.net ?? 0,
      beforePph21: current?.pph21 ?? 0,
      beforeAmount: componentBefore(listed, applied, pending),
    },
  });
  await prisma.payrollPeriod.update({ where: { id: period.id }, data: { needsRecalc: true } });
  await audit(ctx, "payroll.adjust", "PayrollPeriod", period.id, `${employee.fullName} ${input.kind} ${input.amount} before net ${current?.net ?? 0}. ${input.reason}`);
}

export async function addAdjustment(ctx: Ctx, input: { periodId: string; employeeId: string; name: string; kind: "EARNING" | "DEDUCTION"; amount: number; reason: string }) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required to add an adjustment.");
  await recordAdjustment(ctx, input);
}

export async function openAdjustmentPeriod(ctx: Ctx, periodId: string) {
  if (!hasPerm(ctx, "payroll.prepare")) throw new Error("Prepare Payroll permission is required.");
  const companyId = requireCompany(ctx);
  const source = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId, status: "LOCKED" } });
  if (!source) throw new Error("A controlled adjustment can be opened only from a locked payroll.");
  const created = await prisma.payrollPeriod.create({
    data: {
      companyId,
      name: `${source.name} adjustment`,
      kind: "ADJUSTMENT",
      startDate: source.startDate,
      endDate: source.endDate,
      cutoffDate: source.cutoffDate,
      payDate: source.payDate,
      sourcePeriodId: source.id,
    },
  });
  await audit(ctx, "payroll.adjustment-period", "PayrollPeriod", created.id, source.id);
  return created.id;
}

export async function simulationBaseline(ctx: Ctx, employeeId: string, periodId: string) {
  if (!hasPerm(ctx, "payroll.simulate")) throw new Error("Salary simulation permission is required.");
  const companyId = requireCompany(ctx);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: employeeSelect });
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!employee || !period) throw new Error("Choose an employee and a payroll period.");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const setting = await prisma.companyStatutorySetting.findUnique({ where: { companyId } });
  const { row: ruleRow, rule } = await loadStatutoryRule(period.startDate);
  const components = await prisma.payrollComponent.findMany({ where: { companyId, active: true } });
  const policy = await prisma.attendancePolicy.findUnique({ where: { companyId } });
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId } })).map((row) => row.date));
  const factor = employmentFactor({ prorate: company.prorateSalary, periodStart: period.startDate, periodEnd: period.endDate, joinDate: employee.joinDate, lastWorkingDay: employee.lastWorkingDay });
  if (factor == null) return { ok: false as const, blocked: "This employee was not employed in that period. The simulation was not calculated." };
  const schedules = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id } });
  const active = schedules.filter((row) => row.shiftId && row.effectiveStart <= period.startDate && (!row.effectiveEnd || row.effectiveEnd >= period.startDate));
  const storedDays = active.map((row) => row.dayOfWeek);
  const activeDays = storedDays.length ? storedDays : [1, 2, 3, 4, 5];
  const workdaysInPeriod = workdayCount(period.startDate, period.endDate, activeDays, holidays);
  const unpaid = await unpaidLeaveDays(employee.id, period.startDate, period.endDate, activeDays, holidays);
  const late = await prisma.attendanceRecord.aggregate({
    where: { employeeId: employee.id, workDate: { gte: period.startDate, lte: period.endDate }, source: { in: ["CLOCK", "CORRECTION"] } },
    _sum: { lateMinutes: true },
  });
  const overtime = await prisma.overtimeRequest.aggregate({
    where: { employeeId: employee.id, status: "APPROVED", compensationStatus: "REVIEWED", workDate: { gte: period.startDate, lte: period.endDate }, OR: [{ payrollPeriodId: "" }, { payrollPeriodId: period.id }] },
    _sum: { compensationIdr: true },
  });
  const adjustments = await prisma.payrollAdjustment.findMany({ where: { periodId: period.id, employeeId: employee.id } });
  const extra = period.kind === "THR" || period.kind === "BONUS"
    ? await prisma.extraPay.findUnique({ where: { employeeId_year_kind: { employeeId: employee.id, year: Number(period.startDate.slice(0, 4)), kind: period.kind } } })
    : null;
  const input = {
    kind: period.kind as "REGULAR" | "THR" | "BONUS" | "ADJUSTMENT",
    basicSalary: period.kind === "ADJUSTMENT" ? 0 : employee.basicSalary,
    factor,
    components: (period.kind === "ADJUSTMENT" ? [] : components).map((row) => ({ name: row.name, kind: row.kind as "EARNING" | "DEDUCTION", calc: row.calc as "FIXED" | "PERCENT_BASIC", amount: row.amount })),
    overtimeIdr: overtime._sum.compensationIdr ?? 0,
    unpaidLeaveDays: unpaid,
    workdaysInPeriod,
    lateMinutes: late._sum.lateMinutes ?? 0,
    lateDeductionPerMinute: policy?.lateDeductionPerMinute ?? 0,
    adjustments: adjustments.map((row) => ({ name: row.name, kind: row.kind as "EARNING" | "DEDUCTION", amount: row.amount })),
    thrAmount: period.kind === "THR" ? (extra?.mode === "ONE_MONTH_BASIC" ? employee.basicSalary : extra?.amount ?? 0) : 0,
    bonusAmount: period.kind === "BONUS" ? extra?.amount ?? 0 : 0,
    ptkp: employee.ptkp,
    rule,
    jkkClass: setting?.jkkClass ?? 1,
    bpjsKesEnabled: setting?.bpjsKesEnabled ?? true,
    includeOvertime: setting?.includeOvertime ?? false,
  };
  return {
    ok: true as const,
    blocked: "",
    assumption: [storedDays.length ? "" : "No shift was stored, so Monday to Friday is used, the same default as payroll processing.", ruleRow.approvalStatus === "APPROVED" ? "" : "This calculation uses a sample rule. It is not verified for official filing."].filter(Boolean).join(" "),
    employee: { id: employee.id, fullName: employee.fullName, employeeCode: employee.employeeCode, basicSalary: employee.basicSalary, ptkp: employee.ptkp },
    period: { id: period.id, name: period.name },
    catalog: components.map((row) => ({ name: row.name, kind: row.kind, calc: row.calc, amount: row.amount })),
    input,
    result: calculatePay(input),
  };
}
