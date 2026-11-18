import Link from "next/link";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { Tx } from "@/components/locale";
import { PageTitle, Status } from "@/components/ui";

export default async function MyTrainingPage() {
  const ctx = await requirePerm("training.self");
  const rows = ctx.employeeId
    ? await prisma.trainingParticipant.findMany({
      where: { employeeId: ctx.employeeId, status: { not: "CANCELLED" } },
      include: { training: true, evaluation: true },
      orderBy: { training: { sessionDate: "asc" } },
    })
    : [];
  return (
    <div>
      <PageTitle title="My Training" />
      <div className="training-grid">
        {rows.length === 0 ? <div className="card empty"><Tx text={"No training is assigned to you yet."} /></div> : rows.map((row) => (
          <Link key={row.id} className="card training-card" href={`/me/training/${row.trainingId}`}>
            <Status value={row.training.category} />
            <strong>{row.training.name}</strong>
            <span>{row.training.sessionDate} · {row.training.startTime}–{row.training.endTime}</span>
            <span>{row.training.method} · {row.training.place}</span>
            <span>{row.training.trainer}</span>
            <Status value={row.status} />
            <span className="text-action"><Tx text={"View detail"} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
