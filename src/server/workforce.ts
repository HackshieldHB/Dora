import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { activeDelegate, notify } from "@/lib/notify";
import { hasPerm, type Ctx } from "@/lib/context";
import { assertDecision } from "@/lib/decision";
import { lateMinutes, loanInstallment, offsiteClockError, rangesOverlap, resolveAssignee, scheduleActive, shiftCrossesMidnight, travelDateError, travelDayError, weekday } from "@/lib/domain";
import { todayJakarta } from "@/lib/format";
import { saveEmployeeFile } from "@/lib/files";
import { employeeWhere, requireCompany } from "./scope";
import { lockedPeriodForDate } from "./access";
import { queueLoanInstallment, recordAdjustment } from "./payroll";
import { commitApproval, planApproval, stageDecision } from "./workflow";

async function ownEmployee(ctx: Ctx) {
  if (!ctx.employeeId) throw new Error("Your user is not linked to an employee record.");
  const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId }, include: { department: true } });
  if (!employee || (employee.status !== "ACTIVE" && employee.status !== "PENDING OFFBOARDING")) throw new Error("ESS is available after the employee is active.");
  if (employee.lastWorkingDay && employee.lastWorkingDay < todayJakarta()) throw new Error("ESS access ended after the last working day.");
  return employee;
}

async function supervisor(employee: { managerId: string | null; companyId: string; fullName: string }, requesterId: string, module: string) {
  const manager = employee.managerId ? await prisma.user.findFirst({ where: { employeeId: employee.managerId, status: "ACTIVE" } }) : null;
  if (!manager) throw new Error("No active direct supervisor is available to receive this request.");
  const delegate = await activeDelegate(manager.id, module, employee.companyId);
  return { managerId: manager.id, assignee: resolveAssignee(manager.id, delegate, requesterId) };
}

export async function submitOffsite(ctx: Ctx, input: { workDate: string; kind: string; place: string; note: string; clockIn: string; clockOut: string }) {
  if (!hasPerm(ctx, "attendance.self")) throw new Error("You do not have permission to request attendance.");
  const employee = await ownEmployee(ctx);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) throw new Error("Choose a work date.");
  if (input.workDate > todayJakarta()) throw new Error("A date after today cannot be requested.");
  if (input.kind === "OFFICE") throw new Error("Office attendance uses clock-in and clock-out.");
  const kind = input.kind === "FIELD" ? "FIELD" : input.kind === "CLIENT" ? "CLIENT" : "";
  if (!kind) throw new Error("Choose a work location.");
  const place = input.place.trim();
  if (!place) throw new Error("Name the client site or the area outside the office.");
  const schedules = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id }, include: { shift: true } });
  const schedule = schedules.find((row) => row.dayOfWeek === weekday(input.workDate) && row.shift && scheduleActive(row, input.workDate));
  const crosses = Boolean(schedule?.shift?.crossesMidnight || (schedule?.shift && shiftCrossesMidnight(schedule.shift.startTime, schedule.shift.endTime)));
  const timeError = offsiteClockError(input.clockIn.trim(), input.clockOut.trim(), crosses);
  if (timeError) throw new Error(timeError);
  const open = await prisma.attendanceRequest.findFirst({
    where: { employeeId: employee.id, workDate: input.workDate, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (open) throw new Error("That date already has an offsite attendance request.");
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: input.workDate } } });
  if (existing && (existing.source === "CLOCK" || existing.source === "LEAVE" || existing.source === "CORRECTION")) {
    throw new Error("That date already has a clock-in, a correction, or approved leave.");
  }
  const plan = await planApproval({ companyId: employee.companyId, workflowKey: "OFFSITE", requesterId: ctx.userId, employeeId: employee.id, taskModule: "ATTENDANCE" });
  let managerId = "";
  let assignee = "";
  if (plan.mode === "fallback") {
    const supervisorChoice = await supervisor(employee, ctx.userId, "ATTENDANCE");
    managerId = supervisorChoice.managerId;
    assignee = supervisorChoice.assignee;
  }
  const request = await prisma.attendanceRequest.create({
    data: { companyId: employee.companyId, employeeId: employee.id, workDate: input.workDate, kind, place, note: input.note.trim(), clockInAt: input.clockIn.trim(), clockOutAt: input.clockOut.trim(), approverId: assignee },
  });
  const offsiteAssignees = await commitApproval({ plan, companyId: employee.companyId, workflowKey: "OFFSITE", taskModule: "ATTENDANCE", subjectId: request.id, requesterId: ctx.userId, employeeId: employee.id, title: `Offsite attendance: ${employee.fullName} ${input.workDate} at ${place}`, href: "/approvals/pending", fallbackAssigneeId: assignee, fallbackOriginalId: managerId });
  for (const approverId of offsiteAssignees) await notify(approverId, "Offsite attendance", `${employee.fullName} requested attendance at ${place}.`, "/approvals/pending");
  await audit(ctx, "attendance.offsite", "AttendanceRequest", request.id, input.workDate);
  return plan.mode === "workflow" ? "Offsite attendance request sent for approval." : "Offsite attendance request sent to your direct supervisor.";
}

export async function decideOffsite(ctx: Ctx, requestId: string, decision: "APPROVED" | "REJECTED" | "RETURNED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED", "RETURNED"]);
  const companyId = requireCompany(ctx);
  const request = await prisma.attendanceRequest.findFirst({ where: { id: requestId, companyId, status: "PENDING" }, include: { employee: true } });
  if (!request) throw new Error("The attendance request is not pending.");
  if (decision === "RETURNED" && request.kind !== "TRAVEL") throw new Error("Return for revision is only available for business travel.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "ATTENDANCE", subjectId: request.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act")) throw new Error("This attendance request is not assigned to you.");
  const stage = await stageDecision({ companyId, subjectId: request.id, taskId: task.id, actorId: ctx.userId, decision, note });
  if (stage === "next") {
    const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
    const moved = request.kind === "TRAVEL" ? "Business travel moved to the next approver" : "Offsite attendance moved to the next approver";
    if (owner) await notify(owner.id, moved, note || request.place, "/me/attendance");
    await audit(ctx, "attendance.offsite.decide", "AttendanceRequest", request.id, "NEXT");
    return;
  }
  if (decision === "APPROVED" && request.kind !== "TRAVEL") {
    const locked = await lockedPeriodForDate(companyId, request.workDate);
    if (locked) throw new Error("This date sits in a locked payroll period.");
    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: request.employeeId, workDate: request.workDate } } });
    if (existing && existing.source !== "OFFSITE") throw new Error("That date already has another attendance record.");
    const shiftName = request.kind === "FIELD" ? "Outside office" : request.kind === "OFFICE" ? "Office" : request.kind === "BACKDATE" ? "Missed clock-in" : "Client site";
    const schedules = request.kind === "BACKDATE"
      ? await prisma.employeeSchedule.findMany({ where: { employeeId: request.employeeId }, include: { shift: true } })
      : [];
    const schedule = schedules.find((row) => row.dayOfWeek === weekday(request.workDate) && row.shift && scheduleActive(row, request.workDate));
    const policy = request.kind === "BACKDATE" ? await prisma.attendancePolicy.findUnique({ where: { companyId } }) : null;
    const late = request.kind === "BACKDATE" && request.clockInAt && schedule?.shift ? lateMinutes(request.clockInAt, schedule.shift.startTime, policy?.graceMinutes ?? 0) : 0;
    const status = request.kind === "BACKDATE" ? (!request.clockOutAt ? "MISSING_CLOCK_OUT" : late > 0 ? "LATE" : "PRESENT") : "PRESENT";
    await prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: request.employeeId, workDate: request.workDate } },
      create: {
        companyId,
        employeeId: request.employeeId,
        workDate: request.workDate,
        shiftName: `${shiftName}: ${request.place}`,
        shiftStart: schedule?.shift?.startTime || "",
        shiftEnd: schedule?.shift?.endTime || "",
        clockInAt: request.clockInAt,
        clockOutAt: request.clockOutAt,
        status,
        lateMinutes: late,
        source: request.kind === "BACKDATE" ? "BACKDATE" : "OFFSITE",
      },
      update: {
        shiftName: `${shiftName}: ${request.place}`,
        clockInAt: request.clockInAt,
        clockOutAt: request.clockOutAt,
        status,
        lateMinutes: late,
        source: request.kind === "BACKDATE" ? "BACKDATE" : "OFFSITE",
      },
    });
  }
  await prisma.attendanceRequest.update({
    where: { id: request.id },
    data: { status: decision, decisionNote: note, approverId: ctx.userId },
  });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
  const travelTitle = decision === "APPROVED" ? "Business travel approved" : decision === "REJECTED" ? "Business travel rejected" : "Business travel returned";
  if (owner) await notify(owner.id, request.kind === "TRAVEL" ? travelTitle : `Offsite attendance ${decision.toLowerCase()}`, note || request.place, "/me/attendance");
  await audit(ctx, "attendance.offsite.decide", "AttendanceRequest", request.id, decision);
}

async function openTravel(employeeId: string, start: string, end: string, exceptId = "") {
  const rows = await prisma.attendanceRequest.findMany({
    where: { employeeId, kind: "TRAVEL", status: { in: ["PENDING", "APPROVED"] }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  return rows.find((row) => rangesOverlap(start, end, row.workDate, row.endDate || row.workDate));
}

export async function submitTravel(ctx: Ctx, input: { start: string; end: string; place: string; note: string; requestId: string }) {
  if (!hasPerm(ctx, "attendance.self")) throw new Error("You do not have permission to request attendance.");
  const employee = await ownEmployee(ctx);
  const dateError = travelDateError(input.start, input.end);
  if (dateError) throw new Error(dateError);
  const place = input.place.trim();
  if (!place) throw new Error("Enter the destination.");
  const clash = await openTravel(employee.id, input.start, input.end, input.requestId);
  if (clash) throw new Error("Those dates overlap a business trip that is still open.");
  const plan = await planApproval({ companyId: employee.companyId, workflowKey: "TRAVEL", requesterId: ctx.userId, employeeId: employee.id, taskModule: "ATTENDANCE" });
  let managerId = "";
  let assignee = "";
  if (plan.mode === "fallback") {
    const supervisorChoice = await supervisor(employee, ctx.userId, "ATTENDANCE");
    managerId = supervisorChoice.managerId;
    assignee = supervisorChoice.assignee;
  }
  const existing = input.requestId
    ? await prisma.attendanceRequest.findFirst({ where: { id: input.requestId, employeeId: employee.id, kind: "TRAVEL", status: { in: ["RETURNED", "APPROVED"] } } })
    : null;
  if (input.requestId && !existing) throw new Error("That business trip cannot be changed.");
  const request = existing
    ? await prisma.attendanceRequest.update({
      where: { id: existing.id },
      data: { workDate: input.start, endDate: input.end, place, note: input.note.trim(), status: "PENDING", decisionNote: "", approverId: assignee },
    })
    : await prisma.attendanceRequest.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        workDate: input.start,
        endDate: input.end,
        kind: "TRAVEL",
        place,
        note: input.note.trim(),
        approverId: assignee,
      },
    });
  const travelAssignees = await commitApproval({ plan, companyId: employee.companyId, workflowKey: "TRAVEL", taskModule: "ATTENDANCE", subjectId: request.id, requesterId: ctx.userId, employeeId: employee.id, title: `Business travel: ${employee.fullName} ${input.start} to ${input.end} at ${place}`, href: "/approvals/pending", fallbackAssigneeId: assignee, fallbackOriginalId: managerId });
  for (const approverId of travelAssignees) await notify(approverId, "Business travel", `${employee.fullName} requested business travel to ${place}.`, "/approvals/pending");
  await audit(ctx, existing ? "attendance.travel.revise" : "attendance.travel", "AttendanceRequest", request.id, `${input.start} ${input.end}`);
  if (existing?.status === "APPROVED") return "The date change was sent for approval. Saved attendance stays. Daily attendance pauses until it is approved.";
  return plan.mode === "workflow" ? "Business travel sent for approval." : "Business travel sent to your direct supervisor.";
}

export async function cancelTravel(ctx: Ctx, requestId: string) {
  const employee = await ownEmployee(ctx);
  const request = await prisma.attendanceRequest.findFirst({ where: { id: requestId, employeeId: employee.id, kind: "TRAVEL", status: { in: ["PENDING", "APPROVED", "RETURNED"] } } });
  if (!request) throw new Error("That business trip cannot be cancelled.");
  await prisma.attendanceRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", decisionNote: `Cancelled by ${ctx.fullName}`, approverId: ctx.userId },
  });
  await prisma.approvalTask.updateMany({ where: { subjectId: request.id, module: "ATTENDANCE", status: "PENDING" }, data: { status: "DONE" } });
  await audit(ctx, "attendance.travel.cancel", "AttendanceRequest", request.id, ctx.fullName);
  return "Business travel cancelled.";
}

export async function saveTravelDay(ctx: Ctx, input: { requestId: string; workDate: string; clockIn: string; clockOut: string; note: string }) {
  const employee = await ownEmployee(ctx);
  const request = await prisma.attendanceRequest.findFirst({ where: { id: input.requestId, employeeId: employee.id, kind: "TRAVEL", status: "APPROVED" } });
  if (!request) throw new Error("Business travel is not approved for that date.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate) || input.workDate < request.workDate || input.workDate > (request.endDate || request.workDate)) {
    throw new Error("That date is outside the approved business trip.");
  }
  if (input.workDate > todayJakarta()) throw new Error("A future date cannot be saved.");
  const timeError = travelDayError(input.clockIn.trim(), input.clockOut.trim());
  if (timeError) throw new Error(timeError);
  const locked = await lockedPeriodForDate(employee.companyId, input.workDate);
  if (locked) throw new Error("This date sits in a locked payroll period.");
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: input.workDate } } });
  if (existing?.source === "TRAVEL") throw new Error("That date already has business-travel attendance. Use attendance correction to change it.");
  if (existing) throw new Error("That date already has a clock-in, a correction, or approved leave.");
  await prisma.attendanceRecord.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      workDate: input.workDate,
      shiftName: `Business travel: ${request.place}`,
      clockInAt: input.clockIn.trim(),
      clockOutAt: input.clockOut.trim(),
      status: "PRESENT",
      source: "TRAVEL",
      requestId: request.id,
    },
  });
  await audit(ctx, "attendance.travel.day", "AttendanceRecord", request.id, `${input.workDate} ${input.clockIn.trim()} ${input.clockOut.trim()} ${input.note.trim()}`);
  return "Business travel attendance saved.";
}

export async function saveBenefits(ctx: Ctx, input: { bpjsHealthNo: string; bpjsTkNo: string; insuranceName: string; insuranceNo: string }) {
  const employee = await ownEmployee(ctx);
  const clip = (value: string) => value.trim().slice(0, 40);
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      bpjsHealthNo: clip(input.bpjsHealthNo),
      bpjsTkNo: clip(input.bpjsTkNo),
      insuranceName: clip(input.insuranceName),
      insuranceNo: clip(input.insuranceNo),
    },
  });
  await audit(ctx, "benefits.save", "Employee", employee.id, "membership numbers");
  return "Benefit details saved.";
}

export async function submitLoan(ctx: Ctx, input: { amount: number; tenor: number; reason: string }) {
  if (!hasPerm(ctx, "payroll.self")) throw new Error("You do not have permission to request a loan.");
  const employee = await ownEmployee(ctx);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Enter the loan amount in whole rupiah.");
  if (!Number.isInteger(input.tenor) || input.tenor < 1 || input.tenor > 24) throw new Error("Choose a tenor from 1 to 24 months.");
  if (!input.reason.trim()) throw new Error("A reason is required.");
  if (employee.basicSalary <= 0) throw new Error("A loan needs a basic salary on the employee record.");
  const cap = employee.basicSalary * 3;
  if (input.amount > cap) throw new Error("The loan cannot exceed three months of basic salary.");
  const open = await prisma.employeeLoan.findFirst({ where: { employeeId: employee.id, status: { in: ["PENDING", "ACTIVE"] } } });
  if (open) throw new Error("You already have an open loan.");
  const installment = loanInstallment(input.amount, input.tenor);
  const { managerId, assignee } = await supervisor(employee, ctx.userId, "LOAN");
  const loan = await prisma.employeeLoan.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      amount: input.amount,
      tenor: input.tenor,
      installment,
      remaining: input.amount,
      reason: input.reason.trim(),
      approverId: assignee,
    },
  });
  await prisma.approvalTask.create({
    data: {
      companyId: employee.companyId,
      module: "LOAN",
      subjectId: loan.id,
      assigneeId: assignee,
      originalAssigneeId: managerId,
      requesterId: ctx.userId,
      title: `Loan: ${employee.fullName} ${input.amount}`,
      href: "/approvals/pending",
    },
  });
  await notify(assignee, "Employee loan", `${employee.fullName} requested a loan.`, "/approvals/pending");
  await audit(ctx, "loan.submit", "EmployeeLoan", loan.id, String(input.amount));
  return "Loan request sent to your direct supervisor.";
}

export async function decideLoan(ctx: Ctx, loanId: string, decision: "APPROVED" | "REJECTED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED"]);
  const companyId = requireCompany(ctx);
  const loan = await prisma.employeeLoan.findFirst({ where: { id: loanId, companyId, status: "PENDING" } });
  if (!loan) throw new Error("The loan request is not pending.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "LOAN", subjectId: loan.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act")) throw new Error("This loan is not assigned to you.");
  await prisma.employeeLoan.update({
    where: { id: loan.id },
    data: {
      status: decision === "APPROVED" ? "ACTIVE" : "REJECTED",
      decisionNote: note,
      approverId: ctx.userId,
      remaining: loan.amount,
      startMonth: decision === "APPROVED" ? todayJakarta().slice(0, 7) : "",
    },
  });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  const owner = await prisma.user.findFirst({ where: { employeeId: loan.employeeId } });
  if (owner) await notify(owner.id, `Loan ${decision.toLowerCase()}`, note || "Employee loan", "/me/benefits");
  await audit(ctx, "loan.decide", "EmployeeLoan", loan.id, decision);
}

export async function submitClaim(ctx: Ctx, input: { kind: string; amount: number; expenseDate: string; note: string; file: File }) {
  if (!hasPerm(ctx, "payroll.self")) throw new Error("You do not have permission to submit a claim.");
  const employee = await ownEmployee(ctx);
  const kind = input.kind === "HEALTH" ? "HEALTH" : input.kind === "TRANSPORT" ? "TRANSPORT" : "";
  if (!kind) throw new Error("Choose transport or health.");
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 2_000_000_000) throw new Error("Enter the claim amount in rupiah.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) || input.expenseDate > todayJakarta()) throw new Error("The expense date cannot be after today.");
  if (!input.note.trim()) throw new Error("Describe the expense.");
  const fileId = await saveEmployeeFile({ companyId: employee.companyId, employeeId: employee.id, file: input.file });
  const { managerId, assignee } = await supervisor(employee, ctx.userId, "REIMBURSEMENT");
  const claim = await prisma.reimbursement.create({
    data: { companyId: employee.companyId, employeeId: employee.id, kind, amount: input.amount, expenseDate: input.expenseDate, note: input.note.trim().slice(0, 200), fileId, approverId: assignee },
  });
  await prisma.approvalTask.create({
    data: {
      companyId: employee.companyId,
      module: "REIMBURSEMENT",
      subjectId: claim.id,
      assigneeId: assignee,
      originalAssigneeId: managerId,
      requesterId: ctx.userId,
      title: `${kind === "HEALTH" ? "Health" : "Transport"} claim: ${employee.fullName} ${input.expenseDate}`,
      href: "/approvals/pending",
    },
  });
  await notify(assignee, "Reimbursement", `${employee.fullName} submitted a ${kind === "HEALTH" ? "health" : "transport"} claim.`, "/approvals/pending");
  await audit(ctx, "claim.submit", "Reimbursement", claim.id, String(input.amount));
  return "Claim sent to your direct supervisor.";
}

export async function postClaim(ctx: Ctx, claimId: string, periodId = "") {
  const companyId = requireCompany(ctx);
  const claim = await prisma.reimbursement.findFirst({ where: { id: claimId, companyId, status: "APPROVED" }, include: { employee: true } });
  if (!claim) throw new Error("That claim is not waiting to be posted.");
  const period = periodId
    ? await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId, status: { in: ["DRAFT", "PROCESSED"] } } })
    : await prisma.payrollPeriod.findFirst({
      where: { companyId, status: { in: ["DRAFT", "PROCESSED"] }, startDate: { lte: claim.expenseDate }, endDate: { gte: claim.expenseDate } },
      orderBy: { startDate: "desc" },
    }) ?? await prisma.payrollPeriod.findFirst({ where: { companyId, status: { in: ["DRAFT", "PROCESSED"] } }, orderBy: { startDate: "desc" } });
  if (!period) throw new Error("There is no draft payroll period to receive this claim.");
  const name = claim.kind === "HEALTH" ? "Health reimbursement" : "Transport reimbursement";
  await recordAdjustment(ctx, { periodId: period.id, employeeId: claim.employeeId, name, kind: "EARNING", amount: claim.amount, reason: `${claim.note} · ${claim.expenseDate}` });
  await prisma.reimbursement.update({ where: { id: claim.id }, data: { status: "POSTED", periodId: period.id } });
  await audit(ctx, "claim.post", "Reimbursement", claim.id, period.id);
  return `Added to ${period.name}. Recalculate that period. The pay formula is unchanged.`;
}

export async function decideClaim(ctx: Ctx, claimId: string, decision: "APPROVED" | "REJECTED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED"]);
  const companyId = requireCompany(ctx);
  const claim = await prisma.reimbursement.findFirst({ where: { id: claimId, companyId, status: "PENDING" } });
  if (!claim) throw new Error("The claim is not pending.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "REIMBURSEMENT", subjectId: claim.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act")) throw new Error("This claim is not assigned to you.");
  await prisma.reimbursement.update({ where: { id: claim.id }, data: { status: decision, decisionNote: note, approverId: ctx.userId } });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  let message = decision === "APPROVED" ? "Claim approved." : "Claim rejected.";
  if (decision === "APPROVED") {
    try {
      message = await postClaim(ctx, claim.id);
    } catch (error) {
      message = error instanceof Error ? `Claim approved. ${error.message}` : "Claim approved. Payroll can post it into a draft period.";
    }
  }
  const owner = await prisma.user.findFirst({ where: { employeeId: claim.employeeId } });
  if (owner) await notify(owner.id, `Reimbursement ${decision.toLowerCase()}`, note || message, "/me/benefits");
  await audit(ctx, "claim.decide", "Reimbursement", claim.id, decision);
  return message;
}

export async function postLoanInstallment(ctx: Ctx, loanId: string, periodId: string) {
  await queueLoanInstallment(ctx, loanId, periodId);
  return "Installment added. Recalculate the payroll period before approval. The balance changes only after the payroll is locked.";
}

async function canTouchGoal(ctx: Ctx, goal: { employeeId: string; departmentId: string }) {
  if (goal.employeeId === ctx.employeeId) return;
  if (hasPerm(ctx, "employees.manage")) return;
  if (!ctx.employeeId) throw new Error("You cannot update this goal.");
  const owner = await prisma.employee.findFirst({ where: { id: goal.employeeId, managerId: ctx.employeeId } });
  if (!owner) throw new Error("You cannot update this goal.");
}

export async function createGoal(ctx: Ctx, input: { employeeId: string; team: boolean; title: string; metric: string; unit: string; target: number; startDate: string; endDate: string; weight?: number; direction?: string; submit?: boolean }) {
  const employee = await ownEmployee(ctx);
  const title = input.title.trim();
  const metric = input.metric.trim();
  if (!title || !metric) throw new Error("A goal needs a title and what is being measured.");
  if (!Number.isFinite(input.target) || input.target <= 0) throw new Error("The target must be greater than zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) {
    throw new Error("Choose a start date and an end date.");
  }
  let employeeId = employee.id;
  let departmentId = "";
  let assignedById = "";
  let status = "DRAFT";
  let approvalStatus = "";
  let weight = 0;
  let direction = "HIGHER";
  if (input.team) {
    if (!employee.departmentId) throw new Error("A team goal needs your department.");
    const reports = await prisma.employee.count({ where: { managerId: employee.id, departmentId: employee.departmentId } });
    if (reports === 0 && !hasPerm(ctx, "employees.manage")) throw new Error("A team goal is created by the department manager.");
    departmentId = employee.departmentId;
    assignedById = employee.id;
    status = "OPEN";
  } else if (input.employeeId && input.employeeId !== employee.id) {
    const report = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId: employee.companyId, managerId: employee.id, status: "ACTIVE" } });
    if (!report) throw new Error("You can assign a KPI only to someone who reports to you.");
    if (employee.departmentId && report.departmentId !== employee.departmentId) throw new Error("You can assign a KPI only to someone in your division.");
    if (!Number.isInteger(input.weight) || (input.weight ?? 0) < 1 || (input.weight ?? 0) > 100) throw new Error("KPI weight must be a whole number from 1 to 100.");
    direction = input.direction === "LOWER" || input.direction === "MILESTONE" ? input.direction : "HIGHER";
    employeeId = report.id;
    assignedById = employee.id;
    approvalStatus = "DRAFT";
    weight = input.weight ?? 0;
    status = "DRAFT";
  }
  const goal = await prisma.goal.create({
    data: {
      companyId: employee.companyId,
      employeeId,
      departmentId,
      assignedById,
      title,
      metric,
      unit: input.unit.trim().slice(0, 20),
      target: input.target,
      startDate: input.startDate,
      endDate: input.endDate,
      status,
      approvalStatus,
      weight,
      direction,
    },
  });
  await audit(ctx, "goal.create", "Goal", goal.id, title);
  if (approvalStatus === "DRAFT" && input.submit) return submitKpi(ctx, goal.id);
  return approvalStatus ? "KPI saved as a draft." : "Goal saved as a draft. Submit it when the wording is final.";
}

async function kpiApprover(ctx: Ctx, makerId: string) {
  const maker = await prisma.employee.findFirst({ where: { id: makerId, companyId: requireCompany(ctx) } });
  if (!maker?.managerId) throw new Error("Submit for approval needs a direct supervisor on your employee record.");
  const boss = await prisma.user.findFirst({ where: { employeeId: maker.managerId, companyId: maker.companyId, status: "ACTIVE" }, include: { role: true, employee: true } });
  if (!boss) throw new Error("No active direct supervisor is available to approve this KPI.");
  if (boss.id === ctx.userId) throw new Error("You cannot approve your own KPI.");
  const permissions = JSON.parse(boss.role.permissions) as string[];
  if (!permissions.includes("approvals.act")) throw new Error("The direct supervisor does not have permission to approve a KPI. A company admin can grant Approve requests on that role.");
  return boss;
}

export async function submitKpi(ctx: Ctx, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId: requireCompany(ctx), assignedById: ctx.employeeId || "", approvalStatus: { in: ["DRAFT", "RETURNED"] } } });
  if (!goal) throw new Error("Only your draft KPI can be submitted.");
  const boss = await kpiApprover(ctx, goal.assignedById);
  await prisma.goal.update({ where: { id: goal.id }, data: { approvalStatus: "PENDING", approverId: boss.id, decisionNote: "" } });
  await prisma.approvalTask.create({
    data: { companyId: goal.companyId, module: "KPI", subjectId: goal.id, assigneeId: boss.id, originalAssigneeId: boss.id, requesterId: ctx.userId, title: `KPI: ${goal.title}`, href: "/approvals/pending" },
  });
  await notify(boss.id, "KPI waiting for approval", goal.title, "/approvals/pending");
  await audit(ctx, "goal.submit", "Goal", goal.id, "PENDING");
  return `KPI sent to ${boss.employee?.fullName || "your direct supervisor"}.`;
}

export async function decideKpi(ctx: Ctx, goalId: string, decision: "APPROVED" | "REJECTED" | "RETURNED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED", "RETURNED"]);
  if (decision !== "APPROVED" && !note.trim()) throw new Error("A return or rejection needs a reason.");
  const companyId = requireCompany(ctx);
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId, approvalStatus: "PENDING" } });
  if (!goal) throw new Error("This KPI is not waiting for approval.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "KPI", subjectId: goal.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act") || goal.approverId !== ctx.userId) throw new Error("This KPI is not assigned to you.");
  if (goal.assignedById === ctx.employeeId) throw new Error("You cannot approve your own KPI.");
  const approvalStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "RETURNED";
  await prisma.goal.update({
    where: { id: goal.id },
    data: { approvalStatus, decisionNote: note, status: decision === "APPROVED" ? "OPEN" : "DRAFT", evalStatus: decision === "APPROVED" ? "IN_PROGRESS" : "" },
  });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  const owner = await prisma.user.findFirst({ where: { employeeId: goal.assignedById } });
  if (owner) await notify(owner.id, `KPI ${approvalStatus.toLowerCase()}`, note || goal.title, "/goals");
  await audit(ctx, "goal.decide", "Goal", goal.id, decision);
  return "KPI decision saved.";
}

export async function reviewKpi(ctx: Ctx, goalId: string, input: { decision: "ACCEPT" | "RETURNED"; score?: number; feedback?: string; note: string }) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId: requireCompany(ctx), assignedById: ctx.employeeId || "", approvalStatus: "APPROVED", evalStatus: "SUBMITTED" } });
  if (!goal) throw new Error("This KPI is not waiting for your review.");
  if (input.decision === "RETURNED") {
    if (!input.note.trim()) throw new Error("A return for revision needs a reason.");
    await prisma.goal.update({ where: { id: goal.id }, data: { evalStatus: "RETURNED", decisionNote: input.note.trim() } });
    const owner = await prisma.user.findFirst({ where: { employeeId: goal.employeeId } });
    if (owner) await notify(owner.id, "KPI returned", input.note, "/me/goals?tab=assigned");
    return "Realization returned to the employee.";
  }
  if (!Number.isInteger(input.score) || (input.score ?? 0) < 0 || (input.score ?? 0) > 100) throw new Error("The score must be a whole number from 0 to 100.");
  const boss = await kpiApprover(ctx, goal.assignedById);
  await prisma.goal.update({ where: { id: goal.id }, data: { evalStatus: "PENDING_FINAL", score: input.score ?? 0, feedback: (input.feedback || "").trim().slice(0, 500), approverId: boss.id } });
  await prisma.approvalTask.create({
    data: { companyId: goal.companyId, module: "KPI_EVAL", subjectId: goal.id, assigneeId: boss.id, originalAssigneeId: boss.id, requesterId: ctx.userId, title: `KPI evaluation: ${goal.title}`, href: "/approvals/pending" },
  });
  await notify(boss.id, "KPI evaluation waiting for approval", goal.title, "/approvals/pending");
  await audit(ctx, "goal.review", "Goal", goal.id, String(input.score));
  return "Evaluation sent to your direct supervisor.";
}

export async function decideKpiEval(ctx: Ctx, goalId: string, decision: "APPROVED" | "REJECTED" | "RETURNED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED", "RETURNED"]);
  if (decision !== "APPROVED" && !note.trim()) throw new Error("A return or rejection needs a reason.");
  const companyId = requireCompany(ctx);
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId, evalStatus: "PENDING_FINAL" } });
  if (!goal) throw new Error("This evaluation is not waiting for approval.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "KPI_EVAL", subjectId: goal.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act") || goal.approverId !== ctx.userId) throw new Error("This evaluation is not assigned to you.");
  const evalStatus = decision === "APPROVED" ? "FINALIZED" : decision === "REJECTED" ? "REJECTED" : "SUBMITTED";
  await prisma.goal.update({ where: { id: goal.id }, data: { evalStatus, decisionNote: note } });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  const notifyEmployee = decision !== "RETURNED";
  const recipient = await prisma.user.findFirst({ where: { employeeId: notifyEmployee ? goal.employeeId : goal.assignedById, status: "ACTIVE" } });
  if (recipient) await notify(recipient.id, `KPI evaluation ${decision.toLowerCase()}`, note || goal.title, notifyEmployee ? "/me/goals?tab=assigned" : "/goals");
  await audit(ctx, "goal.finalize", "Goal", goal.id, decision);
  return "Evaluation decision saved.";
}

export async function reviseGoal(ctx: Ctx, goalId: string, input: { title: string; metric: string; unit: string; target: number; startDate: string; endDate: string }) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId: requireCompany(ctx) } });
  if (!goal || goal.status !== "DRAFT" || goal.employeeId !== ctx.employeeId || goal.approvalStatus) throw new Error("Only your own draft can be edited.");
  if (!input.title.trim() || !input.metric.trim()) throw new Error("A goal needs a title and what is being measured.");
  if (!Number.isFinite(input.target) || input.target <= 0) throw new Error("The target must be greater than zero.");
  if (input.endDate < input.startDate) throw new Error("Choose a start date and an end date.");
  await prisma.goal.update({
    where: { id: goal.id },
    data: { title: input.title.trim(), metric: input.metric.trim(), unit: input.unit.trim().slice(0, 20), target: input.target, startDate: input.startDate, endDate: input.endDate },
  });
  await audit(ctx, "goal.revise", "Goal", goal.id, input.title.trim());
  return "Draft updated.";
}

export async function submitGoal(ctx: Ctx, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId: requireCompany(ctx), employeeId: ctx.employeeId || "", status: "DRAFT" } });
  if (!goal || goal.approvalStatus) throw new Error("Only your own draft can be submitted.");
  await prisma.goal.update({ where: { id: goal.id }, data: { status: "OPEN" } });
  await audit(ctx, "goal.submit", "Goal", goal.id, goal.title);
  return "Goal submitted. The wording is now locked. You can still change the target and the progress.";
}

export async function updateGoal(ctx: Ctx, goalId: string, input: { current: number; target?: number; status: string; note?: string; submit?: boolean }) {
  const companyId = requireCompany(ctx);
  const goal = await prisma.goal.findFirst({ where: { id: goalId, companyId } });
  if (!goal) throw new Error("Goal not found.");
  if (goal.approvalStatus && goal.approvalStatus !== "APPROVED") throw new Error("This KPI is not active yet.");
  if (goal.evalStatus === "FINALIZED" || goal.evalStatus === "PENDING_FINAL" || goal.evalStatus === "SUBMITTED") throw new Error("This KPI is locked while it is in review.");
  if (goal.status === "DRAFT") throw new Error("Submit the goal before updating progress.");
  await canTouchGoal(ctx, goal);
  if (!Number.isFinite(input.current) || input.current < 0) throw new Error("Progress cannot be negative.");
  const assignedToMe = Boolean(goal.assignedById) && goal.employeeId === ctx.employeeId && goal.assignedById !== ctx.employeeId;
  const mine = goal.employeeId === ctx.employeeId && !assignedToMe;
  const manager = goal.assignedById === ctx.employeeId || hasPerm(ctx, "employees.manage");
  if (input.status === "CANCELLED" && !manager && !mine) throw new Error("You cannot cancel this goal.");
  const status = input.status === "DONE" || input.status === "CANCELLED" ? input.status : goal.status;
  const data: { current: number; status: string; target?: number; progressNote?: string; evalStatus?: string } = { current: input.current, status };
  if (input.note !== undefined) data.progressNote = input.note.trim().slice(0, 500);
  if (goal.approvalStatus === "APPROVED") {
    if (input.target !== undefined && input.target !== goal.target) throw new Error("An approved KPI target cannot be changed here.");
    if (input.submit) {
      data.evalStatus = "SUBMITTED";
      data.status = goal.status;
    }
  } else if (input.target !== undefined) {
    if (!mine && !manager) throw new Error("Only the owner or the assigning manager can change the target.");
    if (!Number.isFinite(input.target) || input.target <= 0) throw new Error("The target must be greater than zero.");
    data.target = input.target;
  }
  await prisma.goal.update({ where: { id: goal.id }, data });
  if (input.submit && goal.approvalStatus === "APPROVED") {
    const manager = await prisma.user.findFirst({ where: { employeeId: goal.assignedById, status: "ACTIVE" } });
    if (manager) await notify(manager.id, "KPI realization submitted", goal.title, "/goals");
  }
  await audit(ctx, "goal.update", "Goal", goal.id, String(input.current));
  return input.submit ? "Realization submitted to your manager." : "Goal updated.";
}
