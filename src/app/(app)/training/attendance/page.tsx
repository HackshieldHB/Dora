import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPerm, requireUser } from "@/lib/context";
import { listTrainings } from "@/server/training";
import { Tx } from "@/components/locale";
import { PageTitle } from "@/components/ui";

export default async function TrainingAttendancePage() {
  const ctx = await requireUser();
  if (!hasPerm(ctx, "training.manage")) redirect("/forbidden?need=training.manage");
  const rows = (await listTrainings(ctx)).filter((row) => row.status !== "CANCELLED");
  return (
    <div>
      <PageTitle title="Participants & Attendance" />
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Training name"} /></th><th><Tx text={"Date"} /></th><th><Tx text={"Participants"} /></th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4}><Tx text={"No training in this list."} /></td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.sessionDate}</td>
                <td>{row.participants.filter((person) => person.status !== "CANCELLED").length}</td>
                <td><Link href={`/training/${row.id}?tab=people`}><Tx text={"Attendance"} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
