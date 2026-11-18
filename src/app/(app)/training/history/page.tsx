import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPerm, requireUser } from "@/lib/context";
import { canReadTraining, historyRows } from "@/server/training";
import { Tx } from "@/components/locale";
import { SearchField } from "@/components/search-field";
import { PageTitle, Status } from "@/components/ui";

export default async function TrainingHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireUser();
  if (!canReadTraining(ctx)) redirect("/forbidden?need=training.self");
  const params = await searchParams;
  const needle = (params.q || "").trim().toLowerCase();
  const manage = hasPerm(ctx, "training.manage");
  const rows = (await historyRows(ctx)).filter((row) => !needle || `${row.training.name} ${row.employee.fullName} ${row.training.category}`.toLowerCase().includes(needle));
  return (
    <div>
      <PageTitle title="Training History">
        {manage || hasPerm(ctx, "reports.export") ? <form method="get" action="/api/training/export"><button className="btn secondary" type="submit"><Tx text={"Export Excel"} /></button></form> : null}
      </PageTitle>
      <form className="toolbar"><SearchField defaultValue={params.q || ""} placeholder="Search training" /><button className="btn" type="submit"><Tx text={"Search"} /></button></form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Training name"} /></th>{manage ? <th><Tx text={"Employee"} /></th> : null}<th><Tx text={"Date"} /></th><th><Tx text={"Category"} /></th><th><Tx text={"Status"} /></th>{manage ? <th><Tx text={"Overall rating"} /></th> : null}<th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7}><Tx text={"No training history yet."} /></td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.training.name}</td>
                {manage ? <td>{row.employee.fullName}</td> : null}
                <td>{row.training.sessionDate}</td>
                <td><Tx text={row.training.category} /></td>
                <td><Status value={row.status} /></td>
                {manage ? <td>{row.evaluation ? `${row.evaluation.overall}/5` : "—"}</td> : null}
                <td>{row.certificateId ? <a href={`/api/files/${row.certificateId}`}><Tx text={"Download certificate"} /></a> : <Link href={`/training/${row.trainingId}`}><Tx text={"View detail"} /></Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
