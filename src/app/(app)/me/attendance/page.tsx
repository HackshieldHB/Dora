import { Tx, TInput, TTextarea } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { todayJakarta } from "@/lib/format";
import { addDays, eachDate } from "@/lib/domain";
import { swapAction, timesheetAction, travelCancelAction, travelDayAction } from "@/app/actions";
import { WhereForm } from "@/components/where-form";
import { translate } from "@/lib/i18n";
import { statusLabel } from "@/lib/status";
import { Banner, PageTitle, Status } from "@/components/ui";
import { ClockForm } from "@/components/clock-form";

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("attendance.self");
  const params = await searchParams;
  const rows = ctx.employeeId ? await prisma.attendanceRecord.findMany({ where: { employeeId: ctx.employeeId }, orderBy: { workDate: "desc" }, take: 30 }) : [];
  const requests = ctx.employeeId ? await prisma.attendanceRequest.findMany({ where: { employeeId: ctx.employeeId }, orderBy: { createdAt: "desc" }, take: 12 }) : [];
  const me = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null;
  const mates = me?.departmentId ? await prisma.employee.findMany({ where: { departmentId: me.departmentId, id: { not: me.id }, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } }, orderBy: { fullName: "asc" } }) : [];
  const sheets = ctx.employeeId ? await prisma.timesheet.findMany({ where: { employeeId: ctx.employeeId }, orderBy: { workDate: "desc" }, take: 8 }) : [];
  const todayIso = todayJakarta();
  const today = rows.find((row) => row.workDate === todayIso);
  const t = (value: string) => translate(ctx.locale, value);
  const clockedIn = Boolean(today?.clockInAt);
  const trips = ctx.employeeId ? await prisma.attendanceRequest.findMany({ where: { employeeId: ctx.employeeId, kind: "TRAVEL" }, orderBy: { createdAt: "desc" } }) : [];
  const active = trips.find((row) => row.status === "APPROVED" && row.workDate <= todayIso && (row.endDate || row.workDate) >= todayIso) || null;
  const returned = trips.find((row) => row.status === "RETURNED") || null;
  const tripDays = active ? eachDate(active.workDate, active.endDate || active.workDate) : [];
  const savedDays = active && ctx.employeeId ? await prisma.attendanceRecord.findMany({ where: { employeeId: ctx.employeeId, workDate: { gte: active.workDate, lte: active.endDate || active.workDate } } }) : [];
  const tripRecords = new Map(savedDays.map((row) => [row.workDate, row]));
  const openDays = tripDays.filter((day) => day <= todayIso && !tripRecords.has(day));
  const whereLabel = (kind: string) => t(kind === "FIELD" ? "Outside the office" : kind === "CLIENT" ? "Client site" : kind === "TRAVEL" ? "Business travel" : kind === "BACKDATE" ? "Missed clock-in" : "Office");
  return (
    <div>
      <PageTitle title="My Attendance" />
      <Banner ok={params.ok} error={params.error} />
      <div className={`today-hero${today && ["PRESENT", "LATE"].includes(today.status) ? " present" : ""}`}>
        <div className="kicker">{t("Today")} · {todayIso}</div>
        <strong>{today ? t(today.source === "TRAVEL" ? "Present – Business travel" : statusLabel(today.status)) : t("Not clocked in")}</strong>
        <div className="today-times">
          <span>{t("Clock in")}: {today?.clockInAt || "—"}</span>
          <span>{t("Clock out")}: {today?.clockOutAt || "—"}</span>
        </div>
      </div>
      <div className="split">
        <ClockForm alreadyIn={clockedIn} />
        <div className="stack-form">
          {active ? (
            <div className="card stack-form">
              <p className="section-label"><Tx text={"Active business travel"} /></p>
              <p><Tx text={"Period"} />: {active.workDate} – {active.endDate || active.workDate}</p>
              <p><Tx text={"Location"} />: {active.place}</p>
              <p><Status value={active.status} /></p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"In"} /></th><th><Tx text={"Out"} /></th><th><Tx text={"Status"} /></th></tr></thead>
                  <tbody>{tripDays.map((day) => {
                    const saved = tripRecords.get(day);
                    return <tr key={day}><td>{day}</td><td>{saved?.clockInAt || "—"}</td><td>{saved?.clockOutAt || "—"}</td><td>{saved ? <Status value="PRESENT" label="Present – Business travel" /> : day > todayIso ? "—" : <Tx text={"No attendance yet"} />}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              {openDays.length ? (
                <form action={travelDayAction} className="stack-form">
                  <TInput type="hidden" name="requestId" value={active.id} />
                  <label className="field"><Tx text={"Attendance date"} /><select name="workDate" defaultValue={openDays.includes(todayIso) ? todayIso : openDays[0]}>{openDays.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
                  <label className="field"><Tx text={"Clock-in time"} /><TInput name="clockIn" type="time" required /></label>
                  <label className="field"><Tx text={"Clock-out time"} /><TInput name="clockOut" type="time" required /></label>
                  <label className="field"><Tx text={"Daily note"} /><TTextarea name="note" /></label>
                  <button className="btn" type="submit"><Tx text={"Save attendance"} /></button>
                </form>
              ) : null}
              <details>
                <summary><Tx text={"Change dates"} /></summary>
                <WhereForm today={todayIso} locked returned={{ id: active.id, start: active.workDate, end: active.endDate || active.workDate, place: active.place, note: active.note }} />
              </details>
              <form action={travelCancelAction}><TInput type="hidden" name="id" value={active.id} /><button className="btn secondary" type="submit"><Tx text={"Cancel business travel"} /></button></form>
            </div>
          ) : null}
          {trips.filter((row) => row.status === "PENDING" || row.status === "RETURNED").map((row) => (
            <div className="card" key={row.id}>
              <p className="section-label"><Tx text={"Business travel"} /></p>
              <p>{row.workDate} – {row.endDate || row.workDate} · {row.place}</p>
              <Status value={row.status} />
              <form action={travelCancelAction}><TInput type="hidden" name="id" value={row.id} /><button className="btn secondary" type="submit"><Tx text={"Cancel business travel"} /></button></form>
            </div>
          ))}
          <WhereForm today={todayIso} returned={returned ? { id: returned.id, start: returned.workDate, end: returned.endDate || returned.workDate, place: returned.place, note: returned.note } : null} />
        </div>
      </div>
      <div className="profile-board" style={{ marginTop: 12 }}>
        <form action={swapAction} className="card stack-form">
          <p className="section-label"><Tx text={"Swap a shift"} /></p>
          <p className="hint"><Tx text={"Pick a teammate in your division and a date from today through the next 30 days. Your supervisor approves it. That day only, you work each other’s shift."} /></p>
          {mates.length === 0 ? <p className="empty"><Tx text={"Nobody else in your division can swap."} /></p> : (
            <>
              <label className="field"><Tx text={"Teammate"} /><select name="counterpartId" required>{mates.map((mate) => <option key={mate.id} value={mate.id}>{mate.fullName}</option>)}</select></label>
              <label className="field"><Tx text={"Date"} /><TInput name="workDate" type="date" required min={todayIso} max={addDays(todayIso, 30)} /></label>
              <label className="field"><Tx text={"Note"} /><TTextarea name="note" placeholder="Why you are swapping" /></label>
              <button className="btn" type="submit"><Tx text={"Request swap"} /></button>
            </>
          )}
        </form>
        <form action={timesheetAction} className="card stack-form">
          <p className="section-label"><Tx text={"Client hours"} /></p>
          <p className="hint"><Tx text={"Log hours spent with a client. Your supervisor approves the record. It does not change your pay."} /></p>
          <label className="field"><Tx text={"Date"} /><TInput name="workDate" type="date" required max={todayIso} /></label>
          <label className="field"><Tx text={"Client"} /><TInput name="client" required placeholder="Client or site" /></label>
          <label className="field"><Tx text={"Hours"} /><TInput name="hours" type="number" min={0.5} max={24} step={0.5} required /></label>
          <label className="field"><Tx text={"Note"} /><TTextarea name="note" /></label>
          <button className="btn" type="submit"><Tx text={"Send timesheet"} /></button>
        </form>
      </div>
      {sheets.length ? <div className="card table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Client"} /></th><th><Tx text={"Hours"} /></th><th><Tx text={"Status"} /></th></tr></thead><tbody>{sheets.map((row) => <tr key={row.id}><td>{row.workDate}</td><td>{row.client}</td><td>{row.hours}</td><td><Status value={row.status} /></td></tr>)}</tbody></table></div> : null}
      <div className="card table-wrap" style={{ marginTop: 12 }}>
        <table><thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Place"} /></th><th><Tx text={"Note"} /></th><th><Tx text={"Status"} /></th></tr></thead><tbody>
          {requests.length === 0 ? <tr><td colSpan={4}><Tx text={"No attendance requests yet."} /></td></tr> : requests.map((row) => <tr key={row.id}><td>{row.kind === "TRAVEL" ? `${row.workDate} – ${row.endDate || row.workDate}` : row.workDate}</td><td>{whereLabel(row.kind)}{row.place ? ` · ${row.place}` : ""}{row.kind === "TRAVEL" ? "" : `${row.clockInAt ? ` · ${t("In")} ${row.clockInAt}` : ""}${row.clockOutAt ? ` · ${t("Out")} ${row.clockOutAt}` : ""}`}</td><td>{row.note || "—"}</td><td><Status value={row.status} /></td></tr>)}
        </tbody></table>
      </div>
      <div className="card table-wrap" style={{ marginTop: 12 }}>
        <table><thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Shift"} /></th><th><Tx text={"In"} /></th><th><Tx text={"Out"} /></th><th><Tx text={"Status"} /></th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td>{row.workDate}</td><td>{row.shiftName}</td><td>{row.clockInAt || "—"}</td><td>{row.clockOutAt || "—"}</td><td>{row.source === "TRAVEL" ? <Status value="PRESENT" label="Present – Business travel" /> : <><Status value={row.status} />{row.source === "OFFSITE" ? <span className="hint"> {t("Offsite")}</span> : null}</>}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}