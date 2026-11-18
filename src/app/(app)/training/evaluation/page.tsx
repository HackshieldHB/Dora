import { redirect } from "next/navigation";
import { hasPerm, requireUser } from "@/lib/context";
import { evaluationRows } from "@/server/training";
import { Tx } from "@/components/locale";
import { PageTitle } from "@/components/ui";

export default async function TrainingEvaluationPage() {
  const ctx = await requireUser();
  if (!hasPerm(ctx, "training.manage")) redirect("/forbidden?need=training.manage");
  const rows = await evaluationRows(ctx);
  const byTraining = new Map<string, { name: string; scores: number[] }>();
  for (const row of rows) {
    const current = byTraining.get(row.participant.trainingId) || { name: row.participant.training.name, scores: [] };
    current.scores.push(row.overall);
    byTraining.set(row.participant.trainingId, current);
  }
  return (
    <div>
      <PageTitle title="Training Evaluation">
        <form method="get" action="/api/training/export"><button className="btn secondary" type="submit"><Tx text={"Export Excel"} /></button></form>
      </PageTitle>
      <div className="kpi-grid">
        {[...byTraining.entries()].map(([id, item]) => (
          <div className="card kpi" key={id}><p className="kpi-label">{item.name}</p><strong>{Math.round((item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length) * 10) / 10}</strong></div>
        ))}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Training name"} /></th><th><Tx text={"Employee"} /></th><th><Tx text={"Attendance"} /></th><th><Tx text={"Status"} /></th><th><Tx text={"Overall rating"} /></th><th><Tx text={"Comments"} /></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6}><Tx text={"No evaluations yet."} /></td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.participant.training.name}</td>
                <td>{row.participant.employee.fullName}</td>
                <td>{row.participant.attendance || "—"}</td>
                <td>{row.participant.status}</td>
                <td>{row.overall}/5</td>
                <td>{row.comment || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
