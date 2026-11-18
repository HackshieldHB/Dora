import { Tx, TInput, TTextarea } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { employeeWhere } from "@/server/scope";
import { goalAction, goalProgressAction, meetingAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("employees.view");
  const params = await searchParams;
  const people = await prisma.employee.findMany({ where: { ...employeeWhere(ctx), status: "ACTIVE" }, orderBy: { fullName: "asc" } });
  const ids = people.map((person) => person.id);
  const reports = people.filter((person) => person.managerId === ctx.employeeId);
  const notes = reports.length === 0 ? [] : await prisma.oneOnOne.findMany({ where: { employeeId: { in: reports.map((person) => person.id) } }, include: { employee: true }, orderBy: { meetingDate: "desc" }, take: 12 });
  const goals = ids.length === 0 ? [] : await prisma.goal.findMany({
    where: { companyId: ctx.companyId || "", OR: [{ employeeId: { in: ids } }, { departmentId: { in: people.map((person) => person.departmentId).filter((id): id is string => Boolean(id)) } }] },
    include: { employee: true, },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageTitle title="Goals & KPI" subtitle="Assign a goal to someone who reports to you. After it is assigned, they can update progress. You can still change the target." />
      <Banner ok={params.ok} error={params.error} />
      <form action={goalAction} className="tone-card teal" style={{ marginBottom: 14 }}>
        <TInput type="hidden" name="return" value="/goals" />
        <p className="section-label"><Tx text={"Add a target"} /></p>
        <div className="form-grid">
          <label className="field"><Tx text={"Person"} />
            <select name="employeeId" required>
              {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
          <label className="field"><Tx text={"Title"} /><TInput name="title" required /></label>
          <label className="field"><Tx text={"Measure"} /><TInput name="metric" required /></label>
          <label className="field"><Tx text={"Target"} /><TInput name="target" type="number" min={0.01} step="0.01" required /></label>
          <label className="field"><Tx text={"Unit"} /><TInput name="unit" /></label>
          <label className="field"><Tx text={"Start"} /><TInput name="startDate" type="date" required /></label>
          <label className="field"><Tx text={"End"} /><TInput name="endDate" type="date" required /></label>
        </div>
        <button className="btn" type="submit"><Tx text={"Add target"} /></button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Who"} /></th><th><Tx text={"Goal"} /></th><th><Tx text={"Progress"} /></th><th><Tx text={"Period"} /></th><th></th></tr></thead>
          <tbody>
            {goals.length === 0 ? <tr><td colSpan={5}><Tx text={"No goals in this scope."} /></td></tr> : goals.map((goal) => (
              <tr key={goal.id}>
                <td>{goal.departmentId ? "Team" : goal.employee.fullName}</td>
                <td>{goal.title}<span className="hint"> {goal.metric}</span></td>
                <td>{goal.current} / {goal.target} {goal.unit}</td>
                <td>{goal.startDate} – {goal.endDate}<br /><Status value={goal.status} /></td>
                <td>
                  {goal.status === "DRAFT" ? <span className="hint"><Tx text={"Draft"} /></span> : (
                    <form action={goalProgressAction} className="goal-update">
                      <TInput type="hidden" name="return" value="/goals" />
                      <TInput type="hidden" name="id" value={goal.id} />
                      <TInput name="current" type="number" min={0} step="0.01" defaultValue={goal.current} aria-label="Progress" />
                      <TInput name="target" type="number" min={0.01} step="0.01" defaultValue={goal.target} aria-label="Target" />
                      <select name="status" defaultValue={goal.status} aria-label="Status">
                        <option value={goal.status}><Tx text={"Open"} /></option>
                        <option value="DONE"><Tx text={"Done"} /></option>
                        <option value="CANCELLED"><Tx text={"Cancelled"} /></option>
                      </select>
                      <button className="btn secondary" type="submit"><Tx text={"Save"} /></button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reports.length ? (
        <form action={meetingAction} className="card stack-form" style={{ marginTop: 14 }}>
          <p className="section-label"><Tx text={"1-on-1 note"} /></p>
          <p className="hint"><Tx text={"Only for someone who reports to you. They can read the note. It is not a score and it does not change pay."} /></p>
          <label className="field"><Tx text={"Person"} /><select name="employeeId">{reports.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
          <label className="field"><Tx text={"Meeting date"} /><TInput name="meetingDate" type="date" required max={new Date().toISOString().slice(0, 10)} /></label>
          <label className="field"><Tx text={"Note"} /><TTextarea name="note" required /></label>
          <button className="btn" type="submit"><Tx text={"Save note"} /></button>
        </form>
      ) : null}
      {notes.length ? <div className="card" style={{ marginTop: 14 }}>{notes.map((note) => <p className="record" key={note.id}><strong>{note.employee.fullName} · {note.meetingDate}</strong><span>{note.note}</span></p>)}</div> : null}
    </div>
  );
}