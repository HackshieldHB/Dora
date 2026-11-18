import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { simulationBaseline } from "@/server/payroll";
import { PageTitle } from "@/components/ui";
import { Tx, TInput } from "@/components/locale";
import { SalarySimulator } from "@/components/salary-simulator";

export default async function SalarySimulationPage({ searchParams }: { searchParams: Promise<{ employee?: string; period?: string; error?: string; q?: string }> }) {
  const ctx = await requirePerm("payroll.simulate");
  const query = await searchParams;
  const companyId = ctx.companyId || "";
  const [employees, periods] = await Promise.all([
    prisma.employee.findMany({ where: { companyId, status: { in: ["ACTIVE", "PENDING OFFBOARDING", "INACTIVE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, employeeCode: true } }),
    prisma.payrollPeriod.findMany({ where: { companyId }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);
  let loaded: Awaited<ReturnType<typeof simulationBaseline>> | null = null;
  let error = query.error || "";
  if (query.employee && query.period) {
    try {
      loaded = await simulationBaseline(ctx, query.employee, query.period);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "The simulation could not be loaded.";
    }
  }
  return (
    <div>
      <PageTitle title="Salary simulation" subtitle="One employee at a time. Nothing on this page is saved to payroll, the employee record, or a payslip." />
      <form className="toolbar" method="get">
        <label className="field"><Tx text="Search" /><TInput name="q" placeholder="Name or employee ID" defaultValue={query.q || ""} /></label>
        <label className="field"><Tx text="Employee" /><select name="employee" defaultValue={query.employee || ""}>{employees.filter((row) => !query.q || `${row.fullName} ${row.employeeCode}`.toLowerCase().includes(query.q.toLowerCase())).map((row) => <option key={row.id} value={row.id}>{row.employeeCode} · {row.fullName}</option>)}</select></label>
        <label className="field"><Tx text="Period" /><select name="period" defaultValue={query.period || ""}>{periods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <div className="toolbar-actions"><button className="btn"><Tx text="Load employee data" /></button></div>
      </form>
      {error ? <p className="banner error">{error}</p> : null}
      {loaded && !loaded.ok ? <div className="card"><p>{loaded.blocked}</p></div> : null}
      {loaded && loaded.ok ? <SalarySimulator initial={loaded.input} baseline={loaded.result} assumption={loaded.assumption} /> : null}
    </div>
  );
}
