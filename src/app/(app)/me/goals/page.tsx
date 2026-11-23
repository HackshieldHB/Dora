import { Tx, TInput, TTextarea } from "@/components/locale";
import Link from "next/link";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { kpiAchievement } from "@/lib/domain";
import { goalAction, goalProgressAction, goalReviseAction, goalSubmitAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function MyGoalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; tab?: string }> }) {
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
      <PageTitle title="My Goals" subtitle="Personal goals stay yours. An official KPI appears here only after your manager’s supervisor approves it. You update the actual result; you cannot change the target." />
      <Banner ok={params.ok} error={params.error} />
      <div className="tabs">
        <Link className={params.tab === "assigned" ? "" : "active"} href="/me/goals"><Tx text={"Personal goals"} /></Link>
        <Link className={params.tab === "assigned" ? "active" : ""} href="/me/goals?tab=assigned"><Tx text={"Assigned KPI"} /></Link>
      </div>
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
        {(() => {
          const assigned = goals.filter((goal) => goal.employeeId === ctx.employeeId && (goal.approvalStatus === "APPROVED" || (!goal.approvalStatus && goal.assignedById && goal.assignedById !== ctx.employeeId && goal.status !== "DRAFT")));
          const shown = params.tab === "assigned" ? assigned : goals.filter((goal) => !goal.approvalStatus && !(goal.assignedById && goal.assignedById !== ctx.employeeId && goal.employeeId === ctx.employeeId));
          if (shown.length === 0) return <div className="card"><Tx text={params.tab === "assigned" ? "No assigned KPI yet." : "No goals yet."} /></div>;
          return shown.map((goal) => {
          const width = goal.target > 0 ? Math.max(0, Math.min(100, (goal.current / goal.target) * 100)) : 0;
          const assignedToMe = params.tab === "assigned";
          const mine = !assignedToMe && goal.employeeId === ctx.employeeId;
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
              {assignedToMe ? <p className="hint"><Tx text={"Achievement"} /> {kpiAchievement(goal.direction, goal.target, goal.current).toFixed(1)}%{goal.weight ? ` · ${goal.weight}%` : ""} · {goal.direction || "HIGHER"}</p> : null}
              {goal.feedback ? <p className="hint">{goal.feedback}</p> : null}
              {assignedToMe && !["SUBMITTED", "PENDING_FINAL", "FINALIZED"].includes(goal.evalStatus) ? (
                <form action={goalProgressAction} className="stack-form">
                  <TInput type="hidden" name="return" value="/me/goals?tab=assigned" />
                  <TInput type="hidden" name="id" value={goal.id} />
                  <label className="field"><Tx text={"Actual"} /><TInput name="current" type="number" min={0} step="0.01" defaultValue={goal.current} /></label>
                  <label className="field"><Tx text={"Note"} /><TTextarea name="note" defaultValue={goal.progressNote} /></label>
                  <div className="form-actions">
                    <button className="btn secondary" type="submit" name="intent" value="save"><Tx text={"Save progress"} /></button>
                    <button className="btn" type="submit" name="intent" value="submit"><Tx text={"Submit for review"} /></button>
                  </div>
                </form>
              ) : null}
              {!assignedToMe && goal.status !== "DRAFT" && mine ? (
                <form action={goalProgressAction} className="goal-update">
                  <TInput type="hidden" name="id" value={goal.id} />
                  <label className="field"><Tx text={"Progress"} /><TInput name="current" type="number" min={0} step="0.01" defaultValue={goal.current} /></label>
                  <label className="field"><Tx text={"Target"} /><TInput name="target" type="number" min={0.01} step="0.01" defaultValue={goal.target} /></label>
                  <label className="field"><Tx text={"Status"} />
                    <select name="status" defaultValue={goal.status}>
                      <option value={goal.status}>{goal.status === "DONE" ? "Done" : "Open"}</option>
                      <option value="DONE"><Tx text={"Done"} /></option>
                      <option value="CANCELLED"><Tx text={"Cancelled"} /></option>
                    </select>
                  </label>
                  <button className="btn secondary" type="submit"><Tx text={"Update"} /></button>
                </form>
              ) : null}
            </article>
          );
          });
        })()}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <p className="section-label"><Tx text={"Notes from your manager"} /></p>
        {notes.length === 0 ? <p className="empty"><Tx text={"No 1-on-1 notes yet."} /></p> : notes.map((note) => <p className="record" key={note.id}><strong>{note.meetingDate}</strong><span>{note.note}</span></p>)}
      </div>
    </div>
  );
}