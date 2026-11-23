/** Pure DORA rules. Persistence and permissions live outside this file. */

import { withholdPph21 } from "@/lib/tax-method";

export type PasswordPolicy = {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
};

export type LayoutKey = "employee" | "manager" | "hr" | "payroll" | "company_admin" | "platform" | "standard";

export type WidgetId =
  | "my_attendance"
  | "leave_balance"
  | "my_requests"
  | "latest_payslip"
  | "attendance_trend"
  | "quick_actions"
  | "team_summary"
  | "team_attendance"
  | "pending_approvals"
  | "team_leave"
  | "team_overtime"
  | "employee_summary"
  | "attendance_overview"
  | "leave_summary"
  | "overtime_summary"
  | "leave_overtime"
  | "workforce"
  | "action_center"
  | "payroll_period"
  | "payroll_status"
  | "payroll_summary"
  | "processing_tasks"
  | "pending_payroll"
  | "approval_center"
  | "platform_summary";

const LAYOUTS: Record<LayoutKey, WidgetId[]> = {
  employee: ["my_attendance", "leave_balance", "my_requests", "latest_payslip", "attendance_trend", "quick_actions"],
  manager: ["team_summary", "team_attendance", "pending_approvals", "team_leave", "team_overtime", "quick_actions"],
  hr: ["employee_summary", "attendance_overview", "leave_summary", "overtime_summary", "workforce", "action_center"],
  payroll: ["payroll_period", "payroll_status", "payroll_summary", "processing_tasks", "pending_payroll", "latest_payslip", "quick_actions"],
  company_admin: ["employee_summary", "attendance_overview", "leave_overtime", "workforce", "action_center", "quick_actions"],
  platform: ["platform_summary", "quick_actions"],
  standard: ["employee_summary", "attendance_overview", "leave_overtime", "payroll_summary", "approval_center", "quick_actions"],
};

const WIDGET_PERMISSION: Partial<Record<WidgetId, string[]>> = {
  my_attendance: ["attendance.self"],
  leave_balance: ["leave.self"],
  my_requests: ["leave.self", "overtime.self"],
  latest_payslip: ["payroll.self"],
  attendance_trend: ["attendance.self"],
  team_summary: ["employees.view"],
  team_attendance: ["attendance.view"],
  pending_approvals: ["approvals.act"],
  team_leave: ["leave.view"],
  team_overtime: ["overtime.view"],
  employee_summary: ["employees.view"],
  attendance_overview: ["attendance.view"],
  leave_summary: ["leave.view"],
  overtime_summary: ["overtime.view"],
  leave_overtime: ["leave.view", "overtime.view"],
  workforce: ["employees.view"],
  action_center: ["approvals.act", "employees.manage"],
  payroll_period: ["payroll.view"],
  payroll_status: ["payroll.view"],
  payroll_summary: ["payroll.view"],
  processing_tasks: ["payroll.prepare"],
  pending_payroll: ["payroll.approve"],
  approval_center: ["approvals.act"],
};

export function widgetsFor(layout: string, permissions: Iterable<string>): WidgetId[] {
  const key = (layout in LAYOUTS ? layout : "standard") as LayoutKey;
  const held = new Set(permissions);
  return LAYOUTS[key].filter((widget) => {
    if (widget === "quick_actions" || widget === "platform_summary") return true;
    const needed = WIDGET_PERMISSION[widget];
    if (!needed) return false;
    return needed.some((permission) => held.has(permission));
  });
}

export function passwordError(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) return `Password must be at least ${policy.minLength} characters.`;
  if (policy.requireUpper && !/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (policy.requireLower && !/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (policy.requireDigit && !/[0-9]/.test(password)) return "Password must include a digit.";
  return null;
}

export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const index = month - 1 + months;
  const last = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, index, Math.min(day, last))).toISOString().slice(0, 10);
}

export function withinComingDays(date: string, today: string, days: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return date >= today && date <= addDays(today, days);
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6_371_000;
  const turn = Math.PI / 180;
  const dLat = (lat2 - lat1) * turn;
  const dLng = (lng2 - lng1) * turn;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * turn) * Math.cos(lat2 * turn) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function outsideWorkplace(meters: number, radius: number) {
  return radius > 0 && meters > radius;
}

export function coordinateError(lat: string, lng: string) {
  const latitude = lat.trim();
  const longitude = lng.trim();
  if (!latitude && !longitude) return "";
  if (!latitude || !longitude) return "Enter both latitude and longitude.";
  if (!/^-?\d+(\.\d+)?$/.test(latitude) || !/^-?\d+(\.\d+)?$/.test(longitude)) return "Latitude and longitude must be numbers.";
  const latN = Number(latitude);
  const lngN = Number(longitude);
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return "Latitude must be between -90 and 90, and longitude between -180 and 180.";
  return "";
}

export function normalizeNpwp(value: string): { value: string; error: string | null } {
  const digits = value.replace(/\D/g, "");
  if (!digits) return { value: "", error: null };
  if (digits.length === 16) return { value: digits, error: null };
  if (digits.length !== 15) return { value: "", error: "NPWP must be 15 digits, or 16 digits when it follows the NIK." };
  return {
    value: `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}.${digits.slice(8, 9)}-${digits.slice(9, 12)}.${digits.slice(12)}`,
    error: null,
  };
}

export function daysUntilMonthDay(today: string, month: number, day: number): number | null {
  const [year, nowMonth, nowDay] = today.split("-").map(Number);
  const build = (atYear: number) => {
    const date = new Date(Date.UTC(atYear, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  };
  const now = new Date(Date.UTC(year, nowMonth - 1, nowDay));
  const thisYear = build(year);
  if (!thisYear) return null;
  let diff = Math.round((thisYear.getTime() - now.getTime()) / 86_400_000);
  if (diff < 0) {
    const next = build(year + 1);
    if (!next) return null;
    diff = Math.round((next.getTime() - now.getTime()) / 86_400_000);
  }
  return diff <= 7 ? diff : null;
}

export function weekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function inclusiveDays(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const a = Date.UTC(ys, ms - 1, ds);
  const b = Date.UTC(ye, me - 1, de);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function eachDate(start: string, end: string): string[] {
  if (end < start) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function countLeaveDays(input: {
  start: string;
  end: string;
  halfDay: boolean;
  workdays: number[];
  holidays: string[];
}): number {
  if (input.end < input.start) return 0;
  if (input.halfDay) {
    if (input.start !== input.end) return 0;
    if (!input.workdays.includes(weekday(input.start))) return 0;
    if (input.holidays.includes(input.start)) return 0;
    return 0.5;
  }
  const holiday = new Set(input.holidays);
  return eachDate(input.start, input.end).filter((date) => input.workdays.includes(weekday(date)) && !holiday.has(date)).length;
}

export function leaveCancelMode(status: string, startDate: string, today: string): "DIRECT" | "HR" | "NONE" {
  if (status !== "APPROVED") return "NONE";
  return today < startDate ? "DIRECT" : "HR";
}

export function monthNumber(iso: string): number {
  return Number(iso.slice(5, 7));
}

export function calendarDays(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return 0;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function serviceMonths(joinDate: string, asOf: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf < joinDate) return 0;
  let months = (Number(asOf.slice(0, 4)) - Number(joinDate.slice(0, 4))) * 12 + (Number(asOf.slice(5, 7)) - Number(joinDate.slice(5, 7)));
  if (asOf.slice(8, 10) < joinDate.slice(8, 10)) months -= 1;
  return Math.max(0, months);
}

export function loanInstallment(amount: number, tenor: number): number {
  if (amount <= 0 || tenor < 1) return 0;
  return Math.ceil(amount / tenor);
}

export function shiftMonth(month: string, count: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + count;
  const date = new Date(Date.UTC(year, index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function loanSchedule(amount: number, tenor: number, startMonth: string): { month: string; amount: number }[] {
  if (!/^\d{4}-\d{2}$/.test(startMonth) || tenor < 1 || amount <= 0) return [];
  const regular = loanInstallment(amount, tenor);
  const rows: { month: string; amount: number }[] = [];
  let left = amount;
  for (let index = 0; index < tenor && left > 0; index += 1) {
    const value = index === tenor - 1 ? left : Math.min(regular, left);
    rows.push({ month: shiftMonth(startMonth, index), amount: value });
    left -= value;
  }
  return rows;
}

export function paidLoanMonths(schedule: { month: string }[], installments: { month: string; settled: boolean }[]): Set<string> {
  const taken = new Set(installments.filter((row) => row.settled && row.month).map((row) => row.month));
  let legacy = installments.filter((row) => row.settled && !row.month).length;
  for (const slot of schedule) {
    if (legacy <= 0) break;
    if (!taken.has(slot.month)) {
      taken.add(slot.month);
      legacy -= 1;
    }
  }
  return taken;
}

export function kpiAchievement(direction: string, target: number, actual: number): number {
  if (target <= 0 || actual < 0) return 0;
  if (direction === "LOWER") return actual === 0 ? 100 : (target / actual) * 100;
  if (direction === "MILESTONE") return actual >= target ? 100 : (actual / target) * 100;
  return (actual / target) * 100;
}

export function leaveRemaining(input: {
  mode: string;
  entitled: number;
  used: number;
  carryIn: number;
  expiryMonth: number;
  expiryDate?: string;
  asOf: string;
}): number {
  if (input.mode === "NONE") return Number.POSITIVE_INFINITY;
  if (input.expiryDate && input.asOf > input.expiryDate) return 0;
  if (input.expiryMonth > 0 && monthNumber(input.asOf) > input.expiryMonth) return 0;
  return Math.max(0, input.entitled + input.carryIn - input.used);
}

export function cappedLeaveAllowance(input: { balanceMode: string; quotaDays: number; maxCalendarDays: number }): { entitled: number; calendar: boolean } | null {
  if (input.balanceMode !== "NONE") return null;
  if (input.maxCalendarDays > 0) return { entitled: input.maxCalendarDays, calendar: true };
  if (input.quotaDays > 0) return { entitled: input.quotaDays, calendar: false };
  return null;
}

export function cappedLeaveRemaining(entitled: number, used: number): number {
  return Math.max(0, entitled - used);
}

export function policyEntitled(input: { mode: string; quotaDays: number; quotaPeriod: string; accrualRate: number; asOf: string }): number {
  if (input.mode === "NONE") return Number.POSITIVE_INFINITY;
  if (input.mode === "ACCRUAL") {
    const rate = input.accrualRate > 0 ? input.accrualRate : input.quotaDays;
    if (input.quotaPeriod === "MONTHLY") return Math.min(input.quotaDays || rate, rate);
    return Math.min(input.quotaDays, rate * monthNumber(input.asOf));
  }
  return input.quotaDays;
}

export function scheduleActive(row: { effectiveStart: string; effectiveEnd: string }, date: string): boolean {
  if (row.effectiveStart && date < row.effectiveStart) return false;
  if (row.effectiveEnd && date > row.effectiveEnd) return false;
  return true;
}

export function shiftCrossesMidnight(start: string, end: string): boolean {
  return Boolean(start && end && end < start);
}

export function shiftLengthLabel(start: string, end: string): string {
  if (!start || !end || start === end) return "Unclear";
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours} hours ${rest} minutes`;
}

function clockMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  return hour * 60 + minute;
}

export function shiftMinute(time: string, shiftStart: string, crosses: boolean): number {
  const value = clockMinutes(time);
  const start = clockMinutes(shiftStart);
  if (!Number.isFinite(value) || !Number.isFinite(start)) return Number.NaN;
  if (crosses && value < start) return value + 24 * 60;
  return value;
}

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function offsiteClockError(clockIn: string, clockOut: string, crossesMidnight: boolean): string {
  if (!CLOCK_TIME.test(clockIn)) return "Clock-in time is required.";
  if (!clockOut) return "";
  if (!CLOCK_TIME.test(clockOut)) return "Clock-out time must be hours and minutes.";
  if (!crossesMidnight && clockOut < clockIn) return "Clock-out cannot be earlier than clock-in on the same day.";
  return "";
}

export function travelDateError(start: string, end: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return "Choose the departure and return dates.";
  if (end < start) return "The return date cannot be earlier than the departure date.";
  return "";
}

export function travelDayError(clockIn: string, clockOut: string): string {
  if (!CLOCK_TIME.test(clockIn)) return "Clock-in time is required.";
  if (!CLOCK_TIME.test(clockOut)) return "Clock-out time is required.";
  if (clockOut < clockIn) return "Clock-out cannot be earlier than clock-in on the same day.";
  return "";
}

export function halfDayTimeError(input: { start: string; end: string; shiftStart: string; shiftEnd: string; crosses: boolean }): string | null {
  if (!input.start || !input.end) return "Half day start time and end time are required.";
  const start = shiftMinute(input.start, input.shiftStart, input.crosses);
  const end = shiftMinute(input.end, input.shiftStart, input.crosses);
  const shiftStart = shiftMinute(input.shiftStart, input.shiftStart, input.crosses);
  const shiftEnd = shiftMinute(input.shiftEnd, input.shiftStart, input.crosses);
  if (![start, end, shiftStart, shiftEnd].every(Number.isFinite)) return "Enter the half day start and end as hours and minutes.";
  if (end <= start) return "End time must be after the start time.";
  if (start < shiftStart || end > shiftEnd) return "The half day must fall inside the working shift.";
  return null;
}

export function clockOutIsEarly(input: { clockOut: string; shiftStart: string; shiftEnd: string; crosses: boolean; leaveStart?: string; leaveEnd?: string }): boolean {
  const out = shiftMinute(input.clockOut, input.shiftStart, input.crosses);
  const end = shiftMinute(input.shiftEnd, input.shiftStart, input.crosses);
  if (!Number.isFinite(out) || !Number.isFinite(end) || out >= end) return false;
  if (input.leaveStart && input.leaveEnd) {
    const leaveStart = shiftMinute(input.leaveStart, input.shiftStart, input.crosses);
    const leaveEnd = shiftMinute(input.leaveEnd, input.shiftStart, input.crosses);
    if (Number.isFinite(leaveStart) && Number.isFinite(leaveEnd) && out >= leaveStart && leaveEnd >= end) return false;
  }
  return true;
}

export function importHeaderKey(header: string): string {
  const name = header.trim().toLowerCase().replace(/\*/g, "").replace(/\s+/g, "");
  const map: Record<string, string> = {
    id: "code",
    idkaryawan: "code",
    employeecode: "code",
    name: "name",
    namalengkap: "name",
    fullname: "name",
    email: "email",
    emailkerja: "email",
    phone: "phone",
    nomortelepon: "phone",
    status: "status",
    statuskaryawan: "status",
    department: "department",
    departemen: "department",
    position: "position",
    jabatan: "position",
    role: "role",
    "role/hakaksessistem": "role",
    branch: "branch",
    cabang: "branch",
    location: "location",
    lokasikerja: "location",
    manager: "manager",
    atasanlangsung: "manager",
    "atasanlangsung(idkaryawan)": "manager",
    joindate: "joinDate",
    tanggalbergabung: "joinDate",
    birthdate: "birthDate",
    tanggallahir: "birthDate",
    employmenttype: "employmentType",
    jeniskepegawaian: "employmentType",
    contractend: "contractEnd",
    akhirkontrak: "contractEnd",
    nik: "nik",
    npwp: "npwp",
    ptkp: "ptkp",
    statusptkp: "ptkp",
    bank: "bank",
    account: "account",
    nomorrekening: "account",
    basicsalary: "salary",
    gajipokok: "salary",
    healthenrolled: "healthOn",
    terdaftarbpjskesehatan: "healthOn",
    healthno: "healthNo",
    nomorpesertabpjskesehatan: "healthNo",
    healthclass: "healthClass",
    kelasperawatan: "healthClass",
    healthstart: "healthStart",
    tanggalmulaibpjskesehatan: "healthStart",
    tkenrolled: "tkOn",
    terdaftarbpjsketenagakerjaan: "tkOn",
    tkno: "tkNo",
    nomorpesertabpjstk: "tkNo",
    jht: "jht",
    jkk: "jkk",
    jkm: "jkm",
    jp: "jp",
    tkstart: "tkStart",
    tanggalmulaibpjstk: "tkStart",
    taxstatus: "taxStatus",
    statuspajak: "taxStatus",
    ptkpstart: "ptkpStart",
    mulaiberlakuptkp: "ptkpStart",
  };
  return map[name] || "";
}

export type EmployeeImportInput = {
  row: number;
  code: string;
  name: string;
  department: string;
  branch: string;
  location: string;
  position: string;
};

export function planEmployeeImport(rows: EmployeeImportInput[], refs: { departments: string[]; branches: string[]; locations: string[]; positions: string[]; existing: string[] }): { row: number; code: string; kind: "new" | "update" | "invalid"; reason: string }[] {
  const count = new Map<string, number>();
  for (const row of rows) {
    const code = row.code.trim().toLowerCase();
    if (code) count.set(code, (count.get(code) || 0) + 1);
  }
  const known = (list: string[], name: string) => list.some((item) => item.toLowerCase() === name.trim().toLowerCase());
  return rows.map((row) => {
    const reasons: string[] = [];
    const code = row.code.trim();
    const existing = Boolean(code) && refs.existing.some((item) => item.toLowerCase() === code.toLowerCase());
    if (!code) reasons.push("Employee ID is required.");
    else if ((count.get(code.toLowerCase()) || 0) > 1) reasons.push("Duplicate Employee ID.");
    else if (existing) reasons.push("This employee ID is already registered.");
    if (!existing && !row.name.trim()) reasons.push("Name is required.");
    if (row.department.trim() && !known(refs.departments, row.department)) reasons.push(`Department ${row.department.trim()} was not found.`);
    if (row.branch.trim() && !known(refs.branches, row.branch)) reasons.push(`Branch ${row.branch.trim()} was not found.`);
    if (row.location.trim() && !known(refs.locations, row.location)) reasons.push(`Location ${row.location.trim()} was not found.`);
    if (row.position.trim() && !known(refs.positions, row.position)) reasons.push(`Position ${row.position.trim()} was not found.`);
    if (reasons.length) return { row: row.row, code, kind: "invalid", reason: reasons.join(" ") };
    return { row: row.row, code, kind: "new", reason: "" };
  });
}

export function carryIn(previous: { entitled: number; used: number } | null, cap: number): number {
  if (!previous || cap <= 0) return 0;
  return Math.min(cap, Math.max(0, previous.entitled - previous.used));
}

export function canApprovePayroll(actorId: string, preparedById: string): boolean {
  return Boolean(actorId) && Boolean(preparedById) && actorId !== preparedById;
}

export type DelegationWindow = { fromUserId: string; toUserId: string; modules: string[]; startDate: string; endDate: string; active: boolean };

export function delegationActive(row: DelegationWindow, module: string, today: string): boolean {
  return row.active && row.modules.includes(module) && row.startDate <= today && today <= row.endDate && row.fromUserId !== row.toUserId;
}

export function resolveAssignee(originalId: string, delegateId: string | null, requesterId: string): string {
  if (!delegateId || delegateId === requesterId || delegateId === originalId) return originalId;
  return delegateId;
}

export function payrollApproverIds(
  candidates: string[],
  preparerId: string,
  delegations: DelegationWindow[],
  today: string,
): string[] {
  const chosen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || candidate === preparerId) continue;
    const delegation = delegations.find((row) => row.fromUserId === candidate && delegationActive(row, "PAYROLL", today));
    if (delegation) {
      if (canApprovePayroll(delegation.toUserId, preparerId)) chosen.add(delegation.toUserId);
      continue;
    }
    if (canApprovePayroll(candidate, preparerId)) chosen.add(candidate);
  }
  return [...chosen];
}

export function hhmmToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function lateMinutes(clockIn: string, shiftStart: string, grace: number): number {
  let diff = hhmmToMinutes(clockIn) - hhmmToMinutes(shiftStart);
  if (diff < -12 * 60) diff += 1440;
  if (diff < 0) return 0;
  return Math.max(0, diff - grace);
}

function span(start: string, end: string): [number, number] {
  const from = hhmmToMinutes(start);
  let to = hhmmToMinutes(end);
  if (to <= from) to += 1440;
  return [from, to];
}

function overlapMinutes(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

export function validOvertimeMinutes(input: {
  requestStart: string;
  requestEnd: string;
  shiftStart: string;
  shiftEnd: string;
  clockIn: string;
  clockOut: string;
  allowBefore: boolean;
  allowAfter: boolean;
  roundingMinutes: number;
  maxHoursPerDay: number;
}): { minutes: number; status: "PENDING_REVIEW" | "NEEDS_CHECK"; reason: string } {
  if (!input.clockIn || !input.clockOut) {
    return { minutes: 0, status: "NEEDS_CHECK", reason: "Attendance clock-in and clock-out are both required before overtime can be validated." };
  }
  const requested = span(input.requestStart, input.requestEnd);
  const actual = span(input.clockIn, input.clockOut);
  const shift = span(input.shiftStart, input.shiftEnd);
  const shared: [number, number] = [Math.max(requested[0], actual[0]), Math.min(requested[1], actual[1])];
  let minutes = 0;
  if (input.allowBefore) minutes += overlapMinutes(shared, [shift[0] - 1440, shift[0]]);
  if (input.allowAfter) minutes += overlapMinutes(shared, [shift[1], shift[1] + 1440]);
  const rounding = Math.max(1, input.roundingMinutes);
  minutes = Math.floor(minutes / rounding) * rounding;
  if (input.maxHoursPerDay > 0) minutes = Math.min(minutes, Math.round(input.maxHoursPerDay * 60));
  if (minutes <= 0) {
    return { minutes: 0, status: "NEEDS_CHECK", reason: "Actual attendance does not cover payable overtime under the current policy." };
  }
  return { minutes, status: "PENDING_REVIEW", reason: "" };
}

export function compensationIdr(validMinutes: number, basicSalary: number, hourlyDivisor: number, multiplier: number): number {
  if (validMinutes <= 0 || basicSalary <= 0 || hourlyDivisor <= 0 || multiplier <= 0) return 0;
  return Math.round((validMinutes / 60) * (basicSalary / hourlyDivisor) * multiplier);
}

export function compensationAmount(input: { validMinutes: number; basicSalary: number; hourlyDivisor: number; multiplier: number; payMethod?: string; fixedHourlyRate?: number }): number {
  const hourly = input.fixedHourlyRate ?? 0;
  if (hourly > 0) {
    if (input.validMinutes <= 0) return 0;
    return Math.round((input.validMinutes / 60) * hourly);
  }
  return compensationIdr(input.validMinutes, input.basicSalary, input.hourlyDivisor, input.multiplier);
}

export function fullPayrollColumn(line: { name: string; kind: string }): string {
  if (line.kind === "INFO") return "";
  if (line.kind === "INCENTIVE") return "A21";
  const name = line.name.toLowerCase();
  if (line.kind === "EARNING") {
    if (name.includes("basic salary") || name.includes("gaji pokok")) return "A01";
    if (name.includes("transport") || name.includes("makan")) return "A03";
    if (name.includes("motor")) return "A06";
    if (name.includes("marketing")) return "A08";
    if (name.includes("jabatan")) return "A21";
    if (name.includes("pajak") || name.includes("tax allowance")) return "B03";
    if (name.includes("overtime") || name.includes("lembur")) return "L01";
    return "TUL";
  }
  if (name.includes("unpaid") || name.includes("alpha")) return "D01";
  if (name.includes("late") || name.includes("keterlambatan")) return "D02";
  if (name.includes("jht") && !name.includes("employer") && !name.includes("pemberi")) return "D03";
  if (name.includes("jp") && !name.includes("employer") && !name.includes("pemberi")) return "D05";
  if (name.includes("kesehatan") && !name.includes("employer") && !name.includes("pemberi")) return "D07";
  if (name.includes("pph")) return "D09";
  if (name.includes("ganti rugi")) return "PG";
  if (name.includes("loan") || name.includes("pinjaman")) return "PP";
  return "PTL1";
}

export function lateDeductionAmount(lateMinutes: number, amountPerInterval: number, intervalMinutes = 1, capEnabled = false, dailyMax = 0): number {
  if (lateMinutes <= 0 || amountPerInterval <= 0) return 0;
  const interval = Math.max(1, intervalMinutes);
  const raw = Math.floor(lateMinutes / interval) * amountPerInterval;
  if (!capEnabled || dailyMax <= 0) return raw;
  return Math.min(raw, dailyMax);
}

export function calendarDaysBetween(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

export function overtimeWithinSubmitWindow(workDate: string, today: string, enabled: boolean, maxDays: number): boolean {
  if (!enabled) return true;
  const days = calendarDaysBetween(workDate, today);
  if (!Number.isFinite(days) || days < 0) return true;
  return days <= Math.max(0, maxDays);
}

export function locationCheck(input: { lat: number; lng: number; accuracy: number | null; distanceMeters: number | null; radiusMeters: number }): "CLEAR" | "SUSPECTED" | "UNVERIFIED" {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return "UNVERIFIED";
  if (input.accuracy == null || !Number.isFinite(input.accuracy)) return "UNVERIFIED";
  if (input.accuracy <= 0) return "SUSPECTED";
  if (input.accuracy > 100) return "UNVERIFIED";
  if (input.radiusMeters > 0 && input.distanceMeters != null && input.distanceMeters > input.radiusMeters) return "SUSPECTED";
  return "CLEAR";
}

export function employmentFactor(input: {
  prorate: boolean;
  periodStart: string;
  periodEnd: string;
  joinDate: string;
  lastWorkingDay: string;
}): number | null {
  const start = input.joinDate && input.joinDate > input.periodStart ? input.joinDate : input.periodStart;
  const end = input.lastWorkingDay && input.lastWorkingDay < input.periodEnd ? input.lastWorkingDay : input.periodEnd;
  if (!input.joinDate || input.joinDate > input.periodEnd || end < start) return null;
  if (!input.prorate) return 1;
  const periodDays = inclusiveDays(input.periodStart, input.periodEnd);
  if (periodDays <= 0) return null;
  return inclusiveDays(start, end) / periodDays;
}

export function payslipCanOpen(input: { published: boolean; owner: boolean; passwordOk: boolean }): boolean {
  return input.published && input.owner && input.passwordOk;
}

export function attendanceCorrectionAllowed(periodStatus: string | null): boolean {
  return periodStatus !== "LOCKED";
}

export type RuleDefinition = {
  applyStatutoryOnExtra: boolean;
  bpjs: {
    kesEmployee: number;
    kesEmployer: number;
    kesCap: number;
    jhtEmployee: number;
    jhtEmployer: number;
    jpEmployee: number;
    jpEmployer: number;
    jpCap: number;
    jkmEmployer: number;
    jkkByClass: number[];
  };
  ptkpAnnual: Record<string, number>;
  progressiveAnnual: { upTo: number | null; rate: number }[];
};

export type PayLine = { name: string; kind: "EARNING" | "DEDUCTION" | "INFO" | "INCENTIVE"; amount: number };

export type PayResult = {
  lines: PayLine[];
  gross: number;
  deduction: number;
  net: number;
  pph21: number;
  bpjsEmployee: number;
  bpjsEmployer: number;
  warnings: string[];
};

function money(value: number): number {
  return Math.round(value);
}

export function progressiveAnnualTax(taxable: number, brackets: { upTo: number | null; rate: number }[]): number {
  if (taxable <= 0) return 0;
  let remaining = taxable;
  let previous = 0;
  let tax = 0;
  for (const bracket of brackets) {
    const spanWidth = bracket.upTo == null ? remaining : Math.max(0, Math.min(remaining, bracket.upTo - previous));
    tax += spanWidth * bracket.rate;
    remaining -= spanWidth;
    previous = bracket.upTo ?? previous;
    if (remaining <= 0) break;
  }
  return tax;
}

export function calculatePay(input: {
  kind: "REGULAR" | "THR" | "BONUS" | "ADJUSTMENT";
  basicSalary: number;
  factor: number;
  components: { name: string; kind: "EARNING" | "DEDUCTION"; calc: "FIXED" | "PERCENT_BASIC"; amount: number }[];
  overtimeIdr: number;
  unpaidLeaveDays: number;
  workdaysInPeriod: number;
  lateMinutes: number;
  lateDeductionPerMinute: number;
  lateDaysMinutes?: number[];
  lateIntervalMinutes?: number;
  lateCapEnabled?: boolean;
  lateDailyMax?: number;
  adjustments: { name: string; kind: "EARNING" | "DEDUCTION" | "INCENTIVE"; amount: number }[];
  thrAmount: number;
  bonusAmount: number;
  ptkp: string;
  rule: RuleDefinition;
  jkkClass: number;
  bpjsKesEnabled: boolean;
  includeOvertime: boolean;
  enrollment?: { jkn: boolean; jht: boolean; jkk: boolean; jkm: boolean; jp: boolean };
  employmentType?: string;
  periodStart?: string;
  periodEnd?: string;
  lastWorkingDay?: string;
  priorGross?: number;
  priorPph?: number;
  priorMonths?: number;
  priorPension?: number;
  sameMonthGross?: number;
  sameMonthPph?: number;
  sameMonthKnown?: boolean;
}): PayResult {
  const lines: PayLine[] = [];
  const warnings: string[] = [];
  const basic = money(input.basicSalary * input.factor);
  if (input.kind === "REGULAR") {
    lines.push({ name: "Basic salary", kind: "EARNING", amount: basic });
    for (const component of input.components) {
      const amount = component.calc === "PERCENT_BASIC" ? money(basic * (component.amount / 100)) : component.amount;
      lines.push({ name: component.name, kind: component.kind, amount });
    }
    if (input.overtimeIdr > 0) lines.push({ name: "Reviewed overtime", kind: "EARNING", amount: input.overtimeIdr });
    if (input.unpaidLeaveDays > 0) {
      if (input.workdaysInPeriod <= 0 || basic <= 0) warnings.push("Unpaid leave was not priced because the working-day or salary base is zero.");
      else lines.push({ name: "Unpaid leave", kind: "DEDUCTION", amount: money((basic / input.workdaysInPeriod) * input.unpaidLeaveDays) });
    }
    const lateDays = input.lateDaysMinutes ?? (input.lateMinutes > 0 ? [input.lateMinutes] : []);
    const lateAmount = lateDays.reduce((sum, minutes) => sum + lateDeductionAmount(minutes, input.lateDeductionPerMinute, input.lateIntervalMinutes ?? 1, input.lateCapEnabled ?? false, input.lateDailyMax ?? 0), 0);
    if (lateAmount > 0) lines.push({ name: "Late deduction", kind: "DEDUCTION", amount: lateAmount });
  }
  if (input.kind === "THR" && input.thrAmount > 0) lines.push({ name: "THR", kind: "EARNING", amount: input.thrAmount });
  if (input.kind === "BONUS" && input.bonusAmount > 0) lines.push({ name: "Bonus", kind: "EARNING", amount: input.bonusAmount });
  for (const adjustment of input.adjustments) lines.push({ name: adjustment.name, kind: adjustment.kind, amount: adjustment.amount });

  const earnings = lines.filter((line) => line.kind === "EARNING" || line.kind === "INCENTIVE").reduce((sum, line) => sum + line.amount, 0);
  let wageBase = 0;
  if (input.kind === "REGULAR") {
    wageBase = basic + input.components.filter((row) => row.kind === "EARNING" && row.calc === "FIXED").reduce((sum, row) => sum + row.amount, 0);
    wageBase += input.components
      .filter((row) => row.kind === "EARNING" && row.calc === "PERCENT_BASIC")
      .reduce((sum, row) => sum + money(basic * (row.amount / 100)), 0);
    if (input.includeOvertime) wageBase += input.overtimeIdr;
  } else if (input.kind === "THR") wageBase = input.thrAmount;
  else if (input.kind === "BONUS") wageBase = input.bonusAmount;

  const applyStatutory = input.kind === "REGULAR" || ((input.kind === "THR" || input.kind === "BONUS") && input.rule.applyStatutoryOnExtra);
  let bpjsEmployee = 0;
  let bpjsEmployer = 0;
  if (applyStatutory && wageBase > 0) {
    const rule = input.rule.bpjs;
    const kesBase = Math.min(wageBase, rule.kesCap);
    const jpBase = Math.min(wageBase, rule.jpCap);
    const classIndex = Math.min(Math.max(input.jkkClass, 1), rule.jkkByClass.length) - 1;
    const enrolled = input.enrollment;
    const jknOn = enrolled ? enrolled.jkn : input.bpjsKesEnabled;
    const jhtOn = enrolled ? enrolled.jht : true;
    const jpOn = enrolled ? enrolled.jp : true;
    const jkmOn = enrolled ? enrolled.jkm : true;
    const jkkOn = enrolled ? enrolled.jkk : true;
    if (jknOn) {
      const employee = money(kesBase * rule.kesEmployee);
      const employer = money(kesBase * rule.kesEmployer);
      bpjsEmployee += employee;
      bpjsEmployer += employer;
      lines.push({ name: "BPJS Kesehatan (employee)", kind: "DEDUCTION", amount: employee });
      lines.push({ name: "BPJS Kesehatan (employer)", kind: "INFO", amount: employer });
    }
    const jhtEmployee = jhtOn ? money(wageBase * rule.jhtEmployee) : 0;
    const jhtEmployer = jhtOn ? money(wageBase * rule.jhtEmployer) : 0;
    const jpEmployee = jpOn ? money(jpBase * rule.jpEmployee) : 0;
    const jpEmployer = jpOn ? money(jpBase * rule.jpEmployer) : 0;
    const jkm = jkmOn ? money(wageBase * rule.jkmEmployer) : 0;
    const jkk = jkkOn ? money(wageBase * rule.jkkByClass[classIndex]) : 0;
    bpjsEmployee += jhtEmployee + jpEmployee;
    bpjsEmployer += jhtEmployer + jpEmployer + jkm + jkk;
    if (jhtOn) lines.push({ name: "JHT (employee)", kind: "DEDUCTION", amount: jhtEmployee });
    if (jpOn) lines.push({ name: "JP (employee)", kind: "DEDUCTION", amount: jpEmployee });
    if (jhtOn) lines.push({ name: "JHT (employer)", kind: "INFO", amount: jhtEmployer });
    if (jpOn) lines.push({ name: "JP (employer)", kind: "INFO", amount: jpEmployer });
    if (jkmOn) lines.push({ name: "JKM (employer)", kind: "INFO", amount: jkm });
    if (jkkOn) lines.push({ name: "JKK (employer)", kind: "INFO", amount: jkk });
  }

  let pph21 = 0;
  if (applyStatutory) {
    const pensionThisPeriod = lines.find((line) => line.name === "JP (employee)")?.amount ?? 0;
    const withheld = withholdPph21({
      kind: input.kind,
      earnings,
      ptkpStatus: input.ptkp,
      ptkpAnnual: input.rule.ptkpAnnual,
      brackets: input.rule.progressiveAnnual,
      pensionThisPeriod,
      employmentType: input.employmentType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lastWorkingDay: input.lastWorkingDay,
      priorGross: input.priorGross,
      priorPph: input.priorPph,
      priorMonths: input.priorMonths,
      priorPension: input.priorPension,
      sameMonthGross: input.sameMonthGross,
      sameMonthPph: input.sameMonthPph,
      sameMonthKnown: input.sameMonthKnown,
    });
    warnings.push(...withheld.warnings);
    pph21 = withheld.amount;
    if (pph21 !== 0) lines.push({ name: "PPh 21", kind: "DEDUCTION", amount: pph21 });
  }

  const deduction = lines.filter((line) => line.kind === "DEDUCTION").reduce((sum, line) => sum + line.amount, 0);
  return {
    lines,
    gross: earnings,
    deduction,
    net: earnings - deduction,
    pph21,
    bpjsEmployee,
    bpjsEmployer,
    warnings,
  };
}

export function onboardingGaps(input: {
  fullName: string;
  employeeCode: string;
  email: string;
  departmentId: string;
  positionId: string;
  branchId: string;
  locationId: string;
  joinDate: string;
  employmentType: string;
  managerId: string;
  requireManager: boolean;
}): string[] {
  const gaps: string[] = [];
  if (!input.fullName.trim()) gaps.push("Full name");
  if (!input.employeeCode.trim()) gaps.push("Employee ID");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) gaps.push("Work email");
  if (!input.departmentId) gaps.push("Department");
  if (!input.positionId) gaps.push("Position");
  if (!input.branchId) gaps.push("Branch");
  if (!input.locationId) gaps.push("Work location");
  if (!input.joinDate) gaps.push("Join date");
  if (!input.employmentType) gaps.push("Employment type");
  if (input.requireManager && !input.managerId) gaps.push("Direct supervisor");
  return gaps;
}

export const SENSITIVE_PROFILE_FIELDS = ["fullName", "email", "nik", "npwp", "ptkp", "bankName", "bankAccount", "basicSalary"] as const;
export const DIRECT_PROFILE_FIELDS = ["phone", "address", "emergencyName", "emergencyPhone", "birthDate"] as const;

export function isSensitiveProfileField(field: string): boolean {
  return (SENSITIVE_PROFILE_FIELDS as readonly string[]).includes(field);
}

const RATE_KEYS = ["kesEmployee", "kesEmployer", "jhtEmployee", "jhtEmployer", "jpEmployee", "jpEmployer", "jkmEmployer"] as const;
const CAP_KEYS = ["kesCap", "jpCap"] as const;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function ruleError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  const rule = value as RuleDefinition;
  if (typeof rule.applyStatutoryOnExtra !== "boolean" || !rule.bpjs || typeof rule.bpjs !== "object") return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  for (const key of RATE_KEYS) {
    const rate = rule.bpjs[key];
    if (!finiteNumber(rate) || rate < 0 || rate > 1) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  }
  for (const key of CAP_KEYS) {
    const cap = rule.bpjs[key];
    if (!finiteNumber(cap) || cap < 0) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  }
  if (!Array.isArray(rule.bpjs.jkkByClass) || rule.bpjs.jkkByClass.length !== 5 || rule.bpjs.jkkByClass.some((rate) => !finiteNumber(rate) || rate < 0 || rate > 1)) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  if (!rule.ptkpAnnual || typeof rule.ptkpAnnual !== "object" || Array.isArray(rule.ptkpAnnual)) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  const ptkp = Object.values(rule.ptkpAnnual);
  if (ptkp.length === 0 || ptkp.some((amount) => !finiteNumber(amount) || amount < 0)) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  if (!Array.isArray(rule.progressiveAnnual) || rule.progressiveAnnual.length === 0) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  for (const bracket of rule.progressiveAnnual) {
    if (!bracket || !finiteNumber(bracket.rate) || bracket.rate < 0 || bracket.rate > 1) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
    if (bracket.upTo != null && (!finiteNumber(bracket.upTo) || bracket.upTo < 0)) return "The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.";
  }
  return null;
}

function ruleUsable(rule: { status: string; active: boolean; approvalStatus?: string }) {
  const approval = rule.approvalStatus || "";
  if (!rule.active) return false;
  if (approval === "DRAFT" || approval === "PENDING_REVIEW" || approval === "REJECTED") return false;
  if (approval === "APPROVED") return true;
  return rule.status === "VALIDATED";
}

export function ruleForDate<T extends { id: string; effectiveFrom: string; status: string; active: boolean; approvalStatus?: string }>(rules: T[], date: string): T | null {
  const dated = rules.filter((rule) => rule.effectiveFrom <= date && ruleUsable(rule));
  const approved = dated.filter((rule) => rule.approvalStatus === "APPROVED");
  const pool = approved.length ? approved : dated;
  pool.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || right.id.localeCompare(left.id));
  return pool[0] ?? null;
}

export function ruleDiff(before: RuleDefinition, after: RuleDefinition): { field: string; before: string; after: string }[] {
  const rows: { field: string; before: string; after: string }[] = [];
  const add = (field: string, left: string, right: string) => { if (left !== right) rows.push({ field, before: left, after: right }); };
  add("applyStatutoryOnExtra", String(before.applyStatutoryOnExtra), String(after.applyStatutoryOnExtra));
  for (const key of [...RATE_KEYS, ...CAP_KEYS]) add(key, String(before.bpjs[key]), String(after.bpjs[key]));
  add("jkkByClass", before.bpjs.jkkByClass.join(","), after.bpjs.jkkByClass.join(","));
  for (const key of [...new Set([...Object.keys(before.ptkpAnnual), ...Object.keys(after.ptkpAnnual)])]) add(`PTKP ${key}`, String(before.ptkpAnnual[key] ?? ""), String(after.ptkpAnnual[key] ?? ""));
  add("brackets", JSON.stringify(before.progressiveAnnual), JSON.stringify(after.progressiveAnnual));
  return rows;
}

export const SAMPLE_RULE: RuleDefinition = {
  applyStatutoryOnExtra: true,
  bpjs: {
    kesEmployee: 0.01,
    kesEmployer: 0.04,
    kesCap: 12_000_000,
    jhtEmployee: 0.02,
    jhtEmployer: 0.037,
    jpEmployee: 0.01,
    jpEmployer: 0.02,
    jpCap: 10_042_300,
    jkmEmployer: 0.003,
    jkkByClass: [0.0024, 0.0054, 0.0089, 0.0127, 0.0174],
  },
  ptkpAnnual: {
    "TK/0": 54_000_000,
    "TK/1": 58_500_000,
    "TK/2": 63_000_000,
    "TK/3": 67_500_000,
    "K/0": 58_500_000,
    "K/1": 63_000_000,
    "K/2": 67_500_000,
    "K/3": 72_000_000,
  },
  progressiveAnnual: [
    { upTo: 60_000_000, rate: 0.05 },
    { upTo: 250_000_000, rate: 0.15 },
    { upTo: 500_000_000, rate: 0.25 },
    { upTo: 5_000_000_000, rate: 0.3 },
    { upTo: null, rate: 0.35 },
  ],
};
