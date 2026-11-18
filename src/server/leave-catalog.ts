import type { PrismaClient } from "@prisma/client";
import { LEAVE_CATALOG } from "@/lib/leave-catalog";

export async function ensureLeaveCatalog(db: PrismaClient, companyId: string) {
  for (const item of LEAVE_CATALOG) {
    const existing = await db.leaveType.findFirst({ where: { companyId, name: item.name } });
    if (!existing) {
      await db.leaveType.create({
        data: {
          companyId,
          name: item.name,
          balanceMode: item.balanceMode,
          quotaDays: item.quotaDays,
          quotaPeriod: item.quotaPeriod,
          paid: item.paid,
          allowHalfDay: item.allowHalfDay,
          requiresAttachment: item.requiresAttachment,
          requiresReason: item.requiresReason,
          carryForwardDays: item.carryForwardDays,
          maxCalendarDays: item.maxCalendarDays,
          minServiceMonths: item.minServiceMonths,
          legalNote: item.legalNote,
        },
      });
      continue;
    }
    if (item.balanceMode === "NONE" && item.quotaDays > 0 && existing.balanceMode !== "NONE" && existing.quotaDays === item.quotaDays) {
      await db.leaveType.update({ where: { id: existing.id }, data: { balanceMode: "NONE" } });
    }
    if (!existing.legalNote) {
      await db.leaveType.update({
        where: { id: existing.id },
        data: {
          legalNote: item.legalNote,
          balanceMode: item.balanceMode,
          quotaDays: item.quotaDays,
          quotaPeriod: item.quotaPeriod,
          paid: item.paid,
          allowHalfDay: item.allowHalfDay,
          requiresAttachment: item.requiresAttachment,
          requiresReason: item.requiresReason,
          carryForwardDays: item.name === "Annual leave" ? existing.carryForwardDays : item.carryForwardDays,
          maxCalendarDays: item.maxCalendarDays,
          minServiceMonths: item.minServiceMonths,
        },
      });
    }
  }
}
