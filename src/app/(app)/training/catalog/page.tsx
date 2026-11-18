import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPerm, requireUser } from "@/lib/context";
import { companyEmployees, listTrainings, trainingPhase } from "@/server/training";
import { trainingCreateAction } from "@/app/actions";
import { Tx } from "@/components/locale";
import { SearchField } from "@/components/search-field";
import { TrainingFields } from "@/components/training-fields";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function TrainingCatalogPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const ctx = await requireUser();
  if (!hasPerm(ctx, "training.view") && !hasPerm(ctx, "training.self") && !hasPerm(ctx, "training.manage")) redirect("/forbidden?need=training.self");
  const params = await searchParams;
  const rows = (await listTrainings(ctx, params.q || "")).filter((row) => row.status !== "CANCELLED" && (hasPerm(ctx, "training.manage") || row.enrollment === "OPEN" || row.participants.some((person) => person.employeeId === ctx.employeeId)));
  const employees = hasPerm(ctx, "training.manage") ? await companyEmployees(ctx) : [];
  return (
    <div>
      <PageTitle title="Training Catalog" />
      <Banner ok={params.ok} error={params.error} />
      <form className="toolbar">
        <SearchField defaultValue={params.q || ""} placeholder="Search training" />
        <button className="btn" type="submit"><Tx text={"Search"} /></button>
      </form>
      <div className="training-grid">
        {rows.length === 0 ? <div className="card empty"><Tx text={"No training in this list."} /></div> : rows.map((row) => (
          <Link key={row.id} className="card training-card" href={`/training/${row.id}`}>
            <Status value={row.category} />
            <strong>{row.name}</strong>
            <span>{row.sessionDate} · {row.startTime}</span>
            <Status value={trainingPhase(row)} />
            <span className="text-action"><Tx text={"View detail"} /></span>
          </Link>
        ))}
      </div>
      {hasPerm(ctx, "training.manage") ? (
        <form id="create" action={trainingCreateAction} className="card stack-form" style={{ marginTop: 12 }}>
          <p className="section-label"><Tx text={"Create training"} /></p>
          <TrainingFields employees={employees.map((person) => ({ id: person.id, fullName: person.fullName }))} />
          <button className="btn" type="submit"><Tx text={"Create training"} /></button>
        </form>
      ) : null}
    </div>
  );
}
