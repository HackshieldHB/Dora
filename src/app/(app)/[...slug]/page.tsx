import { Tx, TInput, TTextarea } from "@/components/locale";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPerm, requireUser } from "@/lib/context";
import { lookups } from "@/server/lookups";
import { employeeWhere } from "@/server/scope";
import { ensureLeaveCatalog } from "@/server/leave-catalog";
import { formatIdr, currentMonth, formatLongDate, monthBounds, timeJakarta, todayJakarta } from "@/lib/format";
import { publicHolidays } from "@/lib/holidays";
import { ensureNationalHolidays } from "@/server/holidays";
import { YearCalendar } from "@/components/year-calendar";
import { permissionLabelList } from "@/lib/permissions";
import { ruleDiff, ruleForDate } from "@/lib/domain";
import { statutoryRuleLine } from "@/server/payroll";
import { PermissionGrid } from "@/components/permission-grid";
import { RoleAccessEditor } from "@/components/role-access-editor";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { TempPasswordNotice } from "@/components/temp-password-notice";
import { translate } from "@/lib/i18n";
import { Banner, PageTitle, Pipeline, Status } from "@/components/ui";
import { ApprovalHistory } from "@/components/approval-history";
import { BranchWorkspace } from "@/components/branch-workspace";
import { OrgWorkspace } from "@/components/org-workspace";
import { PayLines } from "@/components/pay-lines";
import { ChoiceButtons } from "@/components/choice-buttons";
import { canEditPayroll, canSubmitPayroll } from "@/lib/payroll-flow";
import { WorkflowBoard } from "@/components/workflow-board";

const STATUS_WORDS = new Set(["ACTIVE", "DRAFT", "PENDING OFFBOARDING", "INACTIVE", "PENDING", "APPROVED", "REJECTED", "RETURNED", "NEEDS_REVISION", "LOCKED", "PROCESSED", "SUBMITTED", "PRESENT", "LATE", "ABSENT", "EARLY", "APPROVED_LEAVE", "MISSING_CLOCK_OUT", "PENDING_REVIEW", "REVIEWED", "NEEDS_CHECK", "DISABLED", "CANCELLED", "CANCELED"]);
import { LeavePolicyEditor } from "@/components/leave-policy";
import { ShiftBoard } from "@/components/shift-board";
import {
  adjustmentAction, adjustmentPeriodAction, attendancePolicyAction, companyAction, componentAction,
  correctionAction, delegationAction, extraAction, finalizeAction, holidayAction, jointHolidayAction, leaveCancelDecisionAction, claimDecisionAction,
  leaveDecisionAction, leaveTypeAction, overtimeDecisionAction, overtimePolicyAction, overtimeReviewAction, deleteShiftAction, deleteScheduleAction,
  payrollDecisionAction, periodAction, platformRuleAction, processAction, profileDecisionAction, offsiteDecisionAction, loanDecisionAction, swapDecisionAction, timesheetDecisionAction,
  publishAction, resendPayslipAction, roleAction, scheduleAction, securityAction, shiftAction, statutoryAction, submitPayrollAction, checkRegulatoryAction, decideRuleAction,
  tenantAction, userAction,
} from "@/app/actions";

export default async function ModulePage({ params, searchParams }: { params: Promise<{ slug?: string[] }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUser();
  const { slug = [] } = await params;
  const query = await searchParams;
  const key = slug.join("/");
  const companyId = ctx.companyId || "";
  const data = companyId ? await lookups(companyId) : null;
  const banner = <Banner ok={query.ok} error={query.error} />;

  if (key === "organization" && hasPerm(ctx, "organization.view")) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    return <div><PageTitle title="Company Profile" />{banner}{company && hasPerm(ctx, "organization.manage") ? <form action={companyAction} className="card stack-form"><label className="field"><Tx text={"Name"} /><TInput name="name" defaultValue={company.name} /></label><label className="field"><Tx text={"Legal name"} /><TInput name="legalName" defaultValue={company.legalName} /></label><label className="field"><Tx text={"NPWP"} /><TInput name="npwp" defaultValue={company.npwp} /></label><label className="field"><Tx text={"Address"} /><TTextarea name="address" defaultValue={company.address} /></label><label className="field"><Tx text={"Phone"} /><TInput name="phone" defaultValue={company.phone} /></label><label className="field"><Tx text={"Email"} /><TInput name="email" defaultValue={company.email} /></label><label><TInput name="prorateSalary" type="checkbox" value="true" defaultChecked={company.prorateSalary} /> <Tx text={"Prorate basic salary by days employed in the period"} /></label><button className="btn"><Tx text={"Save"} /></button></form> : <div className="card facts"><div><dt><Tx text={"Name"} /></dt><dd>{company?.name}</dd></div><div><dt><Tx text={"Address"} /></dt><dd>{company?.address || "—"}</dd></div></div>}</div>;
  }
  if (key === "organization/branches" && data && hasPerm(ctx, "organization.view")) {
    return <div><PageTitle title="Branch & Work Location" subtitle="A branch is the parent. Each work location belongs to one branch." />{banner}<BranchWorkspace branches={data.branches} locations={data.locations} selectedId={query.branch || ""} canManage={hasPerm(ctx, "organization.manage")} /></div>;
  }
  if ((key === "organization/manage" || key === "organization/departments" || key === "organization/positions" || key === "organization/structure") && data && hasPerm(ctx, "organization.view")) {
    const tab = key.endsWith("positions") || query.tab === "positions" ? "positions" : key.endsWith("structure") || query.tab === "structure" ? "structure" : "divisions";
    return <div><PageTitle title="Organization Management" subtitle="Divisions, positions, and the reporting line stay separate. The chart reads the direct supervisor already stored for each person." />{banner}<OrgWorkspace tab={tab} locale={ctx.locale} canManage={hasPerm(ctx, "organization.manage")} departments={data.departments} positions={data.positions} people={data.employees.map((row) => ({ id: row.id, fullName: row.fullName, managerId: row.managerId, department: data.departments.find((item) => item.id === row.departmentId)?.name || "", position: data.positions.find((item) => item.id === row.positionId)?.name || "" }))} /></div>;
  }
  if (key === "attendance" && hasPerm(ctx, "attendance.view")) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await prisma.attendanceRecord.findMany({ where: { companyId, employee: employeeWhere(ctx), workDate: query.date || today }, include: { employee: true } });
    return <div><PageTitle title="Attendance Overview" subtitle="Daily figures use the selected date. Approved leave is not counted as absent." />{banner}<form className="toolbar"><label className="field"><Tx text={"Date"} /><TInput name="date" type="date" defaultValue={query.date || today} /></label><div className="toolbar-actions"><button className="btn"><Tx text={"Show day"} /></button></div></form><div className="card stat-card tone-blue">{translate(ctx.locale, "Records on")} {query.date || today}: {rows.length}</div><div className="card table-wrap"><table><thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Status"} /></th><th><Tx text={"In"} /></th><th><Tx text={"Out"} /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.employee.fullName}</td><td><Status value={row.status} /></td><td>{row.clockInAt}</td><td>{row.clockOutAt}</td></tr>)}</tbody></table></div></div>;
  }
  if (key === "attendance/records" && hasPerm(ctx, "attendance.view")) {
    const rows = await prisma.attendanceRecord.findMany({ where: { companyId, employee: employeeWhere(ctx), ...(query.date ? { workDate: query.date } : {}) }, include: { employee: true }, orderBy: { workDate: "desc" }, take: 100 });
    return <div><PageTitle title="Attendance Records" />{banner}<form className="toolbar"><label className="field"><Tx text={"Date"} /><TInput name="date" type="date" defaultValue={query.date || ""} /></label><div className="toolbar-actions"><button className="btn"><Tx text={"Apply"} /></button></div></form><div className="card table-wrap">{rows.length === 0 ? <p><Tx text={"No attendance records."} /></p> : <table><thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Employee"} /></th><th><Tx text={"Status"} /></th><th><Tx text={"In"} /></th><th><Tx text={"Out"} /></th><th><Tx text={"Where"} /></th><th><Tx text={"Reference"} /></th><th><Tx text={"Late"} /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.workDate}</td><td>{row.employee.fullName}</td><td>{row.source === "TRAVEL" ? <Status value="PRESENT" label="Present – Business travel" /> : <Status value={row.status} />}</td><td>{row.clockInAt}</td><td>{row.clockOutAt}</td><td>{row.source === "TRAVEL" ? <Tx text={"Business travel"} /> : row.shiftName || row.source}</td><td>{row.requestId || "—"}</td><td>{row.lateMinutes}</td></tr>)}</tbody></table>}</div></div>;
  }
  if (key === "attendance/schedules" && data && (hasPerm(ctx, "attendance.view") || hasPerm(ctx, "attendance.configure"))) {
    const schedules = await prisma.employeeSchedule.findMany({ where: { employee: { companyId } }, include: { employee: true, shift: true } });
    return <div><PageTitle title="Work Schedule & Shift" subtitle="Shift types and employee schedules are managed separately. A shift that ends the next morning stays one attendance record." />{banner}<ShiftBoard tab={query.tab === "shift" ? "shift" : "schedule"} canManage={hasPerm(ctx, "attendance.configure")} shifts={data.shifts} employees={data.employees.map((row) => ({ id: row.id, fullName: row.fullName }))} schedules={schedules.filter((row) => row.shift).map((row) => ({ id: row.id, employeeId: row.employeeId, employeeName: row.employee.fullName, dayOfWeek: row.dayOfWeek, shiftId: row.shiftId || "", shiftName: row.shift?.name || "", startTime: row.shift?.startTime || "", endTime: row.shift?.endTime || "", effectiveStart: row.effectiveStart, effectiveEnd: row.effectiveEnd }))} shiftAction={shiftAction} deleteShiftAction={deleteShiftAction} scheduleAction={scheduleAction} deleteScheduleAction={deleteScheduleAction} /></div>;
  }
  if (key === "attendance/corrections") {
    await requireView(ctx, "attendance.correct");
    const rows = await prisma.attendanceRecord.findMany({ where: { companyId, employee: employeeWhere(ctx), source: { not: "LEAVE" } }, include: { employee: true, corrections: true }, orderBy: { workDate: "desc" }, take: 40 });
    return <div><PageTitle title="Attendance Correction" subtitle="HR records the reason and the before/after values. A date inside a locked payroll period cannot be corrected here." />{banner}<div className="correction-list">{rows.map((row) => <form key={row.id} action={correctionAction} className="card"><TInput type="hidden" name="id" value={row.id} /><strong>{row.employee.fullName} · {row.workDate}</strong><p>{row.corrections.length} previous correction(s)</p><TInput name="clockInAt" type="time" defaultValue={row.clockInAt} /><TInput name="clockOutAt" type="time" defaultValue={row.clockOutAt} /><TInput name="reason" placeholder="Reason" required /><button className="btn"><Tx text={"Save correction"} /></button></form>)}</div></div>;
  }
  if (key === "attendance/policy" && (hasPerm(ctx, "attendance.view") || hasPerm(ctx, "attendance.configure"))) {
    const policy = companyId ? await prisma.attendancePolicy.findUnique({ where: { companyId } }) : null;
    return <div><PageTitle title="Attendance Policy" subtitle="Grace is a company setting. The default is zero because a grace period was not fixed in the concept." />{banner}<form action={attendancePolicyAction} className="card stack-form"><label className="field"><Tx text={"Grace minutes"} /><TInput name="graceMinutes" type="number" defaultValue={policy?.graceMinutes ?? 0} /></label><label className="field"><Tx text={"Late deduction per minute (IDR)"} /><TInput name="lateDeductionPerMinute" type="number" defaultValue={policy?.lateDeductionPerMinute ?? 0} /></label>{hasPerm(ctx, "attendance.configure") ? <button className="btn"><Tx text={"Save policy"} /></button> : null}</form></div>;
  }
  if (key === "attendance/holidays" && (hasPerm(ctx, "attendance.view") || hasPerm(ctx, "attendance.self") || hasPerm(ctx, "attendance.configure"))) {
    const year = Number(query.year) || Number(todayJakarta().slice(0, 4));
    if (companyId) await ensureNationalHolidays(prisma, companyId, year);
    const holidays = companyId ? await prisma.holiday.findMany({ where: { companyId, date: { gte: `${year}-01-01`, lte: `${year}-12-31` } }, orderBy: { date: "asc" } }) : [];
    const me = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null;
    const mates = me?.departmentId
      ? await prisma.employee.findMany({ where: { companyId, departmentId: me.departmentId }, select: { id: true } })
      : me ? [{ id: me.id }] : [];
    const leaveRows = mates.length === 0 ? [] : await prisma.leaveRequest.findMany({
      where: { employeeId: { in: mates.map((mate) => mate.id) }, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: `${year}-12-31` }, endDate: { gte: `${year}-01-01` } },
      include: { employee: true, leaveType: true },
      orderBy: { startDate: "asc" },
    });
    const official = new Set(publicHolidays(year).days.map((day) => day.date));
    return (
      <div>
        <PageTitle title="Holiday Calendar" subtitle="Red days are national holidays or joint leave. A working day stays black. Leave requested by someone in your division shows on the day and in the list below." />
        {banner}
        <YearCalendar
          year={year}
          holidays={holidays}
          leaves={leaveRows.map((row) => ({ name: row.employee.fullName, start: row.startDate, end: row.endDate, status: row.status, type: translate(ctx.locale, row.leaveType.name) }))}
          companyDates={holidays.filter((holiday) => !official.has(holiday.date))}
        />
        {hasPerm(ctx, "attendance.configure") ? (
          <div className="profile-board" style={{ marginTop: 14 }}>
            <form action={jointHolidayAction} className="card stack-form">
              <p className="section-label"><Tx text={"Count joint leave"} /></p>
              <p className="hint"><Tx text={"Puts this year’s cuti bersama onto the company calendar. Leave requests then skip those dates. A date that already has a company name is left as it is."} /></p>
              <TInput type="hidden" name="year" value={year} />
              <button className="btn" type="submit"><Tx text={"Apply joint leave"} /></button>
            </form>
            <form action={holidayAction} className="card stack-form">
              <p className="section-label"><Tx text={"Company date"} /></p>
              <label className="field"><Tx text={"Date"} /><TInput name="date" type="date" required /></label>
              <label className="field"><Tx text={"Name"} /><TInput name="name" placeholder="Holiday name" required /></label>
              <button className="btn"><Tx text={"Add holiday"} /></button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }
  if (key.startsWith("leave") && (hasPerm(ctx, "leave.view") || hasPerm(ctx, "leave.self") || hasPerm(ctx, "leave.manage"))) return <LeaveModule path={key} companyId={companyId} ctxPerm={ctx} query={query} banner={banner} />;
  if (key.startsWith("overtime")) return <OvertimeModule path={key} companyId={companyId} ctx={ctx} banner={banner} />;
  if (key.startsWith("payroll")) return <PayrollModule path={key} companyId={companyId} ctx={ctx} query={query} banner={banner} data={data} />;
  if (key.startsWith("tax") || key === "platform/rules") return <TaxModule path={key} companyId={companyId} ctx={ctx} banner={banner} query={query} />;
  if (key.startsWith("approvals") && (hasPerm(ctx, "approvals.view") || hasPerm(ctx, "approvals.act") || hasPerm(ctx, "approvals.delegate"))) return <ApprovalModule path={key} companyId={companyId} ctx={ctx} banner={banner} data={data} query={query} />;
  if (key === "reports" || key.startsWith("reports/")) return <ReportModule path={key} ctx={ctx} query={query} banner={banner} data={data} />;
  if (key.startsWith("settings") || key === "platform/tenants") return <SettingsModule path={key} companyId={companyId} ctx={ctx} query={query} banner={banner} data={data} />;
  notFound();
}

async function requireView(ctx: { permissions: Set<string> }, permission: string) {
  if (!ctx.permissions.has(permission)) {
    const { redirect } = await import("next/navigation");
    redirect(`/forbidden?need=${permission}`);
  }
}

async function LeaveModule({ path, companyId, ctxPerm, query, banner }: { path: string; companyId: string; ctxPerm: Awaited<ReturnType<typeof requireUser>>; query: Record<string, string | undefined>; banner: React.ReactNode }) {
  const requests = await prisma.leaveRequest.findMany({ where: { companyId, employee: employeeWhere(ctxPerm), ...(path === "leave/permission" ? { leaveType: { OR: [{ requiresAttachment: true }, { paid: false }] } } : {}), ...(query.status ? { status: query.status } : {}) }, include: { employee: true, leaveType: true }, orderBy: { createdAt: "desc" } });
  if (path === "leave/policy") {
    if (companyId) await ensureLeaveCatalog(prisma, companyId);
    const types = await prisma.leaveType.findMany({ where: { companyId }, orderBy: { name: "asc" } });
    return <div><PageTitle title="Leave Policy" subtitle="Each leave type keeps its own half-day, attachment, paid, and quota settings. Saving a change does not rewrite requests that were already submitted." />{banner}<LeavePolicyEditor canManage={hasPerm(ctxPerm, "leave.manage")} action={leaveTypeAction} types={types.map((type) => ({ id: type.id, name: type.name, balanceMode: type.balanceMode, quotaDays: type.quotaDays, quotaPeriod: type.quotaPeriod, accrualRate: type.accrualRate, requiresAttachment: type.requiresAttachment, paid: type.paid, allowHalfDay: type.allowHalfDay, carryForwardDays: type.carryForwardDays, expiryDate: type.expiryDate }))} /></div>;
  }
  if (path === "leave/balances") {
    const balances = await prisma.leaveBalance.findMany({ where: { employee: employeeWhere(ctxPerm) }, include: { employee: true, leaveType: true } });
    return <div><PageTitle title="Leave Balance" />{banner}<div className="card table-wrap">{balances.length === 0 ? <p className="empty"><Tx text={"No leave balances in this scope."} /></p> : <table><thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Type"} /></th><th><Tx text={"Year"} /></th><th className="num"><Tx text={"Remaining"} /></th></tr></thead><tbody>{balances.map((row) => <tr key={row.id}><td>{row.employee.fullName}</td><td><Tx text={row.leaveType.name} /></td><td>{row.year}</td><td className="num">{row.entitled - row.used}</td></tr>)}</tbody></table>}</div></div>;
  }
  const heading = path === "leave/history" ? "Leave History" : path === "leave/requests" ? "Leave Requests" : path === "leave/permission" ? "Permission & Sick Leave" : "Leave Overview";
  return <div><PageTitle title={heading} />{banner}<form className="toolbar"><label className="field"><Tx text={"Status"} /><select name="status" defaultValue={query.status || ""}><option value=""><Tx text={"Any status"} /></option><option value="PENDING"><Tx text={"Pending"} /></option><option value="APPROVED"><Tx text={"Approved"} /></option><option value="REJECTED"><Tx text={"Rejected"} /></option><option value="RETURNED"><Tx text={"Returned"} /></option><option value="CANCELLED"><Tx text={"Cancelled"} /></option></select></label><div className="toolbar-actions"><button className="btn"><Tx text={"Apply"} /></button></div></form><div className="card table-wrap">{requests.length === 0 ? <p><Tx text={"No leave requests in this view."} /></p> : <table><thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Type"} /></th><th><Tx text={"Dates"} /></th><th><Tx text={"Days"} /></th><th><Tx text={"Status"} /></th></tr></thead><tbody>{requests.map((row) => <tr key={row.id}><td>{row.employee.fullName}</td><td><Tx text={row.leaveType.name} /></td><td>{row.startDate} – {row.endDate}{row.halfDay ? ` · ${translate(ctxPerm.locale, "Half day")} ${row.halfStart}–${row.halfEnd}` : ""}</td><td>{row.days}</td><td><Status value={row.status} /></td></tr>)}</tbody></table>}</div></div>;
}

async function OvertimeModule({ path, companyId, ctx, banner }: { path: string; companyId: string; ctx: Awaited<ReturnType<typeof requireUser>>; banner: React.ReactNode }) {
  if (!hasPerm(ctx, "overtime.view") && !hasPerm(ctx, "overtime.review") && !hasPerm(ctx, "overtime.configure")) return notFound();
  if (path === "overtime/policy") {
    const policy = await prisma.overtimePolicy.findUnique({ where: { companyId } });
    return <div><PageTitle title="Overtime Policy" subtitle="The hourly divisor and multiplier are company policy fields. They are not a hidden statutory formula." />{banner}<form action={overtimePolicyAction} className="card stack-form"><label><TInput name="allowBefore" type="checkbox" defaultChecked={policy?.allowBefore} /> <Tx text={"Allow request before the shift"} /></label><label><TInput name="allowAfter" type="checkbox" defaultChecked={policy?.allowAfter ?? true} /> <Tx text={"Allow request after the shift"} /></label><label className="field"><Tx text={"Multiplier"} /><TInput name="multiplier" type="number" step="0.1" defaultValue={policy?.multiplier ?? 1.5} /></label><label className="field"><Tx text={"Hourly divisor"} /><TInput name="hourlyDivisor" type="number" defaultValue={policy?.hourlyDivisor ?? 173} /></label><label className="field"><Tx text={"Max hours per day"} /><TInput name="maxHoursPerDay" type="number" step="0.5" defaultValue={policy?.maxHoursPerDay ?? 0} /></label><label className="field"><Tx text={"Meal allowance (Rp)"} /><TInput name="mealAllowance" type="number" min={0} defaultValue={policy?.mealAllowance ?? 0} /></label><p className="hint"><Tx text={"Paid once per approved overtime day, as an earning adjustment. Zero means no meal allowance. The pay formula itself does not change."} /></p><label className="field"><Tx text={"Rounding minutes"} /><TInput name="roundingMinutes" type="number" defaultValue={policy?.roundingMinutes ?? 1} /></label>{hasPerm(ctx, "overtime.configure") ? <button className="btn"><Tx text={"Save policy"} /></button> : null}</form></div>;
  }
  const rows = await prisma.overtimeRequest.findMany({ where: { companyId, employee: employeeWhere(ctx), ...(path === "overtime/calculation" ? { status: "APPROVED" } : {}) }, include: { employee: true }, orderBy: { workDate: "desc" } });
  return <div><PageTitle title={path === "overtime/calculation" ? "Overtime Calculation" : path === "overtime/records" ? "Overtime Records" : path === "overtime/requests" ? "Overtime Requests" : "Overtime Overview"} subtitle={path === "overtime/calculation" ? "HR confirms the payable amount. This does not approve the request again." : "Hours are compared with the actual clock-in and clock-out."} />{banner}<div className="grid">{rows.length === 0 ? <div className="card"><Tx text={"No overtime rows."} /></div> : rows.map((row) => <div key={row.id} className="card"><strong>{row.employee.fullName}</strong> · {row.workDate} · {row.startTime}–{row.endTime}<p><Status value={row.status} /> <Status value={row.compensationStatus} /> · {row.validMinutes} min · {formatIdr(row.compensationIdr)}</p><p>{row.reviewNote}</p>{path === "overtime/calculation" && row.compensationStatus === "PENDING_REVIEW" ? <form action={overtimeReviewAction}><TInput type="hidden" name="id" value={row.id} /><TInput name="note" placeholder="Review note" /><button className="btn"><Tx text={"Mark compensation reviewed"} /></button></form> : null}</div>)}</div></div>;
}

function StatutoryNote({ line }: { line: Awaited<ReturnType<typeof statutoryRuleLine>> }) {
  if (line.state === "stored" || line.state === "pending") {
    return <p className="hint"><Tx text="Statutory rule" />: {line.code} · {line.name} · <Tx text="Effective from" /> {line.effectiveFrom} · {line.source || <Tx text="No source recorded" />}{line.state === "pending" ? <> · <Tx text="Not yet stored on this payroll." /></> : null}{line.official ? null : <> · <Tx text="This calculation uses a sample rule. It is not verified for official filing." /></>}</p>;
  }
  if (line.state === "missing") return <p className="hint"><Tx text="The stored rule version is missing. The result was not recalculated." /></p>;
  if (line.state === "unrecorded") return <p className="hint"><Tx text="This payroll has no stored rule version. The result was not recalculated." /></p>;
  return <p className="hint"><Tx text="No validated statutory rule is effective for this period." /></p>;
}

function verificationLabel(approvalStatus: string) {
  if (approvalStatus === "APPROVED") return "Approved for calculation";
  if (approvalStatus === "PENDING_REVIEW") return "Pending review";
  if (approvalStatus === "REJECTED") return "Rejected";
  if (approvalStatus === "DRAFT") return "Draft";
  return "Sample, not verified for official use";
}

function RuleCards({ rules, maintain = false }: { rules: { id: string; code: string; name: string; effectiveFrom: string; source: string; reference: string; status: string; approvalStatus: string; active: boolean; note: string; rejectionReason: string }[]; maintain?: boolean }) {
  return <div className="grid">{rules.map((rule) => <div key={rule.id} className="card"><p className="record"><strong><Tx text={rule.name} /></strong><Status value={rule.active ? "ACTIVE" : "INACTIVE"} /></p><p className="hint">{rule.code} · <Tx text="Effective from" /> {rule.effectiveFrom}</p><p className="hint"><Tx text="Source" />: {rule.source ? <Tx text={rule.source} /> : <Tx text="No source recorded" />}{rule.reference ? <> · <Tx text={rule.reference} /></> : null}</p><p className="hint"><Tx text="Technical check" />: <Tx text={rule.status === "VALIDATED" ? "Technical check passed" : "Draft"} /></p><p className="hint"><Tx text="Regulatory verification" />: <Tx text={verificationLabel(rule.approvalStatus)} /></p>{rule.rejectionReason ? <p className="hint"><Tx text={rule.rejectionReason} /></p> : null}<p><Tx text={rule.note} /></p>{maintain && (rule.approvalStatus === "PENDING_REVIEW" || rule.approvalStatus === "DRAFT") ? <form action={decideRuleAction} className="stack-form"><TInput type="hidden" name="id" value={rule.id} /><label className="field"><Tx text="Rejection reason" /><TInput name="reason" /></label><div className="form-actions"><button className="btn" name="decision" value="APPROVED"><Tx text="Approve rule" /></button><button className="btn secondary" name="decision" value="REJECTED"><Tx text="Reject rule" /></button></div></form> : null}</div>)}</div>;
}

async function PayrollModule({ path, companyId, ctx, query, banner, data }: { path: string; companyId: string; ctx: Awaited<ReturnType<typeof requireUser>>; query: Record<string, string | undefined>; banner: React.ReactNode; data: Awaited<ReturnType<typeof lookups>> | null }) {
  if (!hasPerm(ctx, "payroll.view") && !hasPerm(ctx, "payroll.prepare") && !hasPerm(ctx, "payroll.approve") && !hasPerm(ctx, "payroll.publish")) redirect("/forbidden?need=payroll.view");
  const periods = data?.periods || [];
  const selected = periods.find((period) => period.id === query.period) || periods[0];
  if (path === "payroll/components") {
    const components = await prisma.payrollComponent.findMany({ where: { companyId } });
    return <div><PageTitle title="Salary Components" />{banner}<div className="card">{components.length === 0 ? <p className="empty"><Tx text={"No components yet."} /></p> : <div className="table-wrap"><table><thead><tr><th><Tx text={"Name"} /></th><th><Tx text={"Kind"} /></th><th><Tx text={"Calculation"} /></th><th className="num"><Tx text={"Amount"} /></th></tr></thead><tbody>{components.map((row) => <tr key={row.id}><td>{row.name}</td><td><Status value={row.kind} /></td><td>{translate(ctx.locale, row.calc === "PERCENT_BASIC" ? "Percent of basic" : "Fixed")}</td><td className="num">{formatIdr(row.amount)}</td></tr>)}</tbody></table></div>}<form action={componentAction} className="inset"><label className="field"><Tx text={"Name"} /><TInput name="name" placeholder="Component name" required /></label><label className="field"><Tx text={"Kind"} /><select name="kind"><option value="EARNING"><Tx text="Earning" /></option><option value="DEDUCTION"><Tx text="Deduction" /></option></select></label><label className="field"><Tx text={"Calculation"} /><select name="calc"><option value="FIXED"><Tx text="Fixed" /></option><option value="PERCENT_BASIC"><Tx text="Percent of basic" /></option></select></label><label className="field"><Tx text={"Amount"} /><TInput name="amount" type="number" required /></label><button className="btn"><Tx text={"Add component"} /></button></form></div></div>;
  }
  if (path === "payroll/periods") {
    return <div><PageTitle title="Payroll Period" />{banner}<div className="card">{periods.length === 0 ? <p className="empty"><Tx text={"No payroll periods yet."} /></p> : <div className="table-wrap"><table><thead><tr><th><Tx text={"Name"} /></th><th><Tx text={"Kind"} /></th><th><Tx text={"Status"} /></th><th><Tx text={"Payslips"} /></th></tr></thead><tbody>{periods.map((period) => <tr key={period.id}><td>{period.name}</td><td>{translate(ctx.locale, period.kind === "BONUS" ? "Bonus" : period.kind === "THR" ? "THR" : "Regular")}</td><td><Status value={period.status} /></td><td>{translate(ctx.locale, period.payslipPublished ? "Published" : "Not published")}</td></tr>)}</tbody></table></div>}<form action={periodAction} className="inset"><label className="field"><Tx text={"Name"} /><TInput name="name" placeholder="Period name" required /></label><label className="field"><Tx text={"Kind"} /><select name="kind"><option value="REGULAR"><Tx text="Regular" /></option><option>THR</option><option value="BONUS"><Tx text="Bonus" /></option></select></label><label className="field"><Tx text={"Start"} /><TInput name="startDate" type="date" required /></label><label className="field"><Tx text={"End"} /><TInput name="endDate" type="date" required /></label><label className="field"><Tx text={"Cutoff"} /><TInput name="cutoffDate" type="date" required /></label><label className="field"><Tx text={"Pay date"} /><TInput name="payDate" type="date" required /></label><button className="btn"><Tx text={"Create period"} /></button></form></div></div>;
  }
  if (path === "payroll/thr") {
    return <div><PageTitle title="THR & Bonus" subtitle="THR and bonus use the same prepare, different-user approval, lock, and manual payslip publish cycle." />{banner}<form action={extraAction} className="card stack-form"><label className="field"><Tx text={"Employee"} /><select name="employeeId">{data?.employees.map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label><label className="field"><Tx text={"Year"} /><TInput name="year" type="number" defaultValue={new Date().getFullYear()} /></label><label className="field"><Tx text={"Kind"} /><select name="kind"><option>THR</option><option value="BONUS"><Tx text="Bonus" /></option></select></label><label className="field"><Tx text={"Mode"} /><select name="mode"><option value="MANUAL"><Tx text="Manual" /></option><option value="ONE_MONTH_BASIC"><Tx text="One month of basic salary" /></option></select></label><label className="field"><Tx text={"Manual amount"} /><TInput name="amount" type="number" placeholder="Used only for manual mode" /></label><button className="btn"><Tx text={"Save"} /></button></form><p className="hint"><Tx text={"Create a THR or Bonus period, then process it. One month of basic salary is used only when that mode is selected."} /></p></div>;
  }
  if (!selected) return <div><PageTitle title="Payroll" />{banner}<div className="card"><Tx text={"Create a payroll period first."} /></div></div>;
  const items = await prisma.payrollItem.findMany({
    where: {
      periodId: selected.id,
      employee: {
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
    },
    include: { employee: true },
  });
  const filterNames = [data?.branches.find((row) => row.id === query.branchId)?.name, data?.departments.find((row) => row.id === query.departmentId)?.name].filter(Boolean);
  const editable = path === "payroll/processing" && canEditPayroll(selected.status, selected.preparedById, ctx.userId) && hasPerm(ctx, "payroll.prepare");
  const adjustments = await prisma.payrollAdjustment.findMany({ where: { periodId: selected.id }, orderBy: { createdAt: "asc" } });
  const actorIds = [...new Set(adjustments.map((row) => row.actorId).filter(Boolean))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, include: { employee: { select: { fullName: true } } } }) : [];
  const actorName = new Map(actors.map((user) => [user.id, user.employee?.fullName || user.email]));
  const revisions = await prisma.approvalDecision.findMany({ where: { decision: "RETURNED", task: { companyId, module: "PAYROLL", subjectId: selected.id } }, orderBy: { createdAt: "desc" } });
  if (path === "payroll/adjustments") {
    return <div><PageTitle title="Payroll Adjustment" subtitle="Adjustments before lock are included on the next calculation. After lock, open a separate adjustment period. The locked result stays unchanged." />{banner}<div className="card"><Pipeline status={selected.status} /><p className="record"><strong>{selected.name}</strong><Status value={selected.status} /></p>{selected.status === "LOCKED" ? <form action={adjustmentPeriodAction}><TInput type="hidden" name="id" value={selected.id} /><button className="btn"><Tx text={"Open controlled adjustment period"} /></button></form> : <form action={adjustmentAction} className="inset"><TInput type="hidden" name="periodId" value={selected.id} /><label className="field"><Tx text={"Employee"} /><select name="employeeId">{data?.employees.map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label><label className="field"><Tx text={"Name"} /><TInput name="name" placeholder="Adjustment name" required /></label><label className="field"><Tx text={"Kind"} /><select name="kind"><option value="EARNING"><Tx text="Earning" /></option><option value="DEDUCTION"><Tx text="Deduction" /></option></select></label><label className="field"><Tx text={"Amount"} /><TInput name="amount" type="number" required /></label><label className="field"><Tx text={"Reason"} /><TInput name="reason" placeholder="Reason" required /></label><button className="btn"><Tx text={"Add adjustment"} /></button></form>}</div></div>;
  }
  if (path === "payroll/payslips") {
    const locked = periods.filter((period) => period.status === "LOCKED");
    return <div><PageTitle title="Payslip Management" subtitle="Finalizing a payroll does not publish payslips. Publish is a separate manual action. A locked period can also download the bank transfer file." />{banner}{locked.length === 0 ? <div className="card empty"><Tx text={"No locked period is waiting to be published."} /></div> : <div className="grid stats">{locked.map((period) => <div key={period.id} className="card"><form action={publishAction}><TInput type="hidden" name="id" value={period.id} /><p className="section-label">{period.kind}</p><strong>{period.name}</strong><p className="hint"><Tx text={period.payslipPublished ? "Published" : "Locked, not published"} /></p>{period.payslipPublished ? null : <button className="btn"><Tx text={"Publish payslips"} /></button>}</form><a className="text-action" href={`/api/payroll/transfer?period=${period.id}`}>CSV</a> <a className="text-action" href={`/api/payroll/transfer?period=${period.id}&format=bca`}>BCA</a> <a className="text-action" href={`/api/payroll/transfer?period=${period.id}&format=mandiri`}>Mandiri</a> <a className="text-action" href={`/api/payroll/full?period=${period.id}`}><Tx text={"Full payroll report"} /></a> <a className="text-action" href={`/api/payroll/full?period=${period.id}&format=csv`}><Tx text={"Full payroll CSV"} /></a></div>)}</div>}{hasPerm(ctx, "payroll.publish") ? <form action={resendPayslipAction} className="card stack-form" style={{ marginTop: 14 }}><p className="section-label"><Tx text={"Resend payslips"} /></p><p className="hint"><Tx text={"Pick a month. DORA emails the PDF for every published payslip in that month. The PIN is not in the email."} /></p><label className="field"><Tx text={"Month"} /><TInput name="month" type="month" defaultValue={currentMonth()} required /></label><button className="btn" type="submit"><Tx text={"Resend payslip PDFs"} /></button></form> : null}</div>;
  }
  const ruleLine = await statutoryRuleLine(selected, items.length > 0);
  return <div><PageTitle title={path === "payroll/approval" ? "Payroll Approval" : path === "payroll/processing" ? "Payroll Processing" : "Payroll Overview"} subtitle="The approver must be a different user from the preparer, even when both have the Payroll role." />{banner}<form className="toolbar"><label className="field"><Tx text={"Period"} /><select name="period" defaultValue={selected.id}>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label><div className="toolbar-actions"><button className="btn"><Tx text={"Show period"} /></button></div></form><div className="card"><Pipeline status={selected.status} /><p className="record"><strong>{selected.name}</strong><span>{translate(ctx.locale, selected.kind === "BONUS" ? "Bonus" : selected.kind === "THR" ? "THR" : "Regular")}</span></p><Status value={selected.status} />{filterNames.length ? <p className="hint">{translate(ctx.locale, "Filtered:")} {filterNames.join(" · ")}</p> : null}{selected.warningNote ? <p className="hint">{selected.warningNote.split("\n").map((line) => translate(ctx.locale, line)).join(" ")}</p> : null}<StatutoryNote line={ruleLine} />{selected.decisionNote ? <p className="hint">{translate(ctx.locale, "Approver note")}: {selected.decisionNote}</p> : null}{selected.needsRecalc ? <p className="hint"><Tx text={"Recalculate after the manual change before submitting."} /></p> : null}{revisions.some((row) => row.note && row.note !== selected.decisionNote) ? <div className="hint">{revisions.filter((row) => row.note && row.note !== selected.decisionNote).map((row) => <p key={row.id}>{translate(ctx.locale, "Approver note")}: {row.note}</p>)}</div> : null}<div className="form-actions">{hasPerm(ctx, "payroll.prepare") && ["DRAFT", "PROCESSED", "NEEDS_REVISION"].includes(selected.status) && (!selected.preparedById || selected.preparedById === ctx.userId) ? <form action={processAction}><TInput type="hidden" name="id" value={selected.id} /><button className="btn"><Tx text={selected.status === "DRAFT" ? "Process payroll" : "Recalculate"} /></button></form> : null}{hasPerm(ctx, "payroll.prepare") && canSubmitPayroll(selected.status, selected.needsRecalc) && selected.preparedById === ctx.userId ? <form action={submitPayrollAction}><TInput type="hidden" name="id" value={selected.id} /><button className="btn"><Tx text={selected.status === "NEEDS_REVISION" ? "Submit again for approval" : "Submit for approval"} /></button></form> : null}</div>{hasPerm(ctx, "payroll.approve") && selected.status === "SUBMITTED" ? <form action={payrollDecisionAction} className="inset"><TInput type="hidden" name="id" value={selected.id} /><label className="field"><Tx text={"Note"} /><TInput name="note" placeholder="Note" /></label><ChoiceButtons className="form-actions" choices={[{ value: "APPROVED", label: translate(ctx.locale, "Approve") }, { value: "RETURNED", label: translate(ctx.locale, "Return for revision"), secondary: true }]} /></form> : null}{hasPerm(ctx, "payroll.finalize") && selected.status === "APPROVED" ? <form action={finalizeAction} className="inset"><TInput type="hidden" name="id" value={selected.id} /><label><TInput name="confirm" type="checkbox" /> <Tx text={"I understand this locks the result"} /></label><button className="btn"><Tx text={"Finalize and lock"} /></button></form> : null}<PayLines periodId={selected.id} canEdit={editable} items={items.map((item) => ({ id: item.id, employeeId: item.employeeId, employeeName: item.employee.fullName, gross: item.gross, deduction: item.deduction, net: item.net, pph21: item.pph21, lines: JSON.parse(item.breakdown) as { name: string; kind: string; amount: number }[] }))} adjustments={adjustments.map((row) => ({ id: row.id, employeeId: row.employeeId, name: row.name, kind: row.kind, amount: row.amount, reason: row.reason, beforeGross: row.beforeGross, beforeDeduction: row.beforeDeduction, beforeNet: row.beforeNet, beforePph21: row.beforePph21, beforeAmount: row.beforeAmount, actorName: actorName.get(row.actorId) || "", when: `${formatLongDate(todayJakarta(row.createdAt), ctx.locale)} ${timeJakarta(row.createdAt)}`, createdAt: row.createdAt.toISOString() }))} /><div className="page-actions"><Link className="btn secondary" href={`/payroll/processing?period=${selected.id}`}><Tx text={"Processing"} /></Link><Link className="btn secondary" href={`/payroll/approval?period=${selected.id}`}><Tx text={"Approval"} /></Link></div></div></div>;
}

async function TaxModule({ path, companyId, ctx, banner, query }: { path: string; companyId: string; ctx: Awaited<ReturnType<typeof requireUser>>; banner: React.ReactNode; query: Record<string, string | undefined> }) {
  if (path === "platform/rules") {
    if (!hasPerm(ctx, "tax.platform")) return notFound();
    const rules = await prisma.statutoryRule.findMany({ orderBy: { effectiveFrom: "desc" } });
    const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
    return <div><PageTitle title="Platform Statutory Rules" subtitle="Companies cannot edit these formulas. The seeded rule is a sample and must be replaced before it is treated as an official filing rule." />{banner}<p className="hint"><Tx text="Automatic update is off." /> <Tx text="No official programmable source is connected. No rule was created." /></p><p className="hint"><Tx text="Last check" />: {platform?.regulatoryCheckedAt ? platform.regulatoryCheckedAt.toISOString().slice(0, 16).replace("T", " ") : <Tx text="Not checked yet" />}</p><form action={checkRegulatoryAction}><TInput type="hidden" name="return" value="platform" /><button className="btn secondary"><Tx text="Check for updates" /></button></form><RuleCards rules={rules} maintain /><form action={platformRuleAction} className="card stack-form"><p className="hint"><Tx text="Saving a version does not activate it. Submit it for review, then approve it. The sample rule remains until an approved rule covers the period." /></p><label className="field"><Tx text={"Code"} /><TInput name="code" placeholder="Code" required /></label><label className="field"><Tx text={"Name"} /><TInput name="name" placeholder="Name" required /></label><label className="field"><Tx text={"Effective from"} /><TInput name="effectiveFrom" type="date" required /></label><label className="field"><Tx text={"Source"} /><TInput name="source" placeholder="Source" required /></label><label className="field"><Tx text={"Reference"} /><TInput name="reference" placeholder="Reference" /></label><label className="field"><Tx text={"Rule JSON"} /><TTextarea name="definition" placeholder="Rule JSON" required /></label><label className="field"><Tx text={"Note"} /><TTextarea name="note" /></label><label><TInput name="review" type="checkbox" /> <Tx text={"Submit for review"} /></label><button className="btn"><Tx text={"Save rule version"} /></button></form></div>;
  }
  if (!hasPerm(ctx, "tax.view") && !hasPerm(ctx, "tax.configure")) return notFound();
  const setting = await prisma.companyStatutorySetting.findUnique({ where: { companyId } });
  const rules = await prisma.statutoryRule.findMany({ orderBy: { effectiveFrom: "desc" } });
  const currentRule = ruleForDate(rules, todayJakarta());
  const items = await prisma.payrollItem.findMany({ where: { period: { companyId } }, include: { employee: true, period: true }, take: 50 });
  if (path === "tax/config") {
    const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
    const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: "tax." } }, orderBy: { createdAt: "desc" }, take: 20 });
    const left = rules.find((rule) => rule.id === query.compareFrom);
    const right = rules.find((rule) => rule.id === query.compareTo);
    let diff: { field: string; before: string; after: string }[] | null = null;
    if (left && right) {
      try { diff = ruleDiff(JSON.parse(left.definition), JSON.parse(right.definition)); } catch { diff = null; }
    }
    const pending = rules.filter((rule) => rule.approvalStatus === "PENDING_REVIEW").length;
    return <div><PageTitle title="Tax & Statutory Configuration" subtitle="JKK class, BPJS Kesehatan participation, and overtime in the wage base are the company parameters. Percentages stay on the platform rule." />{banner}<div className="card"><p className="section-label"><Tx text="Regulatory update status" /></p><p><Tx text="Automatic update is off." /></p><p><Tx text="Last check" />: {platform?.regulatoryCheckedAt ? platform.regulatoryCheckedAt.toISOString().slice(0, 16).replace("T", " ") : <Tx text="Not checked yet" />}</p>{platform?.regulatoryCheckResult ? <p><Tx text={platform.regulatoryCheckResult} /></p> : null}<p><Tx text="Waiting for review" />: {pending}</p>{hasPerm(ctx, "tax.configure") ? <form action={checkRegulatoryAction}><button className="btn secondary"><Tx text="Check for updates" /></button></form> : null}</div><p className="hint"><Tx text="Company parameters do not change the official formula. Employee BPJS enrollment is separate." /></p><RuleCards rules={rules} /><form className="toolbar" method="get"><label className="field"><Tx text="Compare versions" /><select name="compareFrom" defaultValue={query.compareFrom || ""}><option value=""></option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.code}</option>)}</select></label><label className="field"><Tx text="New value" /><select name="compareTo" defaultValue={query.compareTo || ""}><option value=""></option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.code}</option>)}</select></label><button className="btn secondary"><Tx text="Compare versions" /></button></form>{diff ? <div className="card table-wrap">{diff.length === 0 ? <p><Tx text="No parameter differs." /></p> : <table><thead><tr><th><Tx text="Field" /></th><th><Tx text="Previous value" /></th><th><Tx text="New value" /></th></tr></thead><tbody>{diff.map((row) => <tr key={row.field}><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table>}</div> : null}<div className="card table-wrap"><p className="section-label"><Tx text="Change log" /></p>{logs.length === 0 ? <p className="empty"><Tx text="No audit events yet." /></p> : <table><thead><tr><th><Tx text="When" /></th><th><Tx text="Action" /></th><th><Tx text="Detail" /></th></tr></thead><tbody>{logs.map((row) => <tr key={row.id}><td>{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{translate(ctx.locale, row.action)}</td><td>{translate(ctx.locale, row.detail)}</td></tr>)}</tbody></table>}</div><form action={statutoryAction} className="card stack-form"><label className="field"><Tx text={"JKK class"} /><TInput name="jkkClass" type="number" min={1} max={5} defaultValue={setting?.jkkClass ?? 1} /></label><label><TInput name="bpjsKesEnabled" type="checkbox" defaultChecked={setting?.bpjsKesEnabled ?? true} /> <Tx text={"BPJS Kesehatan enabled"} /></label><label><TInput name="includeOvertime" type="checkbox" defaultChecked={setting?.includeOvertime} /> <Tx text={"Include reviewed overtime in the BPJS wage base"} /></label><button className="btn"><Tx text={"Save parameters"} /></button></form></div>;
  }
  const title = path === "tax/pph21" ? "PPh 21" : path === "tax/bpjs-health" ? "BPJS Kesehatan" : path === "tax/bpjs-tk" ? "BPJS Ketenagakerjaan" : path === "tax/reports" ? "Tax & Statutory Reports" : "Tax & Statutory Overview";
  return <div><PageTitle title={title} subtitle="Exports are files for administrative use. Nothing is sent to a government system." />{banner}<p className="hint">{currentRule ? <><Tx text="Statutory rule" />: {currentRule.code} · {currentRule.name} · <Tx text="Effective from" /> {currentRule.effectiveFrom} · {currentRule.source || <Tx text="No source recorded" />} · <Tx text={verificationLabel(currentRule.approvalStatus)} /></> : <Tx text="No validated statutory rule is effective for this period." />}</p><div className="page-actions"><form method="get" action="/api/reports/tax"><button className="btn secondary"><Tx text={"Export Excel"} /></button></form><form method="get" action="/api/reports/tax"><TInput type="hidden" name="format" value="pdf" /><button className="btn secondary"><Tx text={"Export PDF"} /></button></form></div><div className="card table-wrap">{items.length === 0 ? <p className="empty"><Tx text={"No statutory lines yet."} /></p> : <table><thead><tr><th><Tx text={"Period"} /></th><th><Tx text={"Employee"} /></th><th className="num"><Tx text={"PPh 21"} /></th><th className="num"><Tx text={"BPJS employee"} /></th><th className="num"><Tx text={"BPJS employer"} /></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.period.name}</td><td>{item.employee.fullName}</td><td className="num">{formatIdr(item.pph21)}</td><td className="num">{formatIdr(item.bpjsEmployee)}</td><td className="num">{formatIdr(item.bpjsEmployer)}</td></tr>)}</tbody></table>}</div></div>;
}

async function ApprovalModule({ path, companyId, ctx, banner, data, query }: { path: string; companyId: string; ctx: Awaited<ReturnType<typeof requireUser>>; banner: React.ReactNode; data: Awaited<ReturnType<typeof lookups>> | null; query: Record<string, string | undefined> }) {
  if (path === "approvals/workflow") {
    return <div><PageTitle title="Workflow Configuration" subtitle="Core approval stages are fixed. This page does not add stages." />{banner}<div className="card"><p className="rule"><Tx text={"Leave, overtime, offsite attendance, and employee loans go to the direct supervisor. Return for revision sends leave or overtime back to the employee."} /></p><p className="rule"><Tx text={"Attendance correction is an HR action, not an employee approval flow. An approved offsite day is recorded as present without a GPS clock-in."} /></p><p className="rule"><Tx text={"Overtime compensation review is an HR check after approval. It is not a second approval."} /></p><p className="rule"><Tx text={"Payroll approval must be a different person from the preparer. Delegation cannot bypass that rule."} /></p><p className="rule"><Tx text={"A company appoints the supervisor on the employee record and grants Approve Payroll through the role. It cannot insert an extra approval stage."} /></p></div></div>;
  }
  if (path === "approvals/delegation") {
    const rows = await prisma.delegation.findMany({ where: { companyId, OR: [{ fromUserId: ctx.userId }, { toUserId: ctx.userId }] } });
    const users = companyId ? await prisma.user.findMany({ where: { companyId, status: "ACTIVE", NOT: { id: ctx.userId } } }) : [];
    return <div><PageTitle title="Approval Delegation" subtitle="A delegation has a start, an end, and a module scope." />{banner}<div className="card">{rows.length === 0 ? <p className="empty"><Tx text={"No delegations yet."} /></p> : <div className="record-list">{rows.map((row) => <p className="record" key={row.id}><strong>{row.startDate} – {row.endDate}</strong><span>{row.modules}</span></p>)}</div>}</div><form action={delegationAction} className="card stack-form"><label className="field"><Tx text={"Delegate to"} /><select name="toUserId">{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label><p className="section-label"><Tx text={"Modules"} /></p><label><TInput name="modules" type="checkbox" value="LEAVE" /> <Tx text={"Leave"} /></label><label><TInput name="modules" type="checkbox" value="OVERTIME" /> <Tx text={"Overtime"} /></label><label><TInput name="modules" type="checkbox" value="PROFILE" /> <Tx text={"Profile"} /></label><label><TInput name="modules" type="checkbox" value="PAYROLL" /> <Tx text={"Payroll"} /></label><label><TInput name="modules" type="checkbox" value="ATTENDANCE" /> <Tx text={"Offsite attendance"} /></label><label><TInput name="modules" type="checkbox" value="LOAN" /> <Tx text={"Loans"} /></label><label><TInput name="modules" type="checkbox" value="REIMBURSEMENT" /> <Tx text={"Reimbursement"} /></label><label><TInput name="modules" type="checkbox" value="SHIFT" /> <Tx text={"Shift swap"} /></label><label><TInput name="modules" type="checkbox" value="TIMESHEET" /> <Tx text={"Timesheet"} /></label><label className="field"><Tx text={"Start"} /><TInput name="startDate" type="date" required /></label><label className="field"><Tx text={"End"} /><TInput name="endDate" type="date" required /></label><button className="btn"><Tx text={"Save delegation"} /></button></form></div>;
  }
  if (path === "approvals/history") return <ApprovalHistory ctx={ctx} companyId={companyId} query={query} banner={banner} />;
  const tasks = await prisma.approvalTask.findMany({ where: { companyId, ...(path === "approvals/pending" ? { assigneeId: ctx.userId, status: "PENDING" } : { status: "PENDING" }) }, orderBy: { createdAt: "desc" } });
  const visible = path === "approvals/pending" ? tasks : tasks.filter((task) => task.assigneeId === ctx.userId);
  const attendanceIds = visible.filter((task) => task.module === "ATTENDANCE").map((task) => task.subjectId);
  const attendanceRequests = attendanceIds.length ? await prisma.attendanceRequest.findMany({ where: { id: { in: attendanceIds } }, select: { id: true, kind: true, workDate: true, endDate: true, place: true, note: true, clockInAt: true, clockOutAt: true, createdAt: true, employee: { select: { fullName: true } } } }) : [];
  const attendanceTimes = new Map(attendanceRequests.map((row) => [row.id, row]));
  return <div><PageTitle title={path === "approvals/pending" ? "Pending Approvals" : "Approval Overview"} subtitle="You see tasks assigned to you." />{banner}<div className="grid">{visible.length === 0 ? <div className="card"><Tx text={"No pending tasks."} /></div> : visible.map((task) => {
    const detail = attendanceLine(attendanceTimes.get(task.subjectId), ctx.locale);
    return <DecisionCard key={task.id} task={task} locale={ctx.locale} detail={detail.text} allowReturn={detail.travel} />;
  })}</div>{data ? null : null}</div>;
}

function attendanceLine(row: { kind: string; workDate: string; endDate: string; place: string; note: string; clockInAt: string; clockOutAt: string; createdAt: Date; employee: { fullName: string } } | undefined, locale: string) {
  if (!row) return { text: "", travel: false };
  const t = (value: string) => translate(locale, value);
  if (row.kind === "TRAVEL") {
    const submitted = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(row.createdAt);
    return { text: `${row.employee.fullName} · ${t("Business travel")} ${row.workDate} – ${row.endDate || row.workDate} · ${row.place}${row.note ? ` · ${row.note}` : ""} · ${t("Submitted on")} ${submitted}`, travel: true };
  }
  return { text: `${t("Requested clock-in")} ${row.clockInAt || "—"} · ${t("Requested clock-out")} ${row.clockOutAt || "—"}`, travel: false };
}

function DecisionCard({ task, locale, detail = "", allowReturn = false }: { task: { id: string; module: string; subjectId: string; title: string }; locale: string; detail?: string; allowReturn?: boolean }) {
  const t = (value: string) => translate(locale, value);
  const head = <div className="decision-head"><Status value={task.module} /><strong>{t(task.title)}</strong></div>;
  const note = <TInput name="note" placeholder={t("Note")} />;
  const standard = (returned = false) => <ChoiceButtons choices={[{ value: "APPROVED", label: t("Approve") }, { value: "REJECTED", label: t("Reject"), secondary: true }, ...(returned ? [{ value: "RETURNED", label: t("Return for revision"), secondary: true }] : [])]} />;
  if (task.module === "LEAVE") return <form action={leaveDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard(true)}</form>;
  if (task.module === "OVERTIME") return <form action={overtimeDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard(true)}</form>;
  if (task.module === "PROFILE") return <form action={profileDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard()}</form>;
  if (task.module === "LEAVE_CANCEL") return <form action={leaveCancelDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} /><TInput name="restoreDays" type="number" step="0.5" placeholder={t("Days to restore")} required />{note}<ChoiceButtons choices={[{ value: "APPROVED", label: t("Approve cancellation") }, { value: "REJECTED", label: t("Keep the leave"), secondary: true }]} /></form>;
  if (task.module === "ATTENDANCE") return <form action={offsiteDecisionAction} className="card decision">{head}{detail ? <p className="hint">{detail}</p> : null}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard(allowReturn)}</form>;
  if (task.module === "LOAN") return <form action={loanDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard()}</form>;
  if (task.module === "REIMBURSEMENT") return <form action={claimDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard()}</form>;
  if (task.module === "SHIFT") return <form action={swapDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard()}</form>;
  if (task.module === "TIMESHEET") return <form action={timesheetDecisionAction} className="card decision">{head}<TInput type="hidden" name="id" value={task.subjectId} />{note}{standard()}</form>;
  return <div className="card decision">{head}<p>{t("Open Payroll Approval to decide this payroll. Self-approval stays blocked there.")}</p><Link className="text-action" href="/payroll/approval">{t("Payroll approval")}</Link></div>;
}

async function ReportModule({ path, ctx, query, banner, data }: { path: string; ctx: Awaited<ReturnType<typeof requireUser>>; query: Record<string, string | undefined>; banner: React.ReactNode; data: Awaited<ReturnType<typeof lookups>> | null }) {
  const category = path === "reports" ? "" : path.replace("reports/", "");
  const month = query.month || currentMonth();
  const bounds = monthBounds(month);
  if (!category) {
    const links = [["employee", "Employee"], ["attendance", "Attendance"], ["leave", "Leave & permission"], ["overtime", "Overtime"], ["payroll", "Payroll"], ["tax", "Tax & statutory"], ["approval", "Approvals"]];
    return <div><PageTitle title="Reports" subtitle="Reports are generated when you ask. There is no scheduled report." />{banner}<div className="grid report-grid">{links.map(([link, label]) => <Link key={link} className="card report-link" href={`/reports/${link}`}>{translate(ctx.locale, label)}</Link>)}</div></div>;
  }
  const { buildReport } = await import("@/server/reports");
  let table;
  try {
    table = await buildReport(ctx, category, { from: query.from || bounds.start, to: query.to || bounds.end, branchId: query.branchId || "", departmentId: query.departmentId || "", locationId: query.locationId || "" });
  } catch (error) {
    return <div><PageTitle title="Report" />{banner}<div className="card">{error instanceof Error ? error.message : "Report failed."}</div></div>;
  }
  const exportFields = (
    <>
      <TInput type="hidden" name="from" value={query.from || bounds.start} />
      <TInput type="hidden" name="to" value={query.to || bounds.end} />
      <TInput type="hidden" name="branchId" value={query.branchId || ""} />
      <TInput type="hidden" name="departmentId" value={query.departmentId || ""} />
      <TInput type="hidden" name="locationId" value={query.locationId || ""} />
    </>
  );
  return <div><PageTitle title={table.title} subtitle="Preview uses your current permission and scope. Export runs that check again." />{banner}<form className="toolbar"><label className="field"><Tx text={"From"} /><TInput name="from" type="date" defaultValue={query.from || bounds.start} /></label><label className="field"><Tx text={"To"} /><TInput name="to" type="date" defaultValue={query.to || bounds.end} /></label><label className="field"><Tx text={"Branch"} /><select name="branchId" defaultValue={query.branchId || ""}><option value=""><Tx text={"All branches"} /></option>{data?.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className="toolbar-actions"><button className="btn"><Tx text={"Preview"} /></button></div></form>{table.rows.length === 0 ? <div className="card empty"><Tx text={"No rows for this filter."} /></div> : <div className="card table-wrap"><table><thead><tr>{table.columns.map((column) => <th key={column}>{translate(ctx.locale, column)}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{STATUS_WORDS.has(cell) ? <Status value={cell} /> : cell}</td>)}</tr>)}</tbody></table></div>}<div className="page-actions"><form method="get" action={`/api/reports/${category}`}>{exportFields}<button className="btn secondary"><Tx text={"Export Excel"} /></button></form><form method="get" action={`/api/reports/${category}`}>{exportFields}<TInput type="hidden" name="format" value="pdf" /><button className="btn secondary"><Tx text={"Export PDF"} /></button></form></div></div>;
}

async function SettingsModule({ path, companyId, ctx, query, banner, data }: { path: string; companyId: string; ctx: Awaited<ReturnType<typeof requireUser>>; query: Record<string, string | undefined>; banner: React.ReactNode; data: Awaited<ReturnType<typeof lookups>> | null }) {
  if (path === "platform/tenants") {
    if (!hasPerm(ctx, "settings.platform")) return notFound();
    const companies = await prisma.company.findMany({ include: { _count: { select: { users: true } } } });
    return <div><PageTitle title="Platform Administration" />{banner}<div className="card"><div className="record-list">{companies.map((company) => <p className="record" key={company.id}><strong>{company.name}</strong><span>{company._count.users} {translate(ctx.locale, "users")}</span></p>)}</div></div><form action={tenantAction} className="card stack-form"><label className="field"><Tx text={"Company name"} /><TInput name="name" placeholder="Company name" required /></label><label className="field"><Tx text={"Admin email"} /><TInput name="email" type="email" placeholder="Admin email" required /></label><button className="btn"><Tx text={"Create tenant"} /></button></form></div>;
  }
  if (path === "settings/audit" && hasPerm(ctx, "settings.audit")) {
    const rows = await prisma.auditLog.findMany({ where: ctx.companyId ? { companyId } : {}, orderBy: { createdAt: "desc" }, take: 200 });
    return <div><PageTitle title="Audit Log" />{banner}<div className="card table-wrap">{rows.length === 0 ? <p className="empty"><Tx text={"No audit events yet."} /></p> : <table><thead><tr><th><Tx text={"When"} /></th><th><Tx text={"Action"} /></th><th><Tx text={"Record"} /></th><th><Tx text={"Detail"} /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{translate(ctx.locale, row.action)}</td><td>{translate(ctx.locale, row.entity)}</td><td>{translate(ctx.locale, row.detail)}</td></tr>)}</tbody></table>}</div></div>;
  }
  if (path === "settings/security" && hasPerm(ctx, "settings.security")) {
    const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
    const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
    const source = company || platform;
    return <div><PageTitle title="Security Settings" subtitle="Sign-in uses email and password. Payslip access asks for the password again. MFA is not used." />{banner}<form action={securityAction} className="card stack-form"><label className="field"><Tx text={"Minimum length"} /><TInput name="minLength" type="number" defaultValue={source?.passwordMinLength ?? 8} /></label><label><TInput name="requireUpper" type="checkbox" defaultChecked={source?.requireUpper ?? true} /> <Tx text={"Uppercase"} /></label><label><TInput name="requireLower" type="checkbox" defaultChecked={source?.requireLower ?? true} /> <Tx text={"Lowercase"} /></label><label><TInput name="requireDigit" type="checkbox" defaultChecked={source?.requireDigit ?? true} /> <Tx text={"Digit"} /></label><label className="field"><Tx text={"Session timeout (minutes)"} /><TInput name="sessionTimeoutMin" type="number" defaultValue={source?.sessionTimeoutMin ?? 480} /></label><label className="field"><Tx text={"Failed sign-ins before lock"} /><TInput name="maxFailedLogins" type="number" defaultValue={source?.maxFailedLogins ?? 5} /></label><label className="field"><Tx text={"Lockout (minutes)"} /><TInput name="lockoutMin" type="number" defaultValue={source?.lockoutMin ?? 15} /></label><label className="field"><Tx text={"Temporary password hours"} /><TInput name="tempPasswordHours" type="number" defaultValue={source?.tempPasswordHours ?? 24} /></label><button className="btn"><Tx text={"Save security"} /></button></form></div>;
  }
  if (path === "settings/matrix" && data && hasPerm(ctx, "settings.roles")) {
    return <div><PageTitle title="User Access Matrix" />{banner}<div className="card table-wrap"><table><thead><tr><th><Tx text={"Role"} /></th><th><Tx text={"Scope"} /></th><th><Tx text={"Layout"} /></th><th><Tx text={"Permissions"} /></th></tr></thead><tbody>{data.roles.map((role) => <tr key={role.id}><td>{role.name}</td><td>{role.dataScope}</td><td>{role.isCustom ? "standard" : role.layout}</td><td>{permissionLabelList(role.permissions).map((label) => translate(ctx.locale, label)).join(", ")}</td></tr>)}</tbody></table></div></div>;
  }
  if ((path === "settings/roles" || path === "settings/permissions") && data && hasPerm(ctx, "settings.roles")) {
    if (path.endsWith("permissions") && query.role) {
      const editing = data.roles.find((role) => role.id === query.role);
      if (!editing) return <div><PageTitle title="Permission Management" />{banner}<div className="card"><Tx text="That role was not found." /></div></div>;
      const account = query.user ? await prisma.user.findFirst({ where: { id: query.user, companyId }, include: { employee: true } }) : null;
      let permissions: string[] = [];
      try {
        const parsed = JSON.parse(editing.permissions) as unknown;
        if (Array.isArray(parsed)) permissions = parsed.filter((item): item is string => typeof item === "string");
      } catch { permissions = []; }
      return <div><PageTitle title="Permission Management" subtitle="Each user has one role. Saving here updates that role for every user who has it." />{banner}<RoleAccessEditor userId={account?.id || ""} userName={account?.employee?.fullName || account?.email || ""} roleId={editing.id} roleName={editing.name} dataScope={editing.dataScope} scopeRefId={editing.scopeRefId} permissions={permissions} confirmText={translate(ctx.locale, "This change updates the role. Every user with this role gets the new access.")} /><p className="hint"><Link href="/settings/permissions"><Tx text="New custom role" /></Link></p><WorkflowBoard ctx={ctx} /></div>;
    }
    return <div><PageTitle title={path.endsWith("permissions") ? "Permission Management" : "Role Management"} subtitle="Each user has one role. Custom roles use the standard overview and only the permissions you tick." />{banner}<form action={roleAction} className="card stack-form"><label className="field"><Tx text={"Existing role"} /><select name="id"><option value=""><Tx text={"New custom role"} /></option>{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="field"><Tx text={"Role name"} /><TInput name="name" placeholder="Role name" /></label><label className="field"><Tx text={"Data scope"} /><select name="dataScope"><option value="SELF"><Tx text="Self" /></option><option value="DIRECT_REPORTS"><Tx text="Direct reports" /></option><option value="DEPARTMENT"><Tx text="Department" /></option><option value="BRANCH"><Tx text="Branch" /></option><option value="COMPANY"><Tx text="Company" /></option></select></label><label className="field"><Tx text={"Scope reference"} /><select name="scopeRefId"><option value=""><Tx text={"Scope reference"} /></option>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}{data.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><PermissionGrid /><button className="btn"><Tx text={"Save role"} /></button></form>{path.endsWith("permissions") ? <WorkflowBoard ctx={ctx} /> : null}</div>;
  }
  if (path === "settings/users" && data && hasPerm(ctx, "settings.users")) {
    const users = await prisma.user.findMany({ where: { companyId }, include: { role: true, employee: true } });
    const temporary = query.ok?.match(/^Temporary password for (.+): (.+)$/);
    return <div><PageTitle title="User Management" subtitle="A user receives exactly one role." />{temporary ? <TempPasswordNotice account={temporary[1]} password={temporary[2]} /> : banner}<div className="card table-wrap"><table><thead><tr><th><Tx text={"Email"} /></th><th><Tx text={"Role"} /></th><th><Tx text={"Employee"} /></th><th><Tx text={"Status"} /></th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><Link href={`/settings/users/${user.id}`}>{user.email}</Link></td><td>{user.role.name}</td><td>{user.employee?.fullName || "—"}</td><td><Status value={user.status} /></td><td><ResetPasswordButton userId={user.id} confirmText={translate(ctx.locale, "Reset this user's password? A temporary password is shown once.")} /></td></tr>)}</tbody></table></div><form action={userAction} className="card stack-form" style={{ marginTop: 12 }}><label className="field"><Tx text={"Email"} /><TInput name="email" type="email" required /></label><label className="field"><Tx text={"Role"} /><select name="roleId" required>{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="field"><Tx text={"Employee"} /><select name="employeeId"><option value=""><Tx text={"No employee link"} /></option>{data.employees.map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label><label className="field"><Tx text={"Status"} /><select name="status"><option value="ACTIVE"><Tx text={"Active"} /></option><option value="DISABLED"><Tx text={"Disabled"} /></option></select></label><button className="btn"><Tx text={"Create user"} /></button></form></div>;
  }
  return notFound();
}
