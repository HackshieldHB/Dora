import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPerm, requireUser } from "@/lib/context";
import { trainingOverview, trainingPhase } from "@/server/training";
import { Tx } from "@/components/locale";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function TrainingOverviewPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; tab?: string }> }) {
  const ctx = await requireUser();
  if (!hasPerm(ctx, "training.view") && !hasPerm(ctx, "training.manage")) redirect("/forbidden?need=training.view");
  const params = await searchParams;
  const data = await trainingOverview(ctx);
  const tab = params.tab === "ONGOING" || params.tab === "COMPLETED" ? params.tab : "UPCOMING";
  const rows = data.rows.filter((row) => trainingPhase(row) === tab);
  const cards = [
    ["Training programs", data.total],
    ["Active training", data.active],
    ["Participants", data.participants],
    ["Completed training", data.done],
    ["Average evaluation", data.average || "—"],
  ] as const;
  return (
    <div>
      <PageTitle title="Training Overview">
        {hasPerm(ctx, "training.manage") ? <Link className="btn" href="/training/catalog#create"><Tx text={"Create training"} /></Link> : null}
        {hasPerm(ctx, "training.export") || hasPerm(ctx, "reports.export") ? <form method="get" action="/api/training/export"><button className="btn secondary" type="submit"><Tx text={"Export Excel"} /></button></form> : null}
      </PageTitle>
      <Banner ok={params.ok} error={params.error} />
      <div className="kpi-grid">
        {cards.map(([label, value]) => <div className="card kpi" key={label}><p className="kpi-label"><Tx text={label} /></p><strong>{value}</strong></div>)}
      </div>
      <div className="tabs">
        <Link className={tab === "UPCOMING" ? "active" : ""} href="?tab=UPCOMING"><Tx text={"Upcoming"} /></Link>
        <Link className={tab === "ONGOING" ? "active" : ""} href="?tab=ONGOING"><Tx text={"In progress"} /></Link>
        <Link className={tab === "COMPLETED" ? "active" : ""} href="?tab=COMPLETED"><Tx text={"Completed training"} /></Link>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Training name"} /></th><th><Tx text={"Date"} /></th><th><Tx text={"Method"} /></th><th><Tx text={"Participant quota"} /></th><th><Tx text={"Participants"} /></th><th><Tx text={"Status"} /></th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7}><Tx text={"No training in this list."} /></td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.sessionDate}</td>
                <td><Status value={row.method} /></td>
                <td>{row.capacity}</td>
                <td>{row.participants.filter((person) => person.status !== "CANCELLED").length}</td>
                <td><Status value={trainingPhase(row)} /></td>
                <td><Link href={`/training/${row.id}`}><Tx text={"View detail"} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
