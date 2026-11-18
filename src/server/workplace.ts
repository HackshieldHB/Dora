import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { activeDelegate, notify } from "@/lib/notify";
import { hasPerm, type Ctx } from "@/lib/context";
import { assertDecision } from "@/lib/decision";
import { addDays, resolveAssignee, scheduleActive, weekday } from "@/lib/domain";
import { todayJakarta } from "@/lib/format";
import { requireCompany } from "./scope";

async function ownEmployee(ctx: Ctx) {
  if (!ctx.employeeId) throw new Error("Your user is not linked to an employee record.");
  const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
  if (!employee || (employee.status !== "ACTIVE" && employee.status !== "PENDING OFFBOARDING")) throw new Error("ESS is available after the employee is active.");
  return employee;
}

async function supervisor(employee: { managerId: string | null; companyId: string; fullName: string }, requesterId: string, module: string) {
  const manager = employee.managerId ? await prisma.user.findFirst({ where: { employeeId: employee.managerId, status: "ACTIVE" } }) : null;
  if (!manager) throw new Error("No active direct supervisor is available to receive this request.");
  const delegate = await activeDelegate(manager.id, module, employee.companyId);
  return { managerId: manager.id, assignee: resolveAssignee(manager.id, delegate, requesterId) };
}

async function shiftOn(employeeId: string, workDate: string) {
  const rows = await prisma.employeeSchedule.findMany({ where: { employeeId }, include: { shift: true } });
  return rows.find((row) => row.dayOfWeek === weekday(workDate) && row.shift && scheduleActive(row, workDate))?.shift ?? null;
}

export async function submitShiftSwap(ctx: Ctx, input: { counterpartId: string; workDate: string; note: string }) {
  const employee = await ownEmployee(ctx);
  if (input.counterpartId === employee.id) throw new Error("Choose a teammate, not yourself.");
  const today = todayJakarta();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate) || input.workDate < today || input.workDate > addDays(today, 30)) {
    throw new Error("A shift swap can be asked for today or up to 30 days ahead.");
  }
  const counterpart = await prisma.employee.findFirst({ where: { id: input.counterpartId, companyId: employee.companyId, departmentId: employee.departmentId, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } } });
  if (!counterpart || !employee.departmentId) throw new Error("Choose someone in your own division.");
  const mine = await shiftOn(employee.id, input.workDate);
  const theirs = await shiftOn(counterpart.id, input.workDate);
  if (!mine || !theirs) throw new Error("Both people need a shift on that date.");
  const open = await prisma.shiftSwap.findFirst({
    where: {
      workDate: input.workDate,
      status: { in: ["PENDING", "APPROVED"] },
      OR: [{ requesterId: employee.id }, { counterpartId: employee.id }, { requesterId: counterpart.id }, { counterpartId: counterpart.id }],
    },
  });
  if (open) throw new Error("One of you already has a swap on that date.");
  const { managerId, assignee } = await supervisor(employee, ctx.userId, "SHIFT");
  const swap = await prisma.shiftSwap.create({
    data: {
      companyId: employee.companyId,
      requesterId: employee.id,
      counterpartId: counterpart.id,
      workDate: input.workDate,
      requesterShiftId: mine.id,
      counterpartShiftId: theirs.id,
      note: input.note.trim().slice(0, 200),
      approverId: assignee,
    },
  });
  await prisma.approvalTask.create({
    data: { companyId: employee.companyId, module: "SHIFT", subjectId: swap.id, assigneeId: assignee, originalAssigneeId: managerId, requesterId: ctx.userId, title: `Shift swap: ${employee.fullName} and ${counterpart.fullName} on ${input.workDate}`, href: "/approvals/pending" },
  });
  await notify(assignee, "Shift swap", `${employee.fullName} wants to swap shifts with ${counterpart.fullName}.`, "/approvals/pending");
  const other = await prisma.user.findFirst({ where: { employeeId: counterpart.id, status: "ACTIVE" } });
  if (other) await notify(other.id, "Shift swap", `${employee.fullName} asked to swap shifts with you on ${input.workDate}.`, "/me/attendance");
  await audit(ctx, "shift.swap", "ShiftSwap", swap.id, input.workDate);
  return "Shift swap sent to your direct supervisor.";
}

export async function decideShiftSwap(ctx: Ctx, swapId: string, decision: "APPROVED" | "REJECTED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED"]);
  const companyId = requireCompany(ctx);
  const swap = await prisma.shiftSwap.findFirst({ where: { id: swapId, companyId, status: "PENDING" }, include: { requester: true, counterpart: true } });
  if (!swap) throw new Error("The shift swap is not pending.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "SHIFT", subjectId: swap.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act")) throw new Error("This shift swap is not assigned to you.");
  await prisma.shiftSwap.update({ where: { id: swap.id }, data: { status: decision, decisionNote: note, approverId: ctx.userId } });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  for (const personId of [swap.requesterId, swap.counterpartId]) {
    const owner = await prisma.user.findFirst({ where: { employeeId: personId, status: "ACTIVE" } });
    if (owner) await notify(owner.id, `Shift swap ${decision.toLowerCase()}`, note || swap.workDate, "/me/attendance");
  }
  await audit(ctx, "shift.swap.decide", "ShiftSwap", swap.id, decision);
  return decision === "APPROVED" ? "The two shifts are swapped for that date." : "Shift swap rejected.";
}

export async function submitTimesheet(ctx: Ctx, input: { workDate: string; client: string; hours: number; note: string }) {
  const employee = await ownEmployee(ctx);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate) || input.workDate > todayJakarta()) throw new Error("A timesheet date cannot be after today.");
  if (!input.client.trim()) throw new Error("Name the client.");
  if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) throw new Error("Hours must be more than 0 and at most 24.");
  const { managerId, assignee } = await supervisor(employee, ctx.userId, "TIMESHEET");
  const row = await prisma.timesheet.create({
    data: { companyId: employee.companyId, employeeId: employee.id, workDate: input.workDate, client: input.client.trim().slice(0, 80), hours: Math.round(input.hours * 10) / 10, note: input.note.trim().slice(0, 200), approverId: assignee },
  });
  await prisma.approvalTask.create({
    data: { companyId: employee.companyId, module: "TIMESHEET", subjectId: row.id, assigneeId: assignee, originalAssigneeId: managerId, requesterId: ctx.userId, title: `Timesheet: ${employee.fullName} ${input.workDate} ${input.client.trim()}`, href: "/approvals/pending" },
  });
  await notify(assignee, "Timesheet", `${employee.fullName} logged ${row.hours} hours for ${row.client}.`, "/approvals/pending");
  await audit(ctx, "timesheet.submit", "Timesheet", row.id, input.workDate);
  return "Timesheet sent to your direct supervisor. It does not change your pay.";
}

export async function decideTimesheet(ctx: Ctx, id: string, decision: "APPROVED" | "REJECTED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED"]);
  const companyId = requireCompany(ctx);
  const row = await prisma.timesheet.findFirst({ where: { id, companyId, status: "PENDING" } });
  if (!row) throw new Error("The timesheet is not pending.");
  const task = await prisma.approvalTask.findFirst({ where: { companyId, module: "TIMESHEET", subjectId: row.id, status: "PENDING", assigneeId: ctx.userId } });
  if (!task || !hasPerm(ctx, "approvals.act")) throw new Error("This timesheet is not assigned to you.");
  await prisma.timesheet.update({ where: { id: row.id }, data: { status: decision, decisionNote: note, approverId: ctx.userId } });
  await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  const owner = await prisma.user.findFirst({ where: { employeeId: row.employeeId, status: "ACTIVE" } });
  if (owner) await notify(owner.id, `Timesheet ${decision.toLowerCase()}`, note || row.client, "/me/attendance");
  await audit(ctx, "timesheet.decide", "Timesheet", row.id, decision);
  return "Timesheet decision saved. Pay is unchanged.";
}

export async function postAnnouncement(ctx: Ctx, input: { title: string; body: string; endsOn: string }) {
  if (!hasPerm(ctx, "organization.manage")) throw new Error("You do not have permission to post an announcement.");
  const companyId = requireCompany(ctx);
  if (!input.title.trim() || !input.body.trim()) throw new Error("An announcement needs a title and a message.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn) || input.endsOn < todayJakarta()) throw new Error("Choose an end date that is today or later.");
  const row = await prisma.announcement.create({ data: { companyId, title: input.title.trim().slice(0, 80), body: input.body.trim().slice(0, 500), endsOn: input.endsOn, authorId: ctx.userId } });
  await audit(ctx, "announcement.post", "Announcement", row.id, row.title);
  return "Announcement posted.";
}

export async function issueWarning(ctx: Ctx, employeeId: string, month: string, note: string) {
  const companyId = requireCompany(ctx);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new Error("Employee not found.");
  const manager = employee.managerId === ctx.employeeId;
  if (!manager && !hasPerm(ctx, "employees.manage")) throw new Error("Only HR or the direct supervisor can record a warning.");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a month.");
  if (!note.trim()) throw new Error("Write what the warning is for.");
  const lateDays = await prisma.attendanceRecord.count({ where: { employeeId, status: "LATE", workDate: { gte: `${month}-01`, lte: `${month}-31` } } });
  if (lateDays < 3) throw new Error(`This month has ${lateDays} late day${lateDays === 1 ? "" : "s"}. A warning needs at least 3.`);
  const previous = await prisma.warningLetter.findMany({ where: { employeeId }, orderBy: { createdAt: "asc" } });
  if (previous.some((row) => row.month === month)) throw new Error("This month already has a warning.");
  const level = ["SP1", "SP2", "SP3"][previous.length];
  if (!level) throw new Error("SP3 is already on record. Another letter was not added.");
  const row = await prisma.warningLetter.create({ data: { companyId, employeeId, level, month, lateDays, note: note.trim().slice(0, 300), actorId: ctx.userId } });
  const owner = await prisma.user.findFirst({ where: { employeeId, status: "ACTIVE" } });
  if (owner) await notify(owner.id, level, `${month}: ${note.trim().slice(0, 140)}`, `/employees/${employeeId}`);
  await audit(ctx, "warning.issue", "WarningLetter", row.id, level);
  return `${level} recorded for ${month}. Pay was not changed.`;
}

export async function writeOneOnOne(ctx: Ctx, employeeId: string, meetingDate: string, note: string) {
  const companyId = requireCompany(ctx);
  if (!ctx.employeeId) throw new Error("Your user is not linked to an employee record.");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId, managerId: ctx.employeeId } });
  if (!employee) throw new Error("You can write a note only for someone who reports to you.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || meetingDate > todayJakarta()) throw new Error("The meeting date cannot be after today.");
  if (!note.trim()) throw new Error("Write the note.");
  const row = await prisma.oneOnOne.create({ data: { companyId, employeeId, meetingDate, note: note.trim().slice(0, 1000), authorId: ctx.userId } });
  const owner = await prisma.user.findFirst({ where: { employeeId, status: "ACTIVE" } });
  if (owner) await notify(owner.id, "1-on-1 note", `Your manager saved a note from ${meetingDate}.`, "/me/goals");
  await audit(ctx, "meeting.note", "OneOnOne", row.id, meetingDate);
  return "Note saved. Your team member can read it.";
}
