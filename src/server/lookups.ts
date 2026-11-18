import { prisma } from "@/lib/db";

export async function lookups(companyId: string) {
  const [branches, locations, departments, positions, employees, shifts, roles, leaveTypes, periods] = await Promise.all([
    prisma.branch.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.workLocation.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { companyId }, orderBy: { fullName: "asc" } }),
    prisma.shift.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.leaveType.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.payrollPeriod.findMany({ where: { companyId }, orderBy: { startDate: "desc" } }),
  ]);
  return { branches, locations, departments, positions, employees, shifts, roles, leaveTypes, periods };
}
