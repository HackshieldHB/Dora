import { prisma } from "@/lib/db";
import { parsePermissions } from "@/lib/format";

export async function usersWithPermission(companyId: string, permission: string) {
  const roles = await prisma.role.findMany({ where: { companyId } });
  const roleIds = roles.filter((role) => parsePermissions(role.permissions).includes(permission)).map((role) => role.id);
  if (!roleIds.length) return [];
  return prisma.user.findMany({ where: { companyId, status: "ACTIVE", roleId: { in: roleIds } } });
}

export async function lockedPeriodForDate(companyId: string, workDate: string) {
  return prisma.payrollPeriod.findFirst({
    where: { companyId, status: "LOCKED", startDate: { lte: workDate }, endDate: { gte: workDate } },
  });
}
