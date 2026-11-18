import { Tx, TInput } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { goalAction, goalProgressAction, goalReviseAction, goalSubmitAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function MyGoalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("employees.self");
  const params = await searchParams;
  if (!ctx.employeeId || !ctx.companyId) return <div className="card"><Tx text={"Your account is not linked to an employee."} /></div>;
  const me = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
  const notes = await prisma.oneOnOne.findMany({ where: { employeeId: ctx.employeeId }, orderBy: { meetingDate: "desc" }, take: 8 });
  const goals = await prisma.goal.findMany({
    where: {
      companyId: ctx.companyId,
      OR: [
        { employeeId: ctx.employeeId },
        ...(me?.departmentId ? [{ departmentId: me.departmentId }] : []),
      ],
    },
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  });
  const reports = await prisma.employee.count({ where: { managerId: ctx.employeeId, status: "ACTIVE" } });
  return (
    <div>
      <PageTitle title="My Goals" subtitle="A personal goal stays editable until you submit it. After that, the wording is locked and you can change the target and the progress. A goal assigned by your manager can only have its progress updated." />
      <Banner ok={params.ok} error={params.error} />
      <form action={goalAction} className="tone-card violet" style={{ marginBottom: 14 }}>
        <p className="section-label"><Tx text={"New target"} /></p>
        <div className="form-grid">
          <label className="field"><Tx text={"Title"} /><TInput name="title" required placeholder="What should be achieved" /></label>
          <label className="field"><Tx text={"Measure"} /><TInput name="metric" required placeholder="Visits, days, score" /></label>
          <label className="field"><Tx text={"Target"} /><TInput name="target" type="number" min={0.01} step="0.01" required /></label>
          <label className="field"><Tx text={"Unit"} /><TInput name="unit" placeholder="visits, %" /></label>
          <label className="field"><Tx text={"Start"} /><TInput name="startDate" type="date" required /></label>
          <label className="field"><Tx text={"End"} /><TInput name="endDate" type="date" required /></label>
        </div>
        {reports > 0 ? <label><TInput name="team" type="checkbox" value="1" /> <Tx text={"Team goal for my department"} /></label> : null}
        <button className="btn" type="submit"><Tx text={"Add target"} /></button>
      </form>
      <div className="goal-list">
        {goals.length === 0 ? <div className="card"><Tx text={"No goals yet."} /></div> : goals.map((goal) => {
          const width = goal.target > 0 ? Math.max(0, Math.min(100, (goal.current / goal.target) * 100)) : 0;
          const assignedToMe = Boolean(goal.assignedById) && goal.employeeId === ctx.employeeId && goal.assignedById !== ctx.employeeId;
          const mine = goal.employeeId === ctx.employeeId && !assignedToMe;
          return (
            <article className="card goal-card" key={goal.id}>
              <div className="meter-top"><strong>{goal.title}</strong><Status value={goal.status === "DRAFT" ? "DRAFT" : goal.departmentId ? "Team" : assignedToMe ? "Assigned" : "Individual"} /></div>
              <p className="hint">{goal.metric}{goal.unit ? ` · ${goal.unit}` : ""} · {goal.startDate} – {goal.endDate}{mine ? "" : ` · ${goal.employee.fullName}`}</p>
              <div className="meter"><div className="meter-top"><span>{goal.current} / {goal.target}</span><strong>{Math.round(width)}%</strong></div><div className="meter-track"><div className="meter-fill" style={{ width: `${width}%` }} /></div></div>
              {mine && goal.status === "DRAFT" ? (
                <form action={goalReviseAction} className="form-grid">
                  <TInput type="hidden" name="id" value={goal.id} />
                  <label className="field"><Tx text={"Title"} /><TInput name="title" defaultValue={goal.title} required /></label>
                  <label className="field"><Tx text={"Measure"} /><TInput name="metric" defaultValue={goal.metric} required /></label>
                  <label className="field"><Tx text={"Target"} /><TInput name="target" type="number" min={0.01} step="0.01" defaultValue={goal.target} required /></label>
                  <label className="field"><Tx text={"Unit"} /><TInput name="unit" defaultValue={goal.unit} /></label>
                  <label className="field"><Tx text={"Start"} /><TInput name="startDate" type="date" defaultValue={goal.startDate} required /></label>
                  <label className="field"><Tx text={"End"} /><TInput name="endDate" type="date" defaultValue={goal.endDate} required /></label>
                  <button className="btn secondary" type="submit"><Tx text={"Save draft"} /></button>
                </form>
              ) : null}
              {mine && goal.status === "DRAFT" ? (
                <form action={goalSubmitAction}><TInput type="hidden" name="id" value={goal.id} /><button className="btn" type="submit"><Tx text={"Submit goal"} /></button></form>
              ) : null}
              {goal.status !== "DRAFT" && (mine || assignedToMe) ? (
                <form action={goalProgressAction} className="goal-update">
                  <TInput type="hidden" name="id" value={goal.id} />
                  <label className="field"><Tx text={"Progress"} /><TInput name="current" type="number" min={0} step="0.01" defaultValue={goal.current} /></label>
                  {mine ? <label className="field"><Tx text={"Target"} /><TInput name="target" type="number" min={0.01} step="0.01" defaultValue={goal.target} /></label> : null}
                  <label className="field"><Tx text={"Status"} />
                    <select name="status" defaultValue={goal.status}>
                      <option value={goal.status}>{goal.status === "DONE" ? "Done" : "Open"}</option>
                      <option value="DONE"><Tx text={"Done"} /></option>
                      {mine ? <option value="CANCELLED"><Tx text={"Cancelled"} /></option> : null}
                    </select>
                  </label>
                  <button className="btn secondary" type="submit"><Tx text={"Update"} /></button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <p className="section-label"><Tx text={"Notes from your manager"} /></p>
        {notes.length === 0 ? <p className="empty"><Tx text={"No 1-on-1 notes yet."} /></p> : notes.map((note) => <p className="record" key={note.id}><strong>{note.meetingDate}</strong><span>{note.note}</span></p>)}
      </div>
    </div>
  );
}