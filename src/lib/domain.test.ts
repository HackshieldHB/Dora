import { describe, expect, it } from "vitest";
import { LEAVE_CATALOG } from "./leave-catalog";
import {
  attendanceCorrectionAllowed,
  calendarDays,
  calculatePay,
  canApprovePayroll,
  compensationAmount,
  fullPayrollColumn,
  compensationIdr,
  lateDeductionAmount,
  locationCheck,
  overtimeWithinSubmitWindow,
  countLeaveDays,
  employmentFactor,
  lateMinutes,
  leaveCancelMode,
  addMonths,
  daysUntilMonthDay,
  distanceMeters,
  outsideWorkplace,
  coordinateError,
  offsiteClockError,
  travelDateError,
  travelDayError,
  normalizeNpwp,
  cappedLeaveAllowance,
  cappedLeaveRemaining,
  leaveRemaining,
  withinComingDays,
  loanInstallment,
  serviceMonths,
  clockOutIsEarly,
  halfDayTimeError,
  planEmployeeImport,
  policyEntitled,
  shiftCrossesMidnight,
  shiftLengthLabel,
  onboardingGaps,
  passwordError,
  payrollApproverIds,
  payslipCanOpen,
  resolveAssignee,
  SAMPLE_RULE,
  ruleDiff,
  ruleError,
  ruleForDate,
  validOvertimeMinutes,
  widgetsFor,
} from "./domain";

const policy = { minLength: 8, requireUpper: true, requireLower: true, requireDigit: true };

describe("access and dashboard", () => {
  it("keeps company payroll off the employee layout", () => {
    const widgets = widgetsFor("employee", ["overview.view", "payroll.view", "payroll.self", "attendance.self", "leave.self"]);
    expect(widgets).not.toContain("payroll_summary");
    expect(widgets).toContain("latest_payslip");
    expect(widgets).toContain("my_attendance");
  });

  it("uses the standard layout and hides widgets without permission", () => {
    const widgets = widgetsFor("standard", ["overview.view", "employees.view", "attendance.view"]);
    expect(widgets).toContain("employee_summary");
    expect(widgets).not.toContain("payroll_summary");
    expect(widgets).not.toContain("my_attendance");
  });

  it("opens a payslip only for the owner after publish and password", () => {
    expect(payslipCanOpen({ published: true, owner: true, passwordOk: true })).toBe(true);
    expect(payslipCanOpen({ published: false, owner: true, passwordOk: true })).toBe(false);
    expect(payslipCanOpen({ published: true, owner: false, passwordOk: true })).toBe(false);
    expect(payslipCanOpen({ published: true, owner: true, passwordOk: false })).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(passwordError("Dora#2026", policy)).toBeNull();
    expect(passwordError("short1A", policy)).toMatch(/at least 8/);
    expect(passwordError("dora2026", policy)).toMatch(/uppercase/);
  });
});

describe("payroll approval", () => {
  it("rejects self approval, including a delegation that points back to the preparer", () => {
    expect(canApprovePayroll("andi", "andi")).toBe(false);
    expect(canApprovePayroll("dewi", "andi")).toBe(true);
    expect(canApprovePayroll("", "andi")).toBe(false);
    const today = "2026-11-04";
    const delegation = { fromUserId: "dewi", toUserId: "andi", modules: ["PAYROLL"], startDate: "2026-11-01", endDate: "2026-11-30", active: true };
    expect(payrollApproverIds(["andi", "dewi"], "andi", [delegation], today)).toEqual([]);
    const toCici = { ...delegation, toUserId: "cici" };
    expect(payrollApproverIds(["andi", "dewi"], "andi", [toCici], today)).toEqual(["cici"]);
  });

  it("does not let a requester become the assignee through delegation", () => {
    expect(resolveAssignee("manager", "employee", "employee")).toBe("manager");
    expect(resolveAssignee("manager", "delegate", "employee")).toBe("delegate");
  });
});

describe("leave and attendance", () => {
  const workdays = [1, 2, 3, 4, 5];

  it("counts working days and excludes weekends and holidays", () => {
    expect(countLeaveDays({ start: "2026-11-07", end: "2026-11-08", halfDay: false, workdays, holidays: [] })).toBe(0);
    expect(countLeaveDays({ start: "2026-11-09", end: "2026-11-11", halfDay: false, workdays, holidays: [] })).toBe(3);
    expect(countLeaveDays({ start: "2026-11-09", end: "2026-11-11", halfDay: false, workdays, holidays: ["2026-11-11"] })).toBe(2);
    expect(countLeaveDays({ start: "2026-11-09", end: "2026-11-09", halfDay: true, workdays, holidays: [] })).toBe(0.5);
  });

  it("cancels an approved leave directly only before it starts", () => {
    expect(leaveCancelMode("APPROVED", "2026-11-10", "2026-11-04")).toBe("DIRECT");
    expect(leaveCancelMode("APPROVED", "2026-11-04", "2026-11-04")).toBe("HR");
    expect(leaveCancelMode("PENDING", "2026-11-10", "2026-11-04")).toBe("NONE");
  });

  it("expires and carries leave according to policy", () => {
    expect(leaveRemaining({ mode: "UPFRONT", entitled: 12, used: 3, carryIn: 2, expiryMonth: 0, asOf: "2026-11-04" })).toBe(11);
    expect(leaveRemaining({ mode: "UPFRONT", entitled: 12, used: 0, carryIn: 0, expiryMonth: 3, asOf: "2026-11-04" })).toBe(0);
    expect(leaveRemaining({ mode: "NONE", entitled: 0, used: 0, carryIn: 0, expiryMonth: 0, asOf: "2026-11-04" })).toBe(Number.POSITIVE_INFINITY);
    expect(leaveRemaining({ mode: "UPFRONT", entitled: 12, used: 0, carryIn: 0, expiryMonth: 0, expiryDate: "2026-06-30", asOf: "2026-11-04" })).toBe(0);
    expect(policyEntitled({ mode: "ACCRUAL", quotaDays: 12, quotaPeriod: "YEARLY", accrualRate: 1, asOf: "2026-11-04" })).toBe(11);
    expect(policyEntitled({ mode: "UPFRONT", quotaDays: 12, quotaPeriod: "YEARLY", accrualRate: 0, asOf: "2026-11-04" })).toBe(12);
    expect(policyEntitled({ mode: "NONE", quotaDays: 0, quotaPeriod: "YEARLY", accrualRate: 0, asOf: "2026-11-04" })).toBe(Number.POSITIVE_INFINITY);
    expect(cappedLeaveAllowance({ balanceMode: "NONE", quotaDays: 2, maxCalendarDays: 0 })).toEqual({ entitled: 2, calendar: false });
    expect(cappedLeaveAllowance({ balanceMode: "NONE", quotaDays: 0, maxCalendarDays: 92 })).toEqual({ entitled: 92, calendar: true });
    expect(cappedLeaveAllowance({ balanceMode: "NONE", quotaDays: 0, maxCalendarDays: 0 })).toBeNull();
    expect(cappedLeaveAllowance({ balanceMode: "UPFRONT", quotaDays: 12, maxCalendarDays: 0 })).toBeNull();
    expect(cappedLeaveRemaining(92, 40)).toBe(52);
    expect(cappedLeaveRemaining(2, 0)).toBe(2);
    expect(cappedLeaveRemaining(2, 3)).toBe(0);
    expect(shiftCrossesMidnight("22:00", "06:00")).toBe(true);
    expect(shiftCrossesMidnight("08:00", "17:00")).toBe(false);
    expect(shiftLengthLabel("08:00", "17:00")).toBe("9 hours");
    expect(shiftLengthLabel("22:00", "06:00")).toBe("8 hours");
    expect(halfDayTimeError({ start: "13:00", end: "17:00", shiftStart: "08:00", shiftEnd: "17:00", crosses: false })).toBeNull();
    expect(halfDayTimeError({ start: "17:00", end: "13:00", shiftStart: "08:00", shiftEnd: "17:00", crosses: false })).toBe("End time must be after the start time.");
    expect(halfDayTimeError({ start: "07:00", end: "12:00", shiftStart: "08:00", shiftEnd: "17:00", crosses: false })).toBe("The half day must fall inside the working shift.");
    expect(halfDayTimeError({ start: "23:00", end: "02:00", shiftStart: "22:00", shiftEnd: "06:00", crosses: true })).toBeNull();
    expect(clockOutIsEarly({ clockOut: "13:00", shiftStart: "08:00", shiftEnd: "17:00", crosses: false, leaveStart: "13:00", leaveEnd: "17:00" })).toBe(false);
    expect(clockOutIsEarly({ clockOut: "12:00", shiftStart: "08:00", shiftEnd: "17:00", crosses: false, leaveStart: "13:00", leaveEnd: "17:00" })).toBe(true);
    expect(clockOutIsEarly({ clockOut: "16:00", shiftStart: "08:00", shiftEnd: "17:00", crosses: false })).toBe(true);
    const planned = planEmployeeImport(
      [
        { row: 2, code: "EMP-10", name: "Yantofa Osas", department: "Field Operations", branch: "Bandung", location: "Site Bandung", position: "" },
        { row: 3, code: "EMP-001", name: "Sari", department: "Finance", branch: "Jakarta HQ", location: "", position: "" },
        { row: 4, code: "EMP-10", name: "Copy", department: "HR", branch: "Jakarta HQ", location: "", position: "" },
        { row: 5, code: "", name: "No ID", department: "", branch: "", location: "", position: "" },
      ],
      { departments: ["Field Operations", "Finance", "HR"], branches: ["Bandung", "Jakarta HQ"], locations: ["Site Bandung"], positions: [], existing: ["EMP-001"] },
    );
    expect(planned.map((row) => row.kind)).toEqual(["invalid", "invalid", "invalid", "invalid"]);
    expect(planned[1].reason).toBe("This employee ID is already registered.");
    expect(planned[3].reason).toBe("Employee ID is required.");
    expect(shiftLengthLabel("08:00", "08:00")).toBe("Unclear");
  });

  it("measures lateness across midnight and blocks locked-payroll correction", () => {
    expect(lateMinutes("22:10", "22:00", 0)).toBe(10);
    expect(lateMinutes("21:50", "22:00", 0)).toBe(0);
    expect(lateMinutes("00:10", "22:00", 0)).toBe(130);
    expect(lateMinutes("08:20", "08:00", 5)).toBe(15);
    expect(attendanceCorrectionAllowed("LOCKED")).toBe(false);
    expect(attendanceCorrectionAllowed("PROCESSED")).toBe(true);
    expect(attendanceCorrectionAllowed(null)).toBe(true);
  });

  it("validates overtime against the actual clock interval", () => {
    const base = {
      requestStart: "18:00",
      requestEnd: "21:00",
      shiftStart: "08:00",
      shiftEnd: "17:00",
      allowBefore: false,
      allowAfter: true,
      roundingMinutes: 1,
      maxHoursPerDay: 0,
    };
    expect(validOvertimeMinutes({ ...base, clockIn: "08:00", clockOut: "20:00" })).toMatchObject({ minutes: 120, status: "PENDING_REVIEW" });
    expect(validOvertimeMinutes({ ...base, clockIn: "08:00", clockOut: "" }).status).toBe("NEEDS_CHECK");
    expect(validOvertimeMinutes({ ...base, clockIn: "08:00", clockOut: "17:30" }).status).toBe("NEEDS_CHECK");
    expect(compensationIdr(120, 10_000_000, 173, 1.5)).toBe(Math.round(2 * (10_000_000 / 173) * 1.5));
    expect(compensationAmount({ validMinutes: 120, basicSalary: 1, hourlyDivisor: 1, multiplier: 1, fixedHourlyRate: 30_000 })).toBe(60_000);
    expect(compensationAmount({ validMinutes: 120, basicSalary: 10_000_000, hourlyDivisor: 173, multiplier: 1.5, payMethod: "FORMULA", fixedHourlyRate: 0 })).toBe(compensationIdr(120, 10_000_000, 173, 1.5));
  });

  it("caps a full late interval per day and limits overtime submission by calendar days", () => {
    expect(lateDeductionAmount(30, 10_000, 60, true, 30_000)).toBe(0);
    expect(lateDeductionAmount(60, 10_000, 60, true, 30_000)).toBe(10_000);
    expect(lateDeductionAmount(240, 10_000, 60, true, 30_000)).toBe(30_000);
    expect(lateDeductionAmount(240, 10_000, 60, false, 30_000)).toBe(40_000);
    expect(lateDeductionAmount(90, 1_000, 1, false, 0)).toBe(90_000);
    expect(overtimeWithinSubmitWindow("2026-11-10", "2026-11-13", true, 3)).toBe(true);
    expect(overtimeWithinSubmitWindow("2026-11-10", "2026-11-14", true, 3)).toBe(false);
    expect(overtimeWithinSubmitWindow("2026-11-10", "2026-11-14", false, 3)).toBe(true);
    expect(locationCheck({ lat: 1, lng: 1, accuracy: 12, distanceMeters: 10, radiusMeters: 50 })).toBe("CLEAR");
    expect(locationCheck({ lat: 1, lng: 1, accuracy: 0, distanceMeters: 10, radiusMeters: 50 })).toBe("SUSPECTED");
    expect(locationCheck({ lat: 1, lng: 1, accuracy: null, distanceMeters: null, radiusMeters: 0 })).toBe("UNVERIFIED");
  });
});

describe("payroll calculation", () => {
  it("matches the sample platform rule for a flat monthly salary", () => {
    const result = calculatePay({
      kind: "REGULAR",
      basicSalary: 10_000_000,
      factor: 1,
      components: [],
      overtimeIdr: 0,
      unpaidLeaveDays: 0,
      workdaysInPeriod: 22,
      lateMinutes: 0,
      lateDeductionPerMinute: 0,
      adjustments: [],
      thrAmount: 0,
      bonusAmount: 0,
      ptkp: "TK/0",
      rule: SAMPLE_RULE,
      jkkClass: 1,
      bpjsKesEnabled: true,
      includeOvertime: false,
    });
    expect(result.bpjsEmployee).toBe(400_000);
    expect(result.bpjsEmployer).toBe(1_024_000);
    expect(result.pph21).toBe(265_000);
    expect(result.gross).toBe(10_000_000);
    expect(result.deduction).toBe(665_000);
    expect(result.net).toBe(9_335_000);
    const withIncentive = calculatePay({
      ...{
        kind: "REGULAR" as const,
        basicSalary: 10_000_000,
        factor: 1,
        components: [],
        overtimeIdr: 0,
        unpaidLeaveDays: 0,
        workdaysInPeriod: 22,
        lateMinutes: 0,
        lateDeductionPerMinute: 0,
        adjustments: [{ name: "Insentif", kind: "INCENTIVE" as const, amount: 200_000 }],
        thrAmount: 0,
        bonusAmount: 0,
        ptkp: "TK/0",
        rule: SAMPLE_RULE,
        jkkClass: 1,
        bpjsKesEnabled: true,
        includeOvertime: false,
      },
    });
    expect(withIncentive.lines.filter((line) => line.kind === "INCENTIVE")).toEqual([{ name: "Insentif", kind: "INCENTIVE", amount: 200_000 }]);
    expect(withIncentive.gross).toBe(10_200_000);
    expect(withIncentive.bpjsEmployee).toBe(result.bpjsEmployee);
    expect(withIncentive.net).toBe(withIncentive.gross - withIncentive.deduction);
    expect(fullPayrollColumn({ name: "Insentif Client", kind: "INCENTIVE" })).toBe("A21");
    expect(fullPayrollColumn({ name: "Tunjangan Jabatan", kind: "EARNING" })).toBe("A21");
    expect(fullPayrollColumn({ name: "Insentif", kind: "EARNING" })).toBe("TUL");
  });

  it("prorates only when the company setting is on, and excludes people outside the period", () => {
    expect(employmentFactor({ prorate: false, periodStart: "2026-11-01", periodEnd: "2026-11-30", joinDate: "2026-11-16", lastWorkingDay: "" })).toBe(1);
    expect(employmentFactor({ prorate: true, periodStart: "2026-11-01", periodEnd: "2026-11-30", joinDate: "2026-11-16", lastWorkingDay: "" })).toBe(0.5);
    expect(employmentFactor({ prorate: true, periodStart: "2026-11-01", periodEnd: "2026-11-30", joinDate: "2026-12-01", lastWorkingDay: "" })).toBeNull();
  });

  it("uses the validated rule whose effective date covers the period", () => {
    const older = { id: "a", effectiveFrom: "2024-01-01", status: "VALIDATED", active: true };
    const newer = { id: "b", effectiveFrom: "2026-01-01", status: "VALIDATED", active: true };
    const draft = { id: "c", effectiveFrom: "2026-01-01", status: "DRAFT", active: false };
    const retired = { id: "d", effectiveFrom: "2026-06-01", status: "VALIDATED", active: false };
    const rules = [older, newer, draft, retired];
    expect(ruleForDate(rules, "2025-12-01")?.id).toBe("a");
    expect(ruleForDate(rules, "2026-03-01")?.id).toBe("b");
    expect(ruleForDate(rules, "2023-12-01")).toBeNull();
    expect(ruleError(SAMPLE_RULE)).toBeNull();
    expect(ruleError({ applyStatutoryOnExtra: true })).toBe("The statutory rule is missing a required rate, cap, PTKP amount, or tax bracket.");
  });

  it("uses an approved rule when one covers the period and keeps a pending rule out of calculation", () => {
    const sample = { id: "s", effectiveFrom: "2024-01-01", status: "VALIDATED", active: true, approvalStatus: "SAMPLE" };
    const pending = { id: "p", effectiveFrom: "2026-01-01", status: "VALIDATED", active: true, approvalStatus: "PENDING_REVIEW" };
    const approved = { id: "ok", effectiveFrom: "2026-06-01", status: "VALIDATED", active: true, approvalStatus: "APPROVED" };
    expect(ruleForDate([sample, pending], "2026-08-01")?.id).toBe("s");
    expect(ruleForDate([sample, pending, approved], "2026-08-01")?.id).toBe("ok");
    expect(ruleForDate([sample, pending, approved], "2026-03-01")?.id).toBe("s");
    const changed = { ...SAMPLE_RULE, bpjs: { ...SAMPLE_RULE.bpjs, kesEmployee: 0.02 } };
    expect(ruleDiff(SAMPLE_RULE, changed)).toEqual([{ field: "kesEmployee", before: "0.01", after: "0.02" }]);
  });
});

describe("Indonesian leave and loans", () => {
  it("keeps annual leave at 12 working days a year, not a month", () => {
    const annual = LEAVE_CATALOG.find((item) => item.name === "Annual leave");
    const monthly = LEAVE_CATALOG.find((item) => item.name === "Cuti haid");
    const maternity = LEAVE_CATALOG.find((item) => item.name === "Cuti melahirkan");
    expect(annual).toMatchObject({ quotaDays: 12, quotaPeriod: "YEARLY", minServiceMonths: 12 });
    expect(monthly).toMatchObject({ quotaDays: 2, quotaPeriod: "MONTHLY" });
    expect(maternity?.maxCalendarDays).toBe(92);
    expect(calendarDays("2026-03-01", "2026-05-31")).toBe(92);
    expect(serviceMonths("2025-06-02", "2026-06-01")).toBe(11);
    expect(serviceMonths("2025-06-02", "2026-06-02")).toBe(12);
    expect(loanInstallment(1_000_000, 3)).toBe(333_334);
    expect(addMonths("2026-08-07", 3)).toBe("2026-11-07");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(withinComingDays("2026-11-07", "2026-10-08", 30)).toBe(true);
    expect(withinComingDays("2026-11-07", "2026-11-08", 30)).toBe(false);
    expect(normalizeNpwp("12.345.678.9-012.345").value).toBe("12.345.678.9-012.345");
    expect(normalizeNpwp("1234567890123456").value).toHaveLength(16);
    expect(normalizeNpwp("123").error).toBeTruthy();
    expect(distanceMeters(-6.2, 106.8, -6.2, 106.8)).toBe(0);
    expect(distanceMeters(-6.2, 106.8, -6.21, 106.8)).toBeGreaterThan(1000);
    expect(outsideWorkplace(100, 100)).toBe(false);
    expect(outsideWorkplace(101, 100)).toBe(true);
    expect(coordinateError("", "")).toBe("");
    expect(coordinateError("-6.2", "")).toBe("Enter both latitude and longitude.");
    expect(coordinateError("south", "106.8")).toBe("Latitude and longitude must be numbers.");
    expect(coordinateError("91", "106.8")).toBe("Latitude must be between -90 and 90, and longitude between -180 and 180.");
    expect(coordinateError("-6.2", "106.8")).toBe("");
    expect(daysUntilMonthDay("2026-11-07", 11, 10)).toBe(3);
    expect(daysUntilMonthDay("2026-12-30", 1, 2)).toBe(3);
  });
});

describe("offsite attendance times", () => {
  it("requires clock-in, allows a missing clock-out, and follows an overnight shift", () => {
    expect(offsiteClockError("", "", false)).toBe("Clock-in time is required.");
    expect(offsiteClockError("08:00", "", false)).toBe("");
    expect(offsiteClockError("08:00", "17:00", false)).toBe("");
    expect(offsiteClockError("08:00", "07:00", false)).toBe("Clock-out cannot be earlier than clock-in on the same day.");
    expect(offsiteClockError("22:00", "06:00", true)).toBe("");
    expect(offsiteClockError("8:00", "", false)).toBe("Clock-in time is required.");
  });
});

describe("business travel dates", () => {
  it("requires a return date on or after the departure date and both clock times", () => {
    expect(travelDateError("2026-12-05", "2026-12-01")).toBe("The return date cannot be earlier than the departure date.");
    expect(travelDateError("2026-12-01", "2026-12-05")).toBe("");
    expect(travelDateError("01/12/2026", "2026-12-05")).toBe("Choose the departure and return dates.");
    expect(travelDayError("08:30", "17:00")).toBe("");
    expect(travelDayError("08:30", "")).toBe("Clock-out time is required.");
    expect(travelDayError("09:00", "08:00")).toBe("Clock-out cannot be earlier than clock-in on the same day.");
  });
});

describe("onboarding", () => {
  it("lists the missing activation fields without inventing a reviewer role", () => {
    expect(onboardingGaps({
      fullName: "Budi",
      employeeCode: "EMP-001",
      email: "budi@dora.local",
      departmentId: "",
      positionId: "pos",
      branchId: "br",
      locationId: "loc",
      joinDate: "2026-01-01",
      employmentType: "PERMANENT",
      managerId: "",
      requireManager: true,
    })).toEqual(["Department", "Direct supervisor"]);
  });
});
