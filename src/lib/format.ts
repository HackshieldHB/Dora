const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatLongDate(iso: string, locale = "en"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [year, month, day] = iso.split("-");
  const names = locale === "id" ? MONTHS_ID : MONTHS_EN;
  return `${Number(day)} ${names[Number(month) - 1]} ${year}`;
}

export function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function todayJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function timeJakarta(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function currentMonth(now = new Date()): string {
  return todayJakarta(now).slice(0, 7);
}

export function monthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function parsePermissions(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function chosen(formData: FormData, name: string): string {
  const values = formData.getAll(name).map((value) => text(value)).filter(Boolean);
  return values.at(-1) || "";
}

export function integer(value: FormDataEntryValue | null): number {
  const parsed = Number(typeof value === "string" ? value : "");
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

export function decimal(value: FormDataEntryValue | null): number {
  const parsed = Number(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function checked(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}
