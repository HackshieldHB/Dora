import { Tx, TInput, TTextarea } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { overtimeAction, resubmitOvertimeAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function MyOvertimePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("overtime.self");
  const params = await searchParams;
  const rows = ctx.employeeId ? await prisma.overtimeRequest.findMany({ where: { employeeId: ctx.employeeId }, orderBy: { workDate: "desc" } }) : [];
  const returned = rows.filter((row) => row.status === "RETURNED");
  return (
    <div>
      <PageTitle title="My Overtime" subtitle="Your direct supervisor approves or rejects the request. HR later reviews the payable hours. That review is not a second approval." />
      <Banner ok={params.ok} error={params.error} />
      <form action={overtimeAction} className="card stack-form">
        <strong><Tx text={"New request"} /></strong>
        <label className="field"><Tx text={"Date"} /><TInput name="workDate" type="date" required /></label>
        <label className="field"><Tx text={"Start"} /><TInput name="startTime" type="time" required /></label>
        <label className="field"><Tx text={"End"} /><TInput name="endTime" type="time" required /></label>
        <label className="field"><Tx text={"Reason"} /><TTextarea name="reason" required /></label>
        <button className="btn" type="submit"><Tx text={"Submit overtime"} /></button>
      </form>
      {returned.map((row) => (
        <form key={row.id} action={resubmitOvertimeAction} className="card revise">
          <strong><Tx text={"Revise"} /> {row.workDate}</strong>
          <div className="revise-fields">
            <TInput type="hidden" name="id" value={row.id} />
            <label className="field"><Tx text={"Start"} /><TInput name="startTime" type="time" required defaultValue={row.startTime} /></label>
            <label className="field"><Tx text={"End"} /><TInput name="endTime" type="time" required defaultValue={row.endTime} /></label>
            <label className="field"><Tx text={"Reason"} /><TInput name="reason" required defaultValue={row.reason} /></label>
            <button className="btn" type="submit"><Tx text={"Submit again"} /></button>
          </div>
        </form>
      ))}
      <div className="card table-wrap" style={{ marginTop: 12 }}>
        <table><thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Time"} /></th><th><Tx text={"Status"} /></th><th><Tx text={"Validated"} /></th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td>{row.workDate}</td><td>{row.startTime}–{row.endTime}</td><td><Status value={row.status} /></td><td><Status value={row.compensationStatus} /></td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
