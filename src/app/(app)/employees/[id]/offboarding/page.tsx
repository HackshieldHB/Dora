import { Tx, TInput, TTextarea } from "@/components/locale";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/context";
import { getEmployee } from "@/server/people";
import { offboardAction } from "@/app/actions";
import { Banner, PageTitle } from "@/components/ui";

export default async function OffboardingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("employees.manage");
  const { id } = await params;
  const query = await searchParams;
  let employee;
  try { employee = await getEmployee(ctx, id); } catch { notFound(); }
  const recorded = Boolean(employee.exitType) || employee.status === "PENDING OFFBOARDING" || employee.status === "INACTIVE";
  return (
    <div>
      <PageTitle title="Offboarding" subtitle={`${employee.employeeCode} · ${employee.fullName}. Clearance and final payroll are tracked. They are not required to record offboarding.`} />
      <Banner ok={query.ok} error={query.error} />
      {recorded ? (
        <div className="card">
          <p>Status: {employee.status}</p>
          <p>Exit type: {employee.exitType || "—"}</p>
          <p>Reason: {employee.exitReason || "—"}</p>
          <p>Last working day: {employee.lastWorkingDay || "—"}</p>
          <p>Access: {employee.clearanceAccess ? "Closed" : "Open"} · Items: {employee.clearanceAssets ? "Returned" : "Outstanding"} · BPJS: {employee.clearanceBpjs ? "Noted" : "Not yet"} · Final pay: {employee.finalPayrollDone ? "Arranged" : "Not yet"}</p>
          <p>Clearance: {employee.clearanceDone ? "Done" : "Not done"}</p>
          <p>Final payroll: {employee.finalPayrollDone ? "Done" : "Not done"}</p>
          <p><a href={`/api/employees/${employee.id}/experience`}><Tx text={"Download the work experience letter"} /></a><Tx text={". It lists the role and the dates. Salary is not included."} /></p>
        </div>
      ) : (
        <form action={offboardAction} className="card" style={{ display: "grid", gap: 10 }}>
          <TInput type="hidden" name="id" value={id} />
          <label className="field"><Tx text={"Exit type"} /><select name="exitType" required><option value=""><Tx text={"Select"} /></option><option value="RESIGNATION"><Tx text="Resignation" /></option><option value="TERMINATION"><Tx text="Termination" /></option><option value="CONTRACT_END"><Tx text="Contract end" /></option></select></label>
          <label className="field"><Tx text={"Reason"} /><TTextarea name="exitReason" required /></label>
          <label className="field"><Tx text={"Last working day"} /><TInput name="lastWorkingDay" type="date" required /></label>
          <label><TInput name="clearanceAccess" type="checkbox" /> <Tx text={"Access closed"} /></label>
          <label><TInput name="clearanceAssets" type="checkbox" /> <Tx text={"Company items returned"} /></label>
          <label><TInput name="clearanceBpjs" type="checkbox" /> <Tx text={"BPJS exit noted"} /></label>
          <label><TInput name="finalPayrollDone" type="checkbox" /> <Tx text={"Final pay arranged"} /></label>
          <p className="hint"><Tx text={"Clearance is complete only when all four are ticked. You can still record the exit if some are still open."} /></p>
          <button className="btn" type="submit"><Tx text={"Record offboarding"} /></button>
        </form>
      )}
    </div>
  );
}