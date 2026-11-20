import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { activeDelegate, notify } from "@/lib/notify";
import { saveEmployeeFile } from "@/lib/files";
import { hasPerm, type Ctx } from "@/lib/context";
import { assertDecision } from "@/lib/decision";
import {
  addDays,
  attendanceCorrectionAllowed,
  compensationAmount,
  locationCheck,
  overtimeWithinSubmitWindow,
  clockOutIsEarly,
  calendarDays,
  cappedLeaveAllowance,
  cappedLeaveRemaining,
  countLeaveDays,
  distanceMeters,
  outsideWorkplace,
  eachDate,
  halfDayTimeError,
  lateMinutes,
  leaveCancelMode,
  leaveRemaining,
  carryIn,
  policyEntitled,
  rangesOverlap,
  scheduleActive,
  serviceMonths,
  validOvertimeMinutes,
  weekday,
} from "@/lib/domain";
import { todayJakarta, timeJakarta, yearOf } from "@/lib/format";
import { employeeWhere, requireCompany } from "./scope";
import { lockedPeriodForDate } from "./access";
import { recordAdjustment } from "./payroll";
import { resolveAssignee } from "@/lib/domain";
import { commitApproval, planApproval, stageDecision } from "./workflow";

async function ownEmployee(ctx: Ctx) {
  if (!ctx.employeeId) throw new Error("Your user is not linked to an employee record.");
  const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
  if (!employee || (employee.status !== "ACTIVE" && employee.status !== "PENDING OFFBOARDING")) throw new Error("ESS is available after the employee is active.");
  if (employee.lastWorkingDay && employee.lastWorkingDay < todayJakarta()) throw new Error("ESS access ended after the last working day.");
  return employee;
}

function workdaysOn(schedules: { dayOfWeek: number; shiftId: string | null; effectiveStart: string; effectiveEnd: string }[], date: string): number[] {
  if (schedules.length === 0) return [1, 2, 3, 4, 5];
  return schedules.filter((row) => row.shiftId && scheduleActive(row, date)).map((row) => row.dayOfWeek);
}

async function assertAtWorkplace(locationId: string, lat: number, lng: number, direction: "in" | "out") {
  if (!locationId) return;
  const place = await prisma.workLocation.findUnique({ where: { id: locationId } });
  if (place?.lat == null || place.lng == null || place.radiusMeters <= 0) return;
  const away = distanceMeters(lat, lng, place.lat, place.lng);
  if (!outsideWorkplace(away, place.radiusMeters)) return;
  const saved = direction === "in" ? "this clock-in was not saved" : "this clock-out was not saved";
  throw new Error(`You are ${Math.round(away)} m from ${place.name}. The office radius is ${place.radiusMeters} m, so ${saved}. Use Where you worked for a client site or outside the office.`);
}

async function recordLocationCheck(locationId: string, lat: number, lng: number, accuracy: number | null) {
  const place = locationId ? await prisma.workLocation.findUnique({ where: { id: locationId } }) : null;
  const distance = place?.lat != null && place.lng != null ? distanceMeters(lat, lng, place.lat, place.lng) : null;
  return locationCheck({ lat, lng, accuracy, distanceMeters: distance, radiusMeters: place?.radiusMeters ?? 0 });
}

export async function clock(ctx: Ctx, direction: "in" | "out", input: { lat: number; lng: number; accuracy: number | null; photo: File }) {
  if (!hasPerm(ctx, "attendance.self")) throw new Error("You do not have permission to clock attendance.");
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || input.photo.size === 0) {
    throw new Error("GPS and a photo are required. The attendance record was not saved.");
  }
  const employee = await ownEmployee(ctx);
  const companyId = employee.companyId;
  const today = todayJakarta();
  const yesterday = addDays(today, -1);
  const time = timeJakarta();
  const policy = await prisma.attendancePolicy.findUnique({ where: { companyId } });
  const schedules = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id }, include: { shift: true } });
  const open = await prisma.attendanceRecord.findFirst({
    where: { employeeId: employee.id, clockInAt: { not: "" }, clockOutAt: "", workDate: { in: [today, yesterday] } },
  });
  if (direction === "in") {
    if (open) throw new Error("You already have an open clock-in.");
    const existingToday = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: today } } });
    if (existingToday?.source === "LEAVE") throw new Error("This date is approved leave. Clock-in was not saved.");
    if (existingToday?.clockInAt) throw new Error("You already clocked in today. A second clock-in on the same day was not saved.");
    const swap = await prisma.shiftSwap.findFirst({
      where: { status: "APPROVED", workDate: today, OR: [{ requesterId: employee.id }, { counterpartId: employee.id }] },
    });
    const swapped = swap
      ? await prisma.shift.findUnique({ where: { id: swap.requesterId === employee.id ? swap.counterpartShiftId : swap.requesterShiftId } })
      : null;
    const schedule = schedules.find((row) => row.dayOfWeek === weekday(today) && row.shift && scheduleActive(row, today));
    const shift = swapped || schedule?.shift;
    if (!shift) throw new Error("There is no working shift for today.");
    await assertAtWorkplace(employee.locationId || "", input.lat, input.lng, "in");
    const inCheck = await recordLocationCheck(employee.locationId || "", input.lat, input.lng, input.accuracy);
    const photoId = await saveEmployeeFile({ companyId, employeeId: employee.id, file: input.photo });
    const late = lateMinutes(time, shift.startTime, policy?.graceMinutes ?? 0);
    await prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: employee.id, workDate: today } },
      create: {
        companyId,
        employeeId: employee.id,
        workDate: today,
        shiftName: shift.name,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        clockInAt: time,
        inLat: input.lat,
        inLng: input.lng,
        inPhotoId: photoId,
        inAccuracy: input.accuracy,
        inLocationCheck: inCheck,
        status: late > 0 ? "LATE" : "PRESENT",
        lateMinutes: late,
        source: "CLOCK",
      },
      update: {
        shiftName: shift.name,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        clockInAt: time,
        inLat: input.lat,
        inLng: input.lng,
        inPhotoId: photoId,
        inAccuracy: input.accuracy,
        inLocationCheck: inCheck,
        status: late > 0 ? "LATE" : "PRESENT",
        lateMinutes: late,
        source: "CLOCK",
      },
    });
    await refreshOvertimeForDate(employee.id, today);
    await audit(ctx, "attendance.clock-in", "Attendance", employee.id, today);
    return "Clock in recorded.";
  }
  if (!open) throw new Error("There is no open clock-in to close.");
  await assertAtWorkplace(employee.locationId || "", input.lat, input.lng, "out");
  const outCheck = await recordLocationCheck(employee.locationId || "", input.lat, input.lng, input.accuracy);
  const photoId = await saveEmployeeFile({ companyId, employeeId: employee.id, file: input.photo });
  const leave = await prisma.leaveRequest.findFirst({
    where: { employeeId: employee.id, status: "APPROVED", halfDay: true, startDate: open.workDate },
  });
  const early = open.shiftStart && open.shiftEnd
    ? clockOutIsEarly({
      clockOut: time,
      shiftStart: open.shiftStart,
      shiftEnd: open.shiftEnd,
      crosses: open.shiftEnd < open.shiftStart,
      leaveStart: leave?.halfStart,
      leaveEnd: leave?.halfEnd,
    })
    : false;
  await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: {
      clockOutAt: time,
      outLat: input.lat,
      outLng: input.lng,
      outPhotoId: photoId,
      outAccuracy: input.accuracy,
      outLocationCheck: outCheck,
      status: early && open.status === "PRESENT" ? "EARLY" : open.status,
    },
  });
  await refreshOvertimeForDate(employee.id, open.workDate);
  await audit(ctx, "attendance.clock-out", "Attendance", employee.id, open.workDate);
  return "Clock out recorded.";
}

export async function correctAttendance(ctx: Ctx, recordId: string, input: { clockInAt: string; clockOutAt: string; reason: string }) {
  if (!hasPerm(ctx, "attendance.correct")) throw new Error("Only authorized HR can correct attendance.");
  if (!input.reason.trim()) throw new Error("A correction reason is required.");
  const companyId = requireCompany(ctx);
  const record = await prisma.attendanceRecord.findFirst({
    where: { id: recordId, companyId, employee: employeeWhere(ctx) },
  });
  if (!record) throw new Error("Attendance record not found.");
  const locked = await lockedPeriodForDate(companyId, record.workDate);
  if (!attendanceCorrectionAllowed(locked ? "LOCKED" : null)) {
    throw new Error("This date sits in a locked payroll period. Use a controlled payroll adjustment instead of changing the final result.");
  }
  const before = { clockInAt: record.clockInAt, clockOutAt: record.clockOutAt, status: record.status, lateMinutes: record.lateMinutes };
  const policy = await prisma.attendancePolicy.findUnique({ where: { companyId } });
  const late = input.clockInAt && record.shiftStart ? lateMinutes(input.clockInAt, record.shiftStart, policy?.graceMinutes ?? 0) : 0;
  const status = !input.clockOutAt ? "MISSING_CLOCK_OUT" : late > 0 ? "LATE" : "PRESENT";
  const after = { clockInAt: input.clockInAt, clockOutAt: input.clockOutAt, status, lateMinutes: late };
  await prisma.attendanceRecord.update({ where: { id: record.id }, data: { ...after, source: "CORRECTION" } });
  await prisma.attendanceCorrection.create({
    data: { recordId: record.id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), reason: input.reason, actorId: ctx.userId },
  });
  await refreshOvertimeForDate(record.employeeId, record.workDate);
  await audit(ctx, "attendance.correct", "Attendance", record.id, input.reason);
}

export async function refreshOvertimeForDate(employeeId: string, workDate: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return;
  const policy = await prisma.overtimePolicy.findUnique({ where: { companyId: employee.companyId } });
  const attendance = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate } } });
  const requests = await prisma.overtimeRequest.findMany({ where: { employeeId, workDate, status: "APPROVED" } });
  for (const request of requests) {
    if (request.payrollPeriodId) {
      const period = await prisma.payrollPeriod.findUnique({ where: { id: request.payrollPeriodId } });
      if (period?.status === "LOCKED") continue;
    }
    const result = validOvertimeMinutes({
      requestStart: request.startTime,
      requestEnd: request.endTime,
      shiftStart: attendance?.shiftStart || "08:00",
      shiftEnd: attendance?.shiftEnd || "17:00",
      clockIn: attendance?.clockInAt || "",
      clockOut: attendance?.clockOutAt || "",
      allowBefore: policy?.allowBefore ?? false,
      allowAfter: policy?.allowAfter ?? true,
      roundingMinutes: policy?.roundingMinutes ?? 1,
      maxHoursPerDay: policy?.maxHoursPerDay ?? 0,
    });
    await prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        validMinutes: result.minutes,
        compensationIdr: compensationAmount({ validMinutes: result.minutes, basicSalary: employee.basicSalary, hourlyDivisor: policy?.hourlyDivisor ?? 173, multiplier: policy?.multiplier ?? 1.5, payMethod: policy?.payMethod, fixedHourlyRate: policy?.fixedHourlyRate }),
        compensationStatus: result.status,
        reviewNote: result.reason,
        reviewedBy: "",
      },
    });
  }
}

export async function submitLeave(ctx: Ctx, input: { leaveTypeId: string; startDate: string; endDate: string; halfDay: boolean; halfStart?: string; halfEnd?: string; reason: string; attachment: File | null; cover: "yes" | "no"; coverId?: string; existingId?: string }) {
  if (!hasPerm(ctx, "leave.self")) throw new Error("You do not have permission to request leave.");
  const employee = await ownEmployee(ctx);
  const type = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, companyId: employee.companyId } });
  if (!type) throw new Error("Leave type not found.");
  if (input.halfDay && !type.allowHalfDay) throw new Error("This leave type does not allow a half day.");
  if (type.requiresReason && !input.reason.trim()) throw new Error("A reason is required for this leave.");
  const prior = input.existingId
    ? await prisma.leaveRequest.findFirst({ where: { id: input.existingId, employeeId: employee.id, status: "RETURNED" } })
    : null;
  if (input.existingId && !prior) throw new Error("Only a returned request can be submitted again.");
  if (type.requiresAttachment && !(input.attachment && input.attachment.size > 0) && !prior?.attachmentId) throw new Error("This leave needs an attachment.");
  if (type.maxCalendarDays > 0 && calendarDays(input.startDate, input.endDate) > type.maxCalendarDays) {
    throw new Error(`This leave cannot cover more than ${type.maxCalendarDays} calendar days.`);
  }
  if (type.minServiceMonths > 0 && employee.joinDate && serviceMonths(employee.joinDate, input.startDate) < type.minServiceMonths) {
    throw new Error(`This leave is available after ${type.minServiceMonths} continuous months of service.`);
  }
  const schedules = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id }, include: { shift: true } });
  const holidays = (await prisma.holiday.findMany({ where: { companyId: employee.companyId } })).map((row) => row.date);
  const halfStart = input.halfDay ? input.halfStart || "" : "";
  const halfEnd = input.halfDay ? input.halfEnd || "" : "";
  if (input.halfDay) {
    if (input.startDate !== input.endDate) throw new Error("A half day must start and end on the same date.");
    const schedule = schedules.find((row) => row.dayOfWeek === weekday(input.startDate) && row.shift && scheduleActive(row, input.startDate));
    if (!schedule?.shift) throw new Error("There is no working shift on that date.");
    const timeError = halfDayTimeError({ start: halfStart, end: halfEnd, shiftStart: schedule.shift.startTime, shiftEnd: schedule.shift.endTime, crosses: schedule.shift.crossesMidnight });
    if (timeError) throw new Error(timeError);
  }
  const days = countLeaveDays({ start: input.startDate, end: input.endDate, halfDay: input.halfDay, workdays: workdaysOn(schedules, input.startDate), holidays });
  if (days <= 0) throw new Error("The selected dates do not contain a working day.");
  if (type.balanceMode === "NONE" && type.quotaDays > 0 && days > type.quotaDays) {
    throw new Error(`This leave allows at most ${type.quotaDays} working days in one request.`);
  }
  const eventCap = cappedLeaveAllowance(type);
  if (eventCap && days > await eventRemaining(employee.id, type.id, eventCap.entitled)) {
    throw new Error("The available balance is not enough for this request.");
  }
  const existing = await prisma.leaveRequest.findMany({
    where: { employeeId: employee.id, status: { in: ["PENDING", "APPROVED", "CANCEL_PENDING"] } },
  });
  if (existing.some((row) => rangesOverlap(row.startDate, row.endDate, input.startDate, input.endDate))) {
    throw new Error("Those dates overlap another open leave request.");
  }
  const year = yearOf(input.startDate);
  if (type.balanceMode !== "NONE") {
    const entitled = policyEntitled({ mode: type.balanceMode, quotaDays: type.quotaDays, quotaPeriod: type.quotaPeriod, accrualRate: type.accrualRate, asOf: input.startDate });
    const balance = await ensureBalance(employee.id, type.id, year, entitled);
    const previous = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: type.id, year: year - 1 } } });
    const used = await quotaUsed(employee.id, type, input.startDate, balance.used);
    const remaining = leaveRemaining({
      mode: type.balanceMode,
      entitled,
      used,
      carryIn: type.quotaPeriod === "MONTHLY" ? 0 : carryIn(previous, type.carryForwardDays),
      expiryMonth: type.expiryMonth,
      expiryDate: type.expiryDate,
      asOf: input.startDate,
    });
    if (days > remaining) throw new Error("The available balance is not enough for this request.");
  }
  const plan = await planApproval({ companyId: employee.companyId, workflowKey: "LEAVE", requesterId: ctx.userId, employeeId: employee.id, taskModule: "LEAVE" });
  let assignee = "";
  let managerId = "";
  if (plan.mode === "fallback") {
    const manager = employee.managerId ? await prisma.user.findFirst({ where: { employeeId: employee.managerId, status: "ACTIVE" } }) : null;
    if (!manager) throw new Error("No active direct supervisor is available to receive this request.");
    const delegate = await activeDelegate(manager.id, "LEAVE", employee.companyId);
    assignee = resolveAssignee(manager.id, delegate, ctx.userId);
    managerId = manager.id;
  }
  let divisionNote = "";
  if (employee.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: employee.departmentId } });
    const mates = await prisma.employee.findMany({
      where: { departmentId: employee.departmentId, id: { not: employee.id }, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
      select: { id: true },
    });
    const teammates = mates.length === 0 ? 0 : await prisma.leaveRequest.count({
      where: { employeeId: { in: mates.map((mate) => mate.id) }, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
    });
    if (department && department.maxOnLeave > 0 && teammates + 1 > department.maxOnLeave) {
      throw new Error(`Your division already has ${teammates} people away on these dates. The limit is ${department.maxOnLeave}, so this request was not sent.`);
    }
    if (teammates > 0) divisionNote = `${teammates} teammate${teammates === 1 ? "" : "s"} in your division already have leave on these dates.`;
  }
  let coverId = "";
  let coverName = "";
  if (input.cover === "yes") {
    const cover = input.coverId
      ? await prisma.employee.findFirst({ where: { id: input.coverId, companyId: employee.companyId, departmentId: employee.departmentId || "__none__", status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } } })
      : null;
    if (!cover || cover.id === employee.id) throw new Error("Choose a teammate in your division as the substitute.");
    coverId = cover.id;
    coverName = cover.fullName;
  } else if (input.cover !== "no") {
    throw new Error("Choose whether someone will cover for you.");
  }
  let attachmentId = prior?.attachmentId || "";
  if (input.attachment && input.attachment.size > 0) attachmentId = await saveEmployeeFile({ companyId: employee.companyId, employeeId: employee.id, file: input.attachment });
  const fields = {
    leaveTypeId: type.id,
    startDate: input.startDate,
    endDate: input.endDate,
    halfDay: input.halfDay,
    halfStart,
    halfEnd,
    days,
    reason: input.reason,
    attachmentId,
    coverId,
    approverId: assignee,
    status: "PENDING",
  };
  if (prior) {
    await prisma.leaveRequest.update({ where: { id: prior.id }, data: fields });
    await prisma.approvalTask.updateMany({ where: { companyId: employee.companyId, module: "LEAVE", subjectId: prior.id, status: "PENDING" }, data: { status: "DONE" } });
    const revisedTitle = `Leave: ${employee.fullName} ${input.startDate} to ${input.endDate}${input.halfDay ? ` half day ${halfStart}–${halfEnd}` : ""}${coverName ? ` · cover ${coverName}` : " · no cover"}`;
    const revisedAssignees = await commitApproval({ plan, companyId: employee.companyId, workflowKey: "LEAVE", taskModule: "LEAVE", subjectId: prior.id, requesterId: ctx.userId, employeeId: employee.id, title: revisedTitle, href: "/approvals/pending", fallbackAssigneeId: assignee, fallbackOriginalId: managerId });
    for (const approverId of revisedAssignees) await notify(approverId, "Leave revised", `${employee.fullName} updated ${type.name}.`, "/approvals/pending");
    await audit(ctx, "leave.resubmit", "LeaveRequest", prior.id, `${days} days`);
    return "The revised request was sent back for approval.";
  }
  const request = await prisma.leaveRequest.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      leaveTypeId: type.id,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDay: input.halfDay,
      halfStart,
      halfEnd,
      days,
      reason: input.reason,
      attachmentId,
      coverId,
      approverId: assignee,
    },
  });
  const leaveTitle = `Leave: ${employee.fullName} ${input.startDate} to ${input.endDate}${input.halfDay ? ` half day ${halfStart}–${halfEnd}` : ""}${coverName ? ` · cover ${coverName}` : " · no cover"}`;
  const leaveAssignees = await commitApproval({ plan, companyId: employee.companyId, workflowKey: "LEAVE", taskModule: "LEAVE", subjectId: request.id, requesterId: ctx.userId, employeeId: employee.id, title: leaveTitle, href: "/approvals/pending", fallbackAssigneeId: assignee, fallbackOriginalId: managerId });
  for (const approverId of leaveAssignees) await notify(approverId, "Leave request", `${employee.fullName} requested ${type.name}.`, "/approvals/pending");
  await audit(ctx, "leave.submit", "LeaveRequest", request.id, `${days} days`);
  const sent = plan.mode === "workflow" ? "Leave request sent for approval." : "Leave request sent to your direct supervisor.";
  return divisionNote ? `${sent} ${divisionNote}` : sent;
}

async function ensureBalance(employeeId: string, leaveTypeId: string, year: number, entitled: number) {
  return prisma.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    update: {},
    create: { employeeId, leaveTypeId, year, entitled },
  });
}

export async function decideLeave(ctx: Ctx, requestId: string, decision: "APPROVED" | "REJECTED" | "RETURNED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED", "RETURNED"]);
  const companyId = requireCompany(ctx);
  const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, companyId }, include: { employee: true, leaveType: true } });
  if (!request || request.status !== "PENDING") throw new Error("The leave request is not pending.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "LEAVE", subjectId: request.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "leave.approve")) throw new Error("This leave request is not assigned to you.");
  const stage = await stageDecision({ companyId, subjectId: request.id, taskId: task.id, actorId: ctx.userId, decision, note });
  if (stage === "next") {
    const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
    if (owner) await notify(owner.id, "Leave moved to the next approver", note || request.leaveType.name, "/me/leave");
    await audit(ctx, "leave.decide", "LeaveRequest", request.id, "NEXT");
    return;
  }
  if (decision === "APPROVED") {
    await markLeaveAttendance(request.employee.companyId, request.employeeId, request.startDate, request.endDate, request.halfDay);
    const year = yearOf(request.startDate);
    if (request.leaveType.balanceMode !== "NONE") {
      const entitled = policyEntitled({ mode: request.leaveType.balanceMode, quotaDays: request.leaveType.quotaDays, quotaPeriod: request.leaveType.quotaPeriod, accrualRate: request.leaveType.accrualRate, asOf: request.startDate });
      const balance = await ensureBalance(request.employeeId, request.leaveTypeId, year, entitled);
      const previous = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: year - 1 } } });
      const used = request.leaveType.quotaPeriod === "MONTHLY"
        ? await quotaUsed(request.employeeId, request.leaveType, request.startDate, balance.used, ["APPROVED"])
        : balance.used;
      const remaining = leaveRemaining({
        mode: request.leaveType.balanceMode,
        entitled,
        used,
        carryIn: request.leaveType.quotaPeriod === "MONTHLY" ? 0 : carryIn(previous, request.leaveType.carryForwardDays),
        expiryMonth: request.leaveType.expiryMonth,
        expiryDate: request.leaveType.expiryDate,
        asOf: request.startDate,
      });
      if (request.days > remaining) throw new Error("The balance is no longer enough to approve this request.");
      await prisma.leaveBalance.update({ where: { id: balance.id }, data: { used: balance.used + request.days } });
    } else {
      const eventCap = cappedLeaveAllowance(request.leaveType);
      if (eventCap) {
        const balance = await ensureEventBalance(request.employeeId, request.leaveTypeId, eventCap.entitled);
        if (request.days > cappedLeaveRemaining(eventCap.entitled, balance.used)) throw new Error("The balance is no longer enough to approve this request.");
        await prisma.leaveBalance.update({ where: { id: balance.id }, data: { entitled: eventCap.entitled, used: balance.used + request.days } });
      }
    }
    await prisma.$transaction([
      prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decisionNote: note, approverId: ctx.userId } }),
      prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } }),
      prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } }),
    ]);
  } else if (decision === "REJECTED" || decision === "RETURNED") {
    await prisma.$transaction([
      prisma.leaveRequest.update({ where: { id: request.id }, data: { status: decision, decisionNote: note } }),
      prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } }),
      prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } }),
    ]);
  } else {
    throw new Error("Choose approve, reject, or return for revision.");
  }
  const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
  if (owner) await notify(owner.id, `Leave ${decision.toLowerCase()}`, note || request.leaveType.name, "/me/leave");
  await audit(ctx, "leave.decide", "LeaveRequest", request.id, decision);
}

async function quotaUsed(employeeId: string, type: { id: string; quotaPeriod: string }, startDate: string, yearlyUsed: number, statuses = ["PENDING", "APPROVED", "CANCEL_PENDING"]) {
  if (type.quotaPeriod !== "MONTHLY") return yearlyUsed;
  const month = startDate.slice(0, 7);
  const rows = await prisma.leaveRequest.findMany({
    where: { employeeId, leaveTypeId: type.id, status: { in: statuses }, startDate: { startsWith: month } },
  });
  return rows.reduce((sum, row) => sum + row.days, 0);
}

async function markLeaveAttendance(companyId: string, employeeId: string, start: string, end: string, halfDay: boolean) {
  if (halfDay) return;
  const schedules = await prisma.employeeSchedule.findMany({ where: { employeeId } });
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId } })).map((row) => row.date));
  const dates = (halfDay ? [start] : eachDate(start, end)).filter((date) => workdaysOn(schedules, date).includes(weekday(date)) && !holidays.has(date));
  for (const date of dates) {
    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: date } } });
    if (existing && existing.source === "CLOCK") throw new Error(`Attendance on ${date} already has a clock record, so the leave cannot replace it.`);
    await prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId, workDate: date } },
      create: { companyId, employeeId, workDate: date, status: "APPROVED_LEAVE", source: "LEAVE" },
      update: { status: "APPROVED_LEAVE", source: "LEAVE", clockInAt: "", clockOutAt: "", lateMinutes: 0 },
    });
  }
}

export async function cancelLeave(ctx: Ctx, requestId: string) {
  const employee = await ownEmployee(ctx);
  const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, employeeId: employee.id }, include: { leaveType: true } });
  if (!request) throw new Error("Leave request not found.");
  const mode = leaveCancelMode(request.status, request.startDate, todayJakarta());
  if (mode === "NONE") throw new Error("This request cannot be cancelled.");
  const { usersWithPermission } = await import("./access");
  const hrs = await usersWithPermission(employee.companyId, "leave.manage");
  if (mode === "HR" && hrs.length === 0) throw new Error("No HR user is available to review this cancellation.");
  if (mode === "DIRECT") {
    const eventCap = cappedLeaveAllowance(request.leaveType);
    await restoreLeave(request.employeeId, request.leaveTypeId, request.leaveType.balanceMode, request.startDate, request.days, eventCap ? { entitled: eventCap.entitled, used: await approvedLeaveDays(request.employeeId, request.leaveTypeId) } : undefined);
    await clearLeaveAttendance(request.employeeId, request.startDate, request.endDate);
    await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", decisionNote: "Cancelled by employee before the start date." } });
    if (request.approverId) await notify(request.approverId, "Leave cancelled", `${employee.fullName} cancelled leave before it started.`, "/leave/history");
    await audit(ctx, "leave.cancel", "LeaveRequest", request.id, "DIRECT");
    return "The leave was cancelled and the balance was restored.";
  }
  await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "CANCEL_PENDING" } });
  for (const hr of hrs) {
    await prisma.approvalTask.create({
      data: {
        companyId: employee.companyId,
        module: "LEAVE_CANCEL",
        subjectId: request.id,
        assigneeId: hr.id,
        originalAssigneeId: hr.id,
        requesterId: ctx.userId,
        title: `Leave cancellation: ${employee.fullName}`,
        href: "/approvals/pending",
      },
    });
    await notify(hr.id, "Leave cancellation needs HR", `${employee.fullName} asked to cancel leave that has already started.`, "/approvals/pending");
  }
  await audit(ctx, "leave.cancel.request", "LeaveRequest", request.id, "HR");
  return "The cancellation was sent to HR.";
}

async function eventRemaining(employeeId: string, leaveTypeId: string, entitled: number) {
  const balance = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: 0 } } });
  const used = balance ? balance.used : await approvedLeaveDays(employeeId, leaveTypeId);
  return cappedLeaveRemaining(entitled, used);
}

async function approvedLeaveDays(employeeId: string, leaveTypeId: string) {
  const rows = await prisma.leaveRequest.findMany({ where: { employeeId, leaveTypeId, status: "APPROVED" }, select: { days: true } });
  return rows.reduce((sum, row) => sum + row.days, 0);
}

async function ensureEventBalance(employeeId: string, leaveTypeId: string, entitled: number) {
  const existing = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: 0 } } });
  if (existing) return existing;
  return prisma.leaveBalance.create({ data: { employeeId, leaveTypeId, year: 0, entitled, used: await approvedLeaveDays(employeeId, leaveTypeId) } });
}

async function restoreLeave(employeeId: string, leaveTypeId: string, mode: string, startDate: string, days: number, createFrom?: { entitled: number; used: number }) {
  const year = mode === "NONE" ? 0 : yearOf(startDate);
  let balance = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } });
  if (!balance && createFrom) {
    balance = await prisma.leaveBalance.create({ data: { employeeId, leaveTypeId, year, entitled: createFrom.entitled, used: createFrom.used } });
  }
  if (!balance) return;
  await prisma.leaveBalance.update({ where: { id: balance.id }, data: { used: Math.max(0, balance.used - days) } });
}

async function clearLeaveAttendance(employeeId: string, start: string, end: string) {
  await prisma.attendanceRecord.deleteMany({ where: { employeeId, source: "LEAVE", workDate: { gte: start, lte: end } } });
}

export async function decideLeaveCancel(ctx: Ctx, requestId: string, decision: "APPROVED" | "REJECTED", restoreDays: number, note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED"]);
  if (!hasPerm(ctx, "leave.manage")) throw new Error("HR permission is required to decide a cancellation after leave has started.");
  const companyId = requireCompany(ctx);
  const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, companyId, status: "CANCEL_PENDING" }, include: { leaveType: true, employee: true } });
  if (!request) throw new Error("The cancellation request was not found.");
  if (decision === "APPROVED") {
    if (restoreDays < 0 || restoreDays > request.days) throw new Error("Days to restore must be between zero and the original request.");
    const eventCap = cappedLeaveAllowance(request.leaveType);
    const approved = eventCap ? await approvedLeaveDays(request.employeeId, request.leaveTypeId) : 0;
    await restoreLeave(request.employeeId, request.leaveTypeId, request.leaveType.balanceMode, request.startDate, restoreDays, eventCap ? { entitled: eventCap.entitled, used: approved + request.days } : undefined);
    await clearLeaveAttendance(request.employeeId, request.startDate, request.endDate);
    await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", decisionNote: note || `HR restored ${restoreDays} day(s).` } });
  } else {
    await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decisionNote: note || "Cancellation rejected. The leave remains approved." } });
  }
  const tasks = await prisma.approvalTask.findMany({ where: { companyId, module: "LEAVE_CANCEL", subjectId: request.id, status: "PENDING" } });
  for (const task of tasks) {
    await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
    await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  }
  const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
  if (owner) await notify(owner.id, `Leave cancellation ${decision.toLowerCase()}`, note, "/me/leave");
  await audit(ctx, "leave.cancel.decide", "LeaveRequest", request.id, decision);
}

export async function resubmitLeave(ctx: Ctx, requestId: string, input: { leaveTypeId: string; startDate: string; endDate: string; halfDay: boolean; halfStart?: string; halfEnd?: string; reason: string; attachment: File | null; cover: "yes" | "no"; coverId?: string }) {
  return submitLeave(ctx, { ...input, existingId: requestId });
}

export async function submitOvertime(ctx: Ctx, input: { workDate: string; startTime: string; endTime: string; reason: string }) {
  if (!hasPerm(ctx, "overtime.self")) throw new Error("You do not have permission to request overtime.");
  const employee = await ownEmployee(ctx);
  const policy = await prisma.overtimePolicy.findUnique({ where: { companyId: employee.companyId } });
  if (!policy?.allowBefore && !policy?.allowAfter) throw new Error("Overtime is not enabled by company policy.");
  if (policy && !overtimeWithinSubmitWindow(input.workDate, todayJakarta(), policy.submitLimitEnabled, policy.submitLimitDays)) {
    throw new Error(`Overtime can no longer be submitted because it is past the maximum of ${policy.submitLimitDays} days after the overtime date. Contact HR for more information.`);
  }
  const schedulesForDate = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id, dayOfWeek: weekday(input.workDate) }, include: { shift: true } });
  const schedule = schedulesForDate.find((row) => row.shift && scheduleActive(row, input.workDate));
  if (!schedule?.shift) throw new Error("There is no shift on that date.");
  const plan = await planApproval({ companyId: employee.companyId, workflowKey: "OVERTIME", requesterId: ctx.userId, employeeId: employee.id, taskModule: "OVERTIME" });
  let assignee = "";
  let managerId = "";
  if (plan.mode === "fallback") {
    const manager = employee.managerId ? await prisma.user.findFirst({ where: { employeeId: employee.managerId, status: "ACTIVE" } }) : null;
    if (!manager) throw new Error("No active direct supervisor is available to receive this request.");
    const delegate = await activeDelegate(manager.id, "OVERTIME", employee.companyId);
    assignee = resolveAssignee(manager.id, delegate, ctx.userId);
    managerId = manager.id;
  }
  const request = await prisma.overtimeRequest.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      workDate: input.workDate,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
      approverId: assignee,
    },
  });
  const overtimeAssignees = await commitApproval({ plan, companyId: employee.companyId, workflowKey: "OVERTIME", taskModule: "OVERTIME", subjectId: request.id, requesterId: ctx.userId, employeeId: employee.id, title: `Overtime: ${employee.fullName} ${input.workDate}`, href: "/approvals/pending", fallbackAssigneeId: assignee, fallbackOriginalId: managerId });
  for (const approverId of overtimeAssignees) await notify(approverId, "Overtime request", `${employee.fullName} requested overtime on ${input.workDate}.`, "/approvals/pending");
  await audit(ctx, "overtime.submit", "OvertimeRequest", request.id, input.workDate);
}

export async function decideOvertime(ctx: Ctx, requestId: string, decision: "APPROVED" | "REJECTED" | "RETURNED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED", "RETURNED"]);
  const companyId = requireCompany(ctx);
  const request = await prisma.overtimeRequest.findFirst({ where: { id: requestId, companyId, status: "PENDING" }, include: { employee: true } });
  if (!request) throw new Error("The overtime request is not pending.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "OVERTIME", subjectId: request.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "overtime.approve")) throw new Error("This overtime request is not assigned to you.");
  const stage = await stageDecision({ companyId, subjectId: request.id, taskId: task.id, actorId: ctx.userId, decision, note });
  if (stage === "next") {
    const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
    if (owner) await notify(owner.id, "Overtime moved to the next approver", note || request.workDate, "/me/overtime");
    await audit(ctx, "overtime.decide", "OvertimeRequest", request.id, "NEXT");
    return;
  }
  await prisma.overtimeRequest.update({ where: { id: request.id }, data: { status: decision, decisionNote: note, approverId: ctx.userId } });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  if (decision === "APPROVED") {
    await refreshOvertimeForDate(request.employeeId, request.workDate);
    const policy = await prisma.overtimePolicy.findUnique({ where: { companyId } });
    const posted = policy && policy.mealAllowance > 0
      ? await prisma.overtimeRequest.findFirst({ where: { employeeId: request.employeeId, workDate: request.workDate, mealPosted: true } })
      : null;
    if (policy && policy.mealAllowance > 0 && !posted) {
      const period = await prisma.payrollPeriod.findFirst({
        where: { companyId, status: { in: ["DRAFT", "PROCESSED"] }, startDate: { lte: request.workDate }, endDate: { gte: request.workDate } },
        orderBy: { startDate: "desc" },
      }) ?? await prisma.payrollPeriod.findFirst({ where: { companyId, status: { in: ["DRAFT", "PROCESSED"] } }, orderBy: { startDate: "desc" } });
      if (period) {
        await recordAdjustment(ctx, {
          periodId: period.id,
          employeeId: request.employeeId,
          name: "Overtime meal",
          kind: "EARNING",
          amount: policy.mealAllowance,
          reason: `Meal allowance for overtime on ${request.workDate}`,
        });
        await prisma.overtimeRequest.update({ where: { id: request.id }, data: { mealPosted: true } });
      }
    }
  }
  const owner = await prisma.user.findFirst({ where: { employeeId: request.employeeId } });
  if (owner) await notify(owner.id, `Overtime ${decision.toLowerCase()}`, note || request.workDate, "/me/overtime");
  await audit(ctx, "overtime.decide", "OvertimeRequest", request.id, decision);
}

export async function reviewOvertimeCompensation(ctx: Ctx, requestId: string, note: string) {
  if (!hasPerm(ctx, "overtime.review")) throw new Error("Compensation review requires the HR review permission. It is not a second approval.");
  const companyId = requireCompany(ctx);
  const request = await prisma.overtimeRequest.findFirst({ where: { id: requestId, companyId, status: "APPROVED" } });
  if (!request) throw new Error("Only an approved overtime request can be reviewed.");
  if (request.compensationStatus !== "PENDING_REVIEW") throw new Error("Attendance must validate the hours before compensation can be reviewed.");
  await prisma.overtimeRequest.update({
    where: { id: request.id },
    data: { compensationStatus: "REVIEWED", reviewedBy: ctx.userId, reviewNote: note },
  });
  await audit(ctx, "overtime.review", "OvertimeRequest", request.id, note);
}

export async function resubmitOvertime(ctx: Ctx, requestId: string, input: { startTime: string; endTime: string; reason: string }) {
  const employee = await ownEmployee(ctx);
  const request = await prisma.overtimeRequest.findFirst({ where: { id: requestId, employeeId: employee.id, status: "RETURNED" } });
  if (!request) throw new Error("Only a returned overtime request can be submitted again.");
  await prisma.overtimeRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", decisionNote: "Replaced by a revised submission." } });
  await submitOvertime(ctx, { workDate: request.workDate, ...input });
}
