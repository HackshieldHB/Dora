import type { DbClient } from "@/lib/db";
import { publicHolidays } from "@/lib/holidays";

export async function ensureNationalHolidays(db: DbClient, companyId: string, year: number) {
  const { days } = publicHolidays(year);
  for (const day of days) {
    if (day.kind !== "NATIONAL") continue;
    const existing = await db.holiday.findUnique({ where: { companyId_date: { companyId, date: day.date } } });
    if (!existing) await db.holiday.create({ data: { companyId, date: day.date, name: day.name } });
  }
}

export async function applyJointHolidays(db: DbClient, companyId: string, year: number) {
  const joint = publicHolidays(year).days.filter((day) => day.kind === "JOINT");
  if (joint.length === 0) throw new Error("This year has no joint-leave dates in the three-minister decree yet.");
  let added = 0;
  for (const day of joint) {
    const existing = await db.holiday.findUnique({ where: { companyId_date: { companyId, date: day.date } } });
    if (existing) continue;
    await db.holiday.create({ data: { companyId, date: day.date, name: day.name } });
    added += 1;
  }
  return added;
}
