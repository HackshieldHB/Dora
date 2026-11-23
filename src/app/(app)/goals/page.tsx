import { Tx, TInput, TTextarea } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { translate } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { employeeWhere } from "@/server/scope";
import { goalAction, kpiReviewAction, kpiSubmitAction, meetingAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("employees.view");
  const params = await searchParams;
  const people = await prisma.employee.findMany({ where: { ...employeeWhere(ctx), status: "ACTIVE" }, orderBy: { fullName: "asc" } });
  const me = ctx.employeeId ? people.find((person) => person.id === ctx.employeeId) || await prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null;
  const ids = people.map((person) => person.id);
  const directReports = people.filter((person) => person.managerId === ctx.employeeId);
  const reports = directReports.filter((person) => !me?.departmentId || person.departmentId === me.departmentId);
  const notes = directReports.length === 0 ? [] : await prisma.oneOnOne.findMany({ where: { employeeId: { in: directReports.map((person) => person.id) } }, include: { employee: true }, orderBy: { meetingDate: "desc" }, take: 12 });
  const goals = ids.length === 0 ? [] : await prisma.goal.findMany({
    where: { companyId: ctx.companyId || "", OR: [{ employeeId: { in: ids } }, { departmentId: { in: people.map((person) => person.departmentId).filter((id): id is string => Boolean(id)) } }] },
    include: { employee: true, },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageTitle title="Goals & KPI" subtitle="Create an official KPI for someone who reports directly to you in the same division. Save a draft, then submit it to your own manager. The employee sees it after approval." />
      <Banner ok={params.ok} error={params.error} />
      {reports.length === 0 ? <div className="card" style={{ marginBottom: 14 }}><p className="hint"><Tx text={"You can create an official KPI only for an active employee who reports directly to you in the same division."} /></p></div> : (
      <form action={goalAction} className="tone-card teal" style={{ marginBottom: 14 }}>
        <TInput type="hidden" name="return" value="/goals" />
        <p className="section-label"><Tx text={"Official KPI"} /></p>
        <div className="form-grid">
          <label className="field"><Tx text={"Person"} />
            <select name="employeeId" required>
              {reports.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
          <label className="field"><Tx text={"Title"} /><TInput name="title" required /></label>
          <label className="field"><Tx text={"Measure"} /><TInput name="metric" required /></label>
          <label className="field"><Tx text={"Target"} /><TInput name="target" type="number" min={0.01} step="0.01" required /></label>
          <label className="field"><Tx text={"Unit"} /><TInput name="unit" /></label>
          <label className="field"><Tx text={"Weight"} /><TInput name="weight" type="number" min={1} max={100} step={1} required /></label>
          <label className="field"><Tx text={"Direction"} />
            <select name="direction" defaultValue="HIGHER">
              <option value="HIGHER">{translate(ctx.locale, "Higher is better")}</option>
              <option value="LOWER">{translate(ctx.locale, "Lower is better")}</option>
              <option value="MILESTONE">{translate(ctx.locale, "Milestone")}</option>
            </select>
          </label>
          <label className="field"><Tx text={"Start"} /><TInput name="startDate" type="date" required /></label>
          <label className="field"><Tx text={"End"} /><TInput name="endDate" type="date" required /></label>
        </div>
        <div className="form-actions">
          <button className="btn secondary" type="submit" name="intent" value="draft"><Tx text={"Save draft"} /></button>
          <button className="btn" type="submit" name="intent" value="submit"><Tx text={"Submit for approval"} /></button>
        </div>
      </form>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Who"} /></th><th><Tx text={"Goal"} /></th><th><Tx text={"Progress"} /></th><th><Tx text={"Period"} /></th><th></th></tr></thead>
          <tbody>
            {goals.length === 0 ? <tr><td colSpan={5}><Tx text={"No goals in this scope."} /></td></tr> : goals.map((goal) => (
              <tr key={goal.id}>
                <td>{goal.departmentId ? "Team" : goal.employee.fullName}</td>
                <td>{goal.title}<span className="hint"> {goal.metric}</span></td>
                <td>{goal.current} / {goal.target} {goal.unit}{goal.weight ? <span className="hint"> · {goal.weight}%</span> : null}</td>
                <td>{goal.startDate} – {goal.endDate}<br /><Status value={goal.approvalStatus || goal.status} /></td>
                <td>
                  {goal.approvalStatus && (goal.approvalStatus === "DRAFT" || goal.approvalStatus === "RETURNED") && goal.assignedById === ctx.employeeId ? (
                    <form action={kpiSubmitAction}><TInput type="hidden" name="id" value={goal.id} /><button className="btn secondary" type="submit"><Tx text={"Submit for approval"} /></button></form>
                  ) : goal.evalStatus === "SUBMITTED" && goal.assignedById === ctx.employeeId ? (
                    <form action={kpiReviewAction} className="stack-form">
                      <TInput type="hidden" name="id" value={goal.id} />
                      <label className="field"><Tx text={"Score"} /><TInput name="score" type="number" min={0} max={100} step={1} /></label>
                      <label className="field"><Tx text={"Feedback"} /><TTextarea name="feedback" /></label>
                      <label className="field"><Tx text={"Reason"} /><TTextarea name="note" /></label>
                      <div className="form-actions">
                        <button className="btn" type="submit" name="intent" value="accept"><Tx text={"Send for final approval"} /></button>
                        <button className="btn secondary" type="submit" name="intent" value="return"><Tx text={"Return for revision"} /></button>
                      </div>
                    </form>
                  ) : <span className="hint">{goal.progressNote || goal.feedback || ""}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {directReports.length ? (
        <form action={meetingAction} className="card stack-form" style={{ marginTop: 14 }}>
          <p className="section-label"><Tx text={"1-on-1 note"} /></p>
          <p className="hint"><Tx text={"Only for someone who reports to you. They can read the note. It is not a score and it does not change pay."} /></p>
          <label className="field"><Tx text={"Person"} /><select name="employeeId">{directReports.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
          <label className="field"><Tx text={"Meeting date"} /><TInput name="meetingDate" type="date" required max={new Date().toISOString().slice(0, 10)} /></label>
          <label className="field"><Tx text={"Note"} /><TTextarea name="note" required /></label>
          <button className="btn" type="submit"><Tx text={"Save note"} /></button>
        </form>
      ) : null}
      {notes.length ? <div className="card" style={{ marginTop: 14 }}>{notes.map((note) => <p className="record" key={note.id}><strong>{note.employee.fullName} · {note.meetingDate}</strong><span>{note.note}</span></p>)}</div> : null}
    </div>
  );
}