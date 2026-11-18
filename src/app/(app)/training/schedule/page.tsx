import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/context";
import { canReadTraining, listTrainings, trainingPhase } from "@/server/training";
import { Tx } from "@/components/locale";
import { PageTitle, Status } from "@/components/ui";

export default async function TrainingSchedulePage() {
  const ctx = await requireUser();
  if (!canReadTraining(ctx)) redirect("/forbidden?need=training.self");
  const rows = (await listTrainings(ctx)).filter((row) => row.status !== "CANCELLED");
  return (
    <div>
      <PageTitle title="Training Schedule" />
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Time"} /></th><th><Tx text={"Training name"} /></th><th><Tx text={"Method"} /></th><th><Tx text={"Status"} /></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5}><Tx text={"No training in this list."} /></td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.sessionDate}</td>
                <td>{row.startTime}–{row.endTime}</td>
                <td><Link href={`/training/${row.id}`}>{row.name}</Link></td>
                <td><Status value={row.method} /></td>
                <td><Status value={trainingPhase(row)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
