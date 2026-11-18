import { prisma } from "./db";
import { addDays, addMonths, withinComingDays } from "./domain";
import { todayJakarta } from "./format";
import { deliverEmail } from "./mail";
import { usersWithPermission } from "@/server/access";

export async function notify(userId: string, title: string, body: string, href = "") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return;
  await prisma.notification.create({ data: { userId, title, body, href } });
  let status = "LOGGED";
  try {
    status = await deliverEmail({ to: user.email, subject: title, body });
  } catch {
    status = "FAILED";
  }
  await prisma.emailLog.create({
    data: { companyId: user.companyId, to: user.email, subject: title, body, status },
  });
}

export async function remindStaleApprovals(companyId: string) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const remindAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tasks = await prisma.approvalTask.findMany({
    where: { companyId, status: "PENDING", createdAt: { lt: cutoff } },
  });
  for (const task of tasks) {
    if (task.lastRemindedAt && task.lastRemindedAt > remindAfter) continue;
    await notify(task.assigneeId, "Approval reminder", `${task.title} is still waiting for a decision.`, task.href);
    await prisma.approvalTask.update({ where: { id: task.id }, data: { lastRemindedAt: new Date() } });
  }
}

async function notifyOnce(userId: string, title: string, body: string, href: string) {
  const since = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({ where: { userId, title, body, createdAt: { gte: since } } });
  if (existing) return;
  await notify(userId, title, body, href);
}

export async function remindHrDates(companyId: string) {
  const today = todayJakarta();
  const hr = await usersWithPermission(companyId, "employees.manage");
  if (hr.length === 0) return;
  const documents = await prisma.employeeDocument.findMany({
    where: { expiresOn: { not: "" }, employee: { companyId, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } } },
    include: { employee: true },
  });
  const people = await prisma.employee.findMany({
    where: { companyId, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
    select: { id: true, fullName: true, joinDate: true, employmentType: true, contractEnd: true, contractDecision: true },
  });
  for (const reviewer of hr) {
    for (const document of documents) {
      if (!withinComingDays(document.expiresOn, today, 30)) continue;
      await notifyOnce(reviewer.id, "Document expiring", `${document.employee.fullName}: ${document.name} expires ${document.expiresOn}.`, `/employees/${document.employeeId}?tab=documents`);
    }
    for (const person of people) {
      if (person.employmentType === "PROBATION" && person.joinDate && withinComingDays(addMonths(person.joinDate, 3), today, 30)) {
        await notifyOnce(reviewer.id, "Probation ending", `${person.fullName} finishes probation on ${addMonths(person.joinDate, 3)}.`, `/employees/${person.id}`);
      }
      if (person.contractEnd && person.contractDecision !== "END" && withinComingDays(person.contractEnd, today, 30)) {
        await notifyOnce(reviewer.id, "Contract ending", `${person.fullName}'s contract ends on ${person.contractEnd}.`, `/employees/${person.id}`);
      }
    }
  }
}

export async function remindOpenClockOuts(companyId: string) {
  const today = todayJakarta();
  const yesterday = addDays(today, -1);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const rows = await prisma.attendanceRecord.findMany({
    where: { companyId, clockInAt: { not: "" }, clockOutAt: "", workDate: { in: [today, yesterday] }, source: "CLOCK" },
  });
  for (const row of rows) {
    const crosses = row.shiftEnd < row.shiftStart;
    const due = crosses
      ? today > addDays(row.workDate, 1) || (today === addDays(row.workDate, 1) && time > row.shiftEnd)
      : today > row.workDate || (today === row.workDate && row.shiftEnd && time > row.shiftEnd);
    if (!due || !row.shiftEnd) continue;
    const owner = await prisma.user.findFirst({ where: { employeeId: row.employeeId, status: "ACTIVE" } });
    if (owner) await notifyOnce(owner.id, "Clock-out still open", `You clocked in on ${row.workDate} and have not clocked out.`, "/me/attendance");
  }
}

export async function activeDelegate(fromUserId: string, module: string, companyId: string): Promise<string | null> {
  const today = todayJakarta();
  const rows = await prisma.delegation.findMany({ where: { companyId, fromUserId, active: true, startDate: { lte: today }, endDate: { gte: today } } });
  const match = rows.find((row) => {
    const modules = JSON.parse(row.modules) as string[];
    return modules.includes(module) && row.toUserId !== row.fromUserId;
  });
  return match?.toUserId ?? null;
}
