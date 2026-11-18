import Link from "next/link";
import { TInput, TTextarea } from "@/components/locale";
import { prisma } from "@/lib/db";
import { hasPerm, requirePerm } from "@/lib/context";
import { ModuleStrip } from "@/components/module-board";
import { statusLabel } from "@/lib/status";
import { currentPayrollPeriod, loadDashboard, loadDivisionToday, loadTeamToday, type DashFilters } from "@/server/dashboard";
import { lookups } from "@/server/lookups";
import { Avatar, Banner } from "@/components/ui";
import { daysUntilMonthDay } from "@/lib/domain";
import { formatIdr, timeJakarta, todayJakarta } from "@/lib/format";
import { announcementAction } from "@/app/actions";
import { translate } from "@/lib/i18n";
import { DashboardLive, DashboardShortcuts } from "@/components/dashboard-live";
import { ClearFilter } from "@/components/clear-filter";
import { FilterBar } from "@/components/filter-bar";

const PAYROLL_STATUSES = [
  ["DRAFT", "Draft"],
  ["PROCESSED", "Processing"],
  ["SUBMITTED", "Pending Approval"],
  ["APPROVED", "Approved"],
  ["LOCKED", "Locked"],
] as const;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePerm("overview.view");
  const params = await searchParams;
  const options = ctx.companyId ? await lookups(ctx.companyId) : null;
  const today = todayJakarta();
  const defaultPeriod = currentPayrollPeriod(options?.periods ?? [], today);
  const filters: DashFilters = {
    month: params.month || "",
    branchId: ctx.roleKey === "employee" ? "" : params.branchId || "",
    departmentId: ctx.roleKey === "employee" ? "" : params.departmentId || "",
    locationId: ctx.roleKey === "payroll" || ctx.roleKey === "employee" ? "" : params.locationId || "",
    periodId: ctx.roleKey === "payroll" ? params.periodId || defaultPeriod?.id || "" : "",
    payrollStatus: ctx.roleKey === "payroll" ? params.payrollStatus || "" : "",
  };
  const data = await loadDashboard(ctx, filters);
  const division = await loadDivisionToday(ctx, ctx.roleKey === "employee" ? "" : filters.departmentId);
  const team = await loadTeamToday(ctx);
  const text = (value: string) => translate(ctx.locale, value);
  const news = ctx.companyId ? await prisma.announcement.findMany({ where: { companyId: ctx.companyId, endsOn: { gte: today } }, orderBy: { createdAt: "desc" }, take: 4 }) : [];
  const crowd = ctx.companyId ? await prisma.employee.findMany({
    where: { companyId: ctx.companyId, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] }, ...(division ? { departmentId: division.id } : {}) },
    select: { fullName: true, birthDate: true, joinDate: true },
  }) : [];
  const soon = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    return daysUntilMonthDay(today, Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
  };
  const birthdays = crowd.filter((person) => person.birthDate && soon(person.birthDate) != null);
  const anniversaries = crowd.filter((person) => Boolean(person.joinDate) && person.joinDate.slice(0, 4) < today.slice(0, 4) && soon(person.joinDate) != null);
  const activity = await prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 5 });
  const query = new URLSearchParams({ month: data.month, branchId: filters.branchId, departmentId: filters.departmentId, locationId: filters.locationId, periodId: data.periodId, payrollStatus: filters.payrollStatus }).toString();
  const hour = Number(timeJakarta().slice(0, 2));
  const greeting = text(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  const who = ctx.fullName.includes("@") ? ctx.fullName.split("@")[0] : (ctx.fullName.split(" ")[0] || ctx.fullName);
  const photo = ctx.employeeId ? await prisma.employeeDocument.findFirst({ where: { employeeId: ctx.employeeId, name: "Profile photo" }, orderBy: { createdAt: "desc" } }) : null;
  const todayRow = ctx.employeeId && hasPerm(ctx, "attendance.self")
    ? await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: ctx.employeeId, workDate: today } } })
    : null;
  const pins = [
    { href: "/me/attendance", label: "Attendance", show: Boolean(ctx.employeeId) && hasPerm(ctx, "attendance.self") },
    { href: "/me/leave", label: "Leave", show: Boolean(ctx.employeeId) && hasPerm(ctx, "leave.self") },
    { href: "/me/overtime", label: "Overtime", show: Boolean(ctx.employeeId) && hasPerm(ctx, "overtime.self") },
    { href: "/me/payslip", label: "Payslip", show: Boolean(ctx.employeeId) && hasPerm(ctx, "payroll.self") },
    { href: "/me/profile", label: "Profile", show: Boolean(ctx.employeeId) && hasPerm(ctx, "employees.self") },
    { href: "/me/training", label: "Training", show: Boolean(ctx.employeeId) && hasPerm(ctx, "training.self") },
    { href: "/me/goals", label: "Goals", show: Boolean(ctx.employeeId) && hasPerm(ctx, "employees.self") },
    { href: "/menu", label: "All apps", show: true },
  ].filter((item) => item.show);
  const pinHrefs = new Set(pins.map((item) => item.href));
  const clockedIn = Boolean(todayRow?.clockInAt);
  const clockedOut = Boolean(todayRow?.clockOutAt);
  return (
    <div className="dash">
      <section className="dash-head">
        <div>
          <p className="eyebrow">{today} · {ctx.companyName}</p>
          <h2>{greeting}, {who}!</h2>
          <p>{text("Here's your workplace overview for today.")}</p>
        </div>
        <div className="dash-person">
          <Avatar name={ctx.fullName} src={photo ? `/api/files/${photo.fileId}` : ""} />
          <span className="role-chip">{ctx.roleName}</span>
        </div>
      </section>
      <Banner error={params.error} ok={params.ok} />
      {ctx.employeeId && hasPerm(ctx, "attendance.self") ? (
        <section className={`attn-strip${todayRow && ["PRESENT", "LATE"].includes(todayRow.status) ? " present" : ""}`}>
          <div>
            <p className="kicker">{text("Today")} · {today}</p>
            <strong>{text(todayRow ? (todayRow.source === "TRAVEL" ? "Present – Business travel" : statusLabel(todayRow.status)) : "Not clocked in")}</strong>
            <div className="attn-times">
              <span>{text("Clock in")}: {todayRow?.clockInAt || "—"}</span>
              <span>{text("Clock out")}: {todayRow?.clockOutAt || "—"}</span>
            </div>
          </div>
          <div className="attn-actions">
            <Link className={clockedIn ? "btn secondary" : "btn"} href="/me/attendance">{text("Clock in")}</Link>
            <Link className={clockedIn && !clockedOut ? "btn" : "btn secondary"} href="/me/attendance">{text("Clock out")}</Link>
          </div>
        </section>
      ) : null}
      <ModuleStrip items={pins} locale={ctx.locale} />
      {news.length || hasPerm(ctx, "organization.manage") ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p className="section-label">{text("From the company")}</p>
          {news.length === 0 ? <p className="empty">{text("No announcement is running.")}</p> : news.map((item) => <p className="record" key={item.id}><strong>{item.title}</strong><span>{item.body}</span></p>)}
          {hasPerm(ctx, "organization.manage") ? (
            <form action={announcementAction} className="stack-form" style={{ marginTop: 10 }}>
              <label className="field">{text("Title")}<TInput name="title" required /></label>
              <label className="field">{text("Message")}<TTextarea name="body" required /></label>
              <label className="field">{text("Show until")}<TInput name="endsOn" type="date" required /></label>
              <button className="btn" type="submit">{text("Post announcement")}</button>
            </form>
          ) : null}
        </section>
      ) : null}
      <DashboardShortcuts actions={data.actions.filter((action) => !pinHrefs.has(action.href))} locale={ctx.locale} />
      <FilterBar>
        {ctx.roleKey === "payroll" ? (
          <>
            <label className="field">{text("Payroll period")}<select name="periodId" defaultValue={data.periodId}>{options?.periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label>
            <label className="field">{text("Branch")}<select name="branchId" defaultValue={filters.branchId}><option value="">{text("All in scope")}</option>{options?.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="field">{text("Department")}<select name="departmentId" defaultValue={filters.departmentId}><option value="">{text("All in scope")}</option>{options?.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="field">{text("Payroll status")}<select name="payrollStatus" defaultValue={filters.payrollStatus}><option value="">{text("All statuses")}</option>{PAYROLL_STATUSES.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
          </>
        ) : (
          <>
            <label className="field">{text("Period")}<TInput name="month" type="month" defaultValue={data.month} /></label>
            {ctx.roleKey !== "employee" && options ? (
              <>
                <label className="field">{text("Branch")}<select name="branchId" defaultValue={filters.branchId}><option value="">{text("All in scope")}</option>{options.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="field">{text("Department")}<select name="departmentId" defaultValue={filters.departmentId}><option value="">{text("All in scope")}</option>{options.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="field">{text("Work location")}<select name="locationId" defaultValue={filters.locationId}><option value="">{text("All in scope")}</option>{options.locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              </>
            ) : null}
          </>
        )}
        <div className="toolbar-actions">
          <button className="btn" type="submit">{text("Apply")}</button>
          <ClearFilter label={text("Clear Filter")} />
        </div>
      </FilterBar>
      <DashboardLive
        initial={data.cards.map((card) => ({ ...card, value: /^\d+$/.test(card.value) && (card.id === "payroll_summary" || card.title.toLowerCase().includes("net")) ? formatIdr(Number(card.value)) : card.value }))}
        board={data.board}
        activity={activity.map((item) => ({ id: item.id, title: item.title, href: item.href, createdAt: item.createdAt.toISOString().slice(0, 16).replace("T", " "), read: Boolean(item.readAt) }))}
        query={query}
        locale={ctx.locale}
      />
      {birthdays.length || anniversaries.length ? (
        <section className="profile-board" style={{ marginTop: 14 }}>
          <div className="card"><p className="section-label">{text("Birthdays this week")}</p>{birthdays.length === 0 ? <p className="empty">{text("None this week.")}</p> : birthdays.map((person) => <p className="record" key={person.fullName}><strong>{person.fullName}</strong><span>{person.birthDate.slice(5)}</span></p>)}</div>
          <div className="card"><p className="section-label">{text("Work anniversaries this week")}</p>{anniversaries.length === 0 ? <p className="empty">{text("None this week.")}</p> : anniversaries.map((person) => <p className="record" key={person.fullName}><strong>{person.fullName}</strong><span>{text("Joined")} {person.joinDate}</span></p>)}</div>
        </section>
      ) : null}
      {team ? (
        <section className="division-board">
          <div className="card"><p className="section-label">{text("Your team today")} · {text("Clocked in")}</p>{team.present.length === 0 ? <p className="empty">{text("Nobody has clocked in.")}</p> : <div className="record-list">{team.present.map((name) => <p className="record" key={name}><strong>{name}</strong></p>)}</div>}</div>
          <div className="card"><p className="section-label">{text("On leave")}</p>{team.leave.length === 0 ? <p className="empty">{text("Nobody is on approved leave.")}</p> : <div className="record-list">{team.leave.map((name) => <p className="record" key={name}><strong>{name}</strong></p>)}</div>}</div>
          <div className="card"><p className="section-label">{text("No record yet")}</p>{team.open.length === 0 ? <p className="empty">{text("Everyone has a record or leave.")}</p> : <div className="record-list">{team.open.map((name) => <p className="record" key={name}><strong>{name}</strong></p>)}</div>}</div>
        </section>
      ) : null}
      {division ? (
        <section className="division-board">
          <div className="card"><p className="section-label">{division.name} · {text("Clocked in")}</p>{division.present.length === 0 ? <p className="empty">{text("Nobody has clocked in.")}</p> : <div className="record-list">{division.present.map((name) => <p className="record" key={name}><strong>{name}</strong></p>)}</div>}</div>
          <div className="card"><p className="section-label">{text("On leave")}</p>{division.leave.length === 0 ? <p className="empty">{text("Nobody is on approved leave.")}</p> : <div className="record-list">{division.leave.map((name) => <p className="record" key={name}><strong>{name}</strong></p>)}</div>}</div>
          <div className="card"><p className="section-label">{text("No record yet")}</p>{division.open.length === 0 ? <p className="empty">{text("Everyone has a record or leave.")}</p> : <div className="record-list">{division.open.map((name) => <p className="record" key={name}><strong>{name}</strong></p>)}</div>}</div>
        </section>
      ) : null}
    </div>
  );
}
