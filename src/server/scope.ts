import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/context";

export function employeeWhere(ctx: Ctx): Prisma.EmployeeWhereInput {
  if (!ctx.companyId) return { id: "__none__" };
  const company = { companyId: ctx.companyId };
  if (ctx.dataScope === "COMPANY") return company;
  if (ctx.dataScope === "SELF") return { ...company, id: ctx.employeeId ?? "__none__" };
  if (ctx.dataScope === "DIRECT_REPORTS") {
    const self = ctx.employeeId ?? "__none__";
    return { ...company, OR: [{ id: self }, { managerId: self }] };
  }
  if (ctx.dataScope === "DEPARTMENT") return { ...company, departmentId: { in: ctx.departmentIds.length ? ctx.departmentIds : ["__none__"] } };
  if (ctx.dataScope === "BRANCH") return { ...company, branchId: ctx.branchId || ctx.scopeRefId || "__none__" };
  return { id: "__none__" };
}

export function requireCompany(ctx: Ctx): string {
  if (!ctx.companyId) throw new Error("This action belongs to a company account.");
  return ctx.companyId;
}
