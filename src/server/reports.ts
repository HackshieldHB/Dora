import { prisma } from "@/lib/db";
import { hasPerm, type Ctx } from "@/lib/context";
import { formatIdr } from "@/lib/format";
import { employeeWhere, requireCompany } from "./scope";

export type ReportTable = { title: string; columns: string[]; rows: string[][] };

export async function buildReport(ctx: Ctx, category: string, filters: { from: string; to: string; branchId: string; departmentId: string; locationId: string }): Promise<ReportTable> {
  if (category === "payroll" && !hasPerm(ctx, "reports.payroll")) throw new Error("Payroll reports require the payroll report permission.");
  else if (category === "tax" && !hasPerm(ctx, "tax.view")) throw new Error("Tax reports require tax permission.");
  else if (!["payroll", "tax"].includes(category) && !hasPerm(ctx, "reports.view")) throw new Error("You do not have permission to view this report.");
  if (!["employee", "attendance", "leave", "overtime", "payroll", "tax", "approval"].includes(category)) throw new Error("Unknown report.");
  const companyId = requireCompany(ctx);
  const employees = await prisma.employee.findMany({
    where: {
      AND: [
        employeeWhere(ctx),
        filters.branchId ? { branchId: filters.branchId } : {},
        filters.departmentId ? { departmentId: filters.departmentId } : {},
        filters.locationId ? { locationId: filters.locationId } : {},
      ],
    },
    include: { department: true, branch: true, position: true },
  });
  const ids = employees.map((employee) => employee.id);
  const names = new Map(employees.map((employee) => [employee.id, employee.fullName]));
  if (category === "employee") {
    return {
      title: "Employee report",
      columns: ["Code", "Name", "Status", "Department", "Position", "Branch", "Join date"],
      rows: employees.map((employee) => [employee.employeeCode, employee.fullName, employee.status, employee.department?.name ?? "", employee.position?.name ?? "", employee.branch?.name ?? "", employee.joinDate]),
    };
  }
  if (category === "attendance") {
    const rows = await prisma.attendanceRecord.findMany({ where: { companyId, employeeId: { in: ids }, workDate: { gte: filters.from, lte: filters.to } }, orderBy: { workDate: "asc" } });
    return {
      title: "Attendance report",
      columns: ["Date", "Employee", "Status", "In", "Out", "Late minutes"],
      rows: rows.map((row) => [row.workDate, names.get(row.employeeId) ?? "", row.status, row.clockInAt, row.clockOutAt, String(row.lateMinutes)]),
    };
  }
  if (category === "leave") {
    const rows = await prisma.leaveRequest.findMany({ where: { companyId, employeeId: { in: ids }, startDate: { lte: filters.to }, endDate: { gte: filters.from } }, include: { leaveType: true } });
    return {
      title: "Leave report",
      columns: ["Employee", "Type", "Start", "End", "Days", "Status"],
      rows: rows.map((row) => [names.get(row.employeeId) ?? "", row.leaveType.name, row.startDate, row.endDate, String(row.days), row.status]),
    };
  }
  if (category === "overtime") {
    const rows = await prisma.overtimeRequest.findMany({ where: { companyId, employeeId: { in: ids }, workDate: { gte: filters.from, lte: filters.to } } });
    return {
      title: "Overtime report",
      columns: ["Employee", "Date", "Request", "Status", "Valid minutes", "Compensation", "Review"],
      rows: rows.map((row) => [names.get(row.employeeId) ?? "", row.workDate, `${row.startTime}-${row.endTime}`, row.status, String(row.validMinutes), formatIdr(row.compensationIdr), row.compensationStatus]),
    };
  }
  if (category === "payroll" || category === "tax") {
    const items = await prisma.payrollItem.findMany({
      where: { employeeId: { in: ids }, period: { companyId, startDate: { lte: filters.to }, endDate: { gte: filters.from } } },
      include: { period: true, employee: true },
    });
    if (category === "tax") {
      return {
        title: "Tax and statutory report",
        columns: ["Period", "Employee", "PPh 21", "BPJS employee", "BPJS employer"],
        rows: items.map((item) => [item.period.name, item.employee.fullName, formatIdr(item.pph21), formatIdr(item.bpjsEmployee), formatIdr(item.bpjsEmployer)]),
      };
    }
    return {
      title: "Payroll report",
      columns: ["Period", "Status", "Employee", "Gross", "Deduction", "Net"],
      rows: items.map((item) => [item.period.name, item.period.status, item.employee.fullName, formatIdr(item.gross), formatIdr(item.deduction), formatIdr(item.net)]),
    };
  }
  const tasks = await prisma.approvalTask.findMany({ where: { companyId, createdAt: { gte: new Date(`${filters.from}T00:00:00Z`), lte: new Date(`${filters.to}T23:59:59Z`) } }, include: { decisions: true } });
  return {
    title: "Approval report",
    columns: ["Created", "Module", "Title", "Status", "Decisions"],
    rows: tasks.map((task) => [task.createdAt.toISOString().slice(0, 10), task.module, task.title, task.status, String(task.decisions.length)]),
  };
}
