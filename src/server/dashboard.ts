import { prisma } from "@/lib/db";
import { hasPerm, type Ctx } from "@/lib/context";
import { widgetsFor, type WidgetId } from "@/lib/domain";
import { currentMonth, monthBounds, todayJakarta } from "@/lib/format";
import { remindHrDates, remindOpenClockOuts, remindStaleApprovals } from "@/lib/notify";
import { translate } from "@/lib/i18n";
import { statusLabel } from "@/lib/status";
import { employeeWhere } from "./scope";

export type DashFilters = { month: string; branchId: string; departmentId: string; locationId: string; periodId: string; payrollStatus: string };

export type AttendanceBoard = {
  onTime: number;
  late: number;
  onLeave: number;
  early: number;
  missingOut: number;
  other: number;
  clockedIn: number;
  withoutRecord: number;
  active: number;
  recorded: number;
};

export type DashboardBoard = {
  attendance: AttendanceBoard | null;
  departments: { name: string; count: number }[];
  leavePending: number | null;
  overtimePending: number | null;
  approvalsPending: number | null;
};

function attendanceBoard(rows: { status: string }[], active: number): AttendanceBoard {
  const onTime = rows.filter((row) => row.status === "PRESENT").length;
  const late = rows.filter((row) => row.status === "LATE").length;
  const onLeave = rows.filter((row) => row.status === "APPROVED_LEAVE").length;
  const early = rows.filter((row) => row.status === "EARLY").length;
  const missingOut = rows.filter((row) => row.status === "MISSING_CLOCK_OUT").length;
  const other = Math.max(0, rows.length - onTime - late - onLeave - early - missingOut);
  return {
    onTime,
    late,
    onLeave,
    early,
    missingOut,
    other,
    clockedIn: onTime + late,
    withoutRecord: Math.max(0, active - rows.length),
    active,
    recorded: rows.length,
  };
}

export function currentPayrollPeriod<T extends { startDate: string; endDate: string }>(periods: T[], today: string): T | undefined {
  const covering = periods.filter((period) => period.startDate <= today && period.endDate >= today);
  covering.sort((left, right) => left.startDate.localeCompare(right.startDate) || right.endDate.localeCompare(left.endDate));
  return covering[0] ?? periods[0];
}

export async function loadDashboard(ctx: Ctx, filters: DashFilters) {
  const t = (value: string) => translate(ctx.locale, value);
  if (ctx.companyId) {
    await remindStaleApprovals(ctx.companyId);
    await remindHrDates(ctx.companyId);
    await remindOpenClockOuts(ctx.companyId);
  }
  const widgets = widgetsFor(ctx.layout, ctx.permissions);
  const month = filters.month || currentMonth();
  const bounds = monthBounds(month);
  const today = todayJakarta();
  const scoped = {
    AND: [
      employeeWhere(ctx),
      filters.branchId ? { branchId: filters.branchId } : {},
      filters.departmentId ? { departmentId: filters.departmentId } : {},
      filters.locationId ? { locationId: filters.locationId } : {},
    ],
  };
  const cards: { id: WidgetId; title: string; value: string; hint: string; href?: string }[] = [];
  const board: DashboardBoard = { attendance: null, departments: [], leavePending: null, overtimePending: null, approvalsPending: null };
  const employees = widgets.some((widget) => ["employee_summary", "team_summary", "workforce", "attendance_overview", "team_attendance"].includes(widget))
    ? await prisma.employee.findMany({ where: scoped, include: { department: true } })
    : [];
  const ids = employees.map((employee) => employee.id);
  if (widgets.includes("employee_summary") || widgets.includes("team_summary")) {
    const active = employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "PENDING OFFBOARDING").length;
    cards.push({
      id: widgets.includes("team_summary") ? "team_summary" : "employee_summary",
      title: t(widgets.includes("team_summary") ? "Team headcount" : "Current headcount"),
      value: String(active),
      hint: ctx.locale === "id"
        ? `${employees.length} dalam cakupan · ${employees.filter((employee) => employee.joinDate.startsWith(month)).length} masuk bulan ini · aktif atau menunggu offboarding`
        : `${employees.length} in scope · ${employees.filter((employee) => employee.joinDate.startsWith(month)).length} joined this month · active or pending offboarding`,
      href: `/employees?status=ACTIVE&branchId=${filters.branchId}&departmentId=${filters.departmentId}&locationId=${filters.locationId}`,
    });
  }
  if (widgets.includes("my_attendance") && ctx.employeeId) {
    const row = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: ctx.employeeId, workDate: today } } });
    cards.push({ id: "my_attendance", title: t("My attendance today"), value: row ? t(statusLabel(row.status)) : t("Not clocked"), hint: row?.clockInAt ? `${ctx.locale === "id" ? "Masuk" : "In"} ${row.clockInAt}` : t("Clock-in is on My Attendance"), href: "/me/attendance" });
  }
  if (widgets.includes("leave_balance") && ctx.employeeId) {
    const balance = await prisma.leaveBalance.findFirst({ where: { employeeId: ctx.employeeId, year: Number(today.slice(0, 4)) }, include: { leaveType: true }, orderBy: { entitled: "desc" } });
    cards.push({ id: "leave_balance", title: t("Leave balance"), value: balance ? String(Math.max(0, balance.entitled - balance.used)) : "0", hint: balance?.leaveType.name ?? t("No balance yet"), href: "/me/leave" });
  }
  if (widgets.includes("my_requests") && ctx.employeeId) {
    const submitted = { gte: new Date(`${bounds.start}T00:00:00+07:00`), lte: new Date(`${bounds.end}T23:59:59.999+07:00`) };
    const open = { status: { in: ["PENDING", "RETURNED"] }, createdAt: submitted };
    const count = await prisma.leaveRequest.count({ where: { employeeId: ctx.employeeId, ...open } })
      + await prisma.overtimeRequest.count({ where: { employeeId: ctx.employeeId, ...open } });
    cards.push({ id: "my_requests", title: t("My open requests"), value: String(count), hint: ctx.locale === "id" ? `Diajukan pada ${month}` : `Submitted in ${month}`, href: `/me/leave?month=${month}` });
  }
  if (widgets.includes("latest_payslip") && ctx.employeeId) {
    const personal = ctx.roleKey === "employee";
    const item = await prisma.payrollItem.findFirst({
      where: {
        employeeId: ctx.employeeId,
        period: {
          payslipPublished: true,
          companyId: ctx.companyId ?? undefined,
          ...(personal ? { startDate: { gte: bounds.start, lte: bounds.end } } : {}),
        },
      },
      include: { period: true },
      orderBy: { period: { payDate: "desc" } },
    });
    cards.push({
      id: "latest_payslip",
      title: t("Latest payslip"),
      value: item ? t("Published") : t("None"),
      hint: item?.period.name ?? t(personal ? "No published payslip for this period." : "Only a published personal payslip is shown"),
      href: item ? `/me/payslip?period=${item.periodId}` : "/me/payslip",
    });
  }
  if ((widgets.includes("attendance_overview") || widgets.includes("team_attendance")) && ids.length) {
    const rows = await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: today } });
    const active = employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "PENDING OFFBOARDING").length;
    const day = attendanceBoard(rows, active);
    board.attendance = day;
    cards.push({
      id: widgets.includes("team_attendance") ? "team_attendance" : "attendance_overview",
      title: t("Present or late"),
      value: String(day.clockedIn),
      hint: ctx.locale === "id"
        ? `${day.late} terlambat · ${day.onLeave} cuti disetujui · ${day.withoutRecord} belum ada catatan`
        : `${day.late} late · ${day.onLeave} on approved leave · ${day.withoutRecord} without an attendance record`,
      href: `/attendance/records?date=${today}`,
    });
  }
  if (widgets.includes("pending_approvals") || widgets.includes("approval_center") || widgets.includes("action_center")) {
    const count = await prisma.approvalTask.count({ where: { assigneeId: ctx.userId, status: "PENDING" } });
    board.approvalsPending = count;
    cards.push({ id: widgets.includes("pending_approvals") ? "pending_approvals" : "approval_center", title: t("Pending approvals"), value: String(count), hint: t("Assigned to you"), href: "/approvals/pending" });
  }
  if (widgets.includes("team_leave") || widgets.includes("leave_summary") || widgets.includes("leave_overtime")) {
    const pending = await prisma.leaveRequest.count({ where: { employeeId: { in: ids.length ? ids : ["__none__"] }, status: "PENDING" } });
    board.leavePending = pending;
    cards.push({ id: "leave_summary", title: t("Leave pending"), value: String(pending), hint: t("Inside the current scope"), href: "/leave/requests?status=PENDING" });
  }
  if (widgets.includes("team_overtime") || widgets.includes("overtime_summary") || widgets.includes("leave_overtime")) {
    const pending = await prisma.overtimeRequest.count({ where: { employeeId: { in: ids.length ? ids : ["__none__"] }, status: "PENDING" } });
    board.overtimePending = pending;
    cards.push({ id: "overtime_summary", title: t("Overtime pending"), value: String(pending), hint: t("Inside the current scope"), href: "/overtime/requests?status=PENDING" });
  }
  const payrollPeriods = widgets.some((widget) => ["payroll_period", "payroll_summary", "processing_tasks", "pending_payroll"].includes(widget))
    ? await prisma.payrollPeriod.findMany({ where: { companyId: ctx.companyId ?? "__none__" }, orderBy: { startDate: "desc" } })
    : [];
  const payrollPeriod = payrollPeriods.find((period) => period.id === filters.periodId)
    || currentPayrollPeriod(payrollPeriods, today)
    || payrollPeriods.find((period) => period.startDate.startsWith(month));
  const statusMatches = !filters.payrollStatus || payrollPeriod?.status === filters.payrollStatus;
  if (widgets.includes("payroll_period") || widgets.includes("payroll_status") || widgets.includes("payroll_summary")) {
    if (hasPerm(ctx, "payroll.view")) {
      cards.push({ id: "payroll_period", title: t("Payroll period"), value: payrollPeriod?.name ?? t("None"), hint: payrollPeriod ? t(statusLabel(payrollPeriod.status)) : t("No payroll period"), href: "/payroll/periods" });
      if (payrollPeriod) {
        const totals = statusMatches
          ? await prisma.payrollItem.aggregate({
            where: {
              periodId: payrollPeriod.id,
              employee: { AND: [employeeWhere(ctx), filters.branchId ? { branchId: filters.branchId } : {}, filters.departmentId ? { departmentId: filters.departmentId } : {}] },
            },
            _sum: { net: true },
            _count: true,
          })
          : { _sum: { net: 0 }, _count: 0 };
        const scope = [filters.branchId ? "branch" : "", filters.departmentId ? "department" : ""].filter(Boolean).join(" · ");
        cards.push({ id: "payroll_summary", title: t("Payroll net"), value: String(totals._sum.net ?? 0), hint: `${totals._count} ${ctx.locale === "id" ? "karyawan" : "employees"} · ${payrollPeriod.status}${scope ? ` · ${scope}` : ""}`, href: `/payroll/processing?period=${payrollPeriod.id}&branchId=${filters.branchId}&departmentId=${filters.departmentId}` });
      }
    }
  }
  if (widgets.includes("processing_tasks")) {
    const open = Boolean(payrollPeriod && statusMatches && (payrollPeriod.status === "DRAFT" || (payrollPeriod.status === "PROCESSED" && (!payrollPeriod.preparedById || payrollPeriod.preparedById === ctx.userId))));
    cards.push({ id: "processing_tasks", title: t("Processing tasks"), value: open ? "1" : "0", hint: payrollPeriod ? `${payrollPeriod.name} · ${payrollPeriod.status}` : t("No payroll period"), href: payrollPeriod ? `/payroll/processing?period=${payrollPeriod.id}` : "/payroll/processing" });
  }
  if (widgets.includes("pending_payroll")) {
    const count = !filters.payrollStatus || filters.payrollStatus === "SUBMITTED"
      ? await prisma.approvalTask.count({ where: { assigneeId: ctx.userId, module: "PAYROLL", status: "PENDING", ...(payrollPeriod ? { subjectId: payrollPeriod.id } : {}) } })
      : 0;
    cards.push({ id: "pending_payroll", title: t("Payroll approvals"), value: String(count), hint: t("Assigned to you"), href: payrollPeriod ? `/payroll/approval?period=${payrollPeriod.id}` : "/payroll/approval" });
  }
  if (widgets.includes("workforce")) {
    const groups = new Map<string, number>();
    for (const employee of employees.filter((row) => row.status === "ACTIVE" || row.status === "PENDING OFFBOARDING")) {
      const name = employee.department?.name ?? "Unassigned";
      groups.set(name, (groups.get(name) ?? 0) + 1);
    }
    board.departments = [...groups.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    cards.push({ id: "workforce", title: t("Staffed departments"), value: String(groups.size), hint: board.departments.map((row) => `${row.name} ${row.count}`).join(" · ") || t("No active or pending-offboarding employees"), href: "/organization/structure" });
  }
  if (widgets.includes("platform_summary")) {
    const companies = await prisma.company.count();
    const users = await prisma.user.count();
    cards.push({ id: "platform_summary", title: t("Tenants"), value: String(companies), hint: ctx.locale === "id" ? `${users} akun pengguna` : `${users} user accounts`, href: "/platform/tenants" });
  }
  const actions = quickActions(ctx);
  return { widgets, cards, board, actions, month, today, periodId: payrollPeriod?.id ?? "", refreshedAt: new Date().toISOString() };
}

export async function loadDivisionToday(ctx: Ctx, departmentId: string) {
  if (!ctx.companyId) return null;
  const me = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId }, select: { departmentId: true } }) : null;
  const department = departmentId || me?.departmentId || "";
  if (!department) return null;
  const dept = await prisma.department.findFirst({ where: { id: department, companyId: ctx.companyId } });
  if (!dept) return null;
  const people = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, departmentId: department, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
  const today = todayJakarta();
  const ids = people.map((person) => person.id);
  const records = ids.length ? await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: today } }) : [];
  const leaves = ids.length ? await prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } } }) : [];
  const buckets = bucketToday(people, records, leaves);
  return { id: dept.id, name: dept.name, ...buckets };
}

export async function loadTeamToday(ctx: Ctx) {
  if (!ctx.companyId || !ctx.employeeId) return null;
  const people = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, managerId: ctx.employeeId, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
  if (people.length === 0) return null;
  const today = todayJakarta();
  const ids = people.map((person) => person.id);
  const records = await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: today } });
  const leaves = await prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } } });
  return bucketToday(people, records, leaves);
}

function bucketToday(
  people: { id: string; fullName: string }[],
  records: { employeeId: string; status: string; clockInAt: string }[],
  leaves: { employeeId: string }[],
) {
  const onLeave = new Set(leaves.map((row) => row.employeeId));
  const byId = new Map(records.map((row) => [row.employeeId, row]));
  const present: string[] = [];
  const away: string[] = [];
  const open: string[] = [];
  for (const person of people) {
    const row = byId.get(person.id);
    if (onLeave.has(person.id) || row?.status === "APPROVED_LEAVE") away.push(person.fullName);
    else if (row?.clockInAt || (row && ["PRESENT", "LATE", "EARLY", "MISSING_CLOCK_OUT"].includes(row.status))) present.push(person.fullName);
    else open.push(person.fullName);
  }
  return { present, leave: away, open };
}

function quickActions(ctx: Ctx) {
  const t = (value: string) => translate(ctx.locale, value);
  const actions: { label: string; href: string }[] = [];
  if (hasPerm(ctx, "attendance.self") && ctx.employeeId) actions.push({ label: t("Clock in / out"), href: "/me/attendance" });
  if (hasPerm(ctx, "leave.self") && ctx.employeeId) actions.push({ label: t("Request leave"), href: "/me/leave" });
  if (hasPerm(ctx, "approvals.act")) actions.push({ label: t("Review approvals"), href: "/approvals/pending" });
  if (hasPerm(ctx, "payroll.prepare")) actions.push({ label: t("Process payroll"), href: "/payroll/processing" });
  if (hasPerm(ctx, "employees.manage")) actions.push({ label: t("Employee onboarding"), href: "/employees/onboarding" });
  if (hasPerm(ctx, "settings.users")) actions.push({ label: t("Manage users"), href: "/settings/users" });
  if (hasPerm(ctx, "organization.manage")) actions.push({ label: t("Organization"), href: "/organization" });
  return actions;
}
