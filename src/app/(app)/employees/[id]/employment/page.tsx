import { Tx, TInput } from "@/components/locale";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/context";
import { getEmployee } from "@/server/people";
import { lookups } from "@/server/lookups";
import { employmentAction } from "@/app/actions";
import { Banner, PageTitle } from "@/components/ui";

export default async function EmploymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("employees.manage");
  const { id } = await params;
  const query = await searchParams;
  let employee;
  try { employee = await getEmployee(ctx, id); } catch { notFound(); }
  const data = await lookups(employee.companyId);
  return (
    <div>
      <PageTitle title="Employment change" subtitle="A future effective date is stored and applied when that date arrives. Previous values stay in history." />
      <Banner ok={query.ok} error={query.error} />
      <form action={employmentAction} className="card" style={{ display: "grid", gap: 10 }}>
        <TInput type="hidden" name="id" value={id} />
        <label className="field"><Tx text={"Change type"} /><select name="changeType"><option value="PROMOTION"><Tx text="Promotion" /></option><option value="TRANSFER"><Tx text="Transfer" /></option><option value="CONTRACT"><Tx text="Contract" /></option><option value="STATUS"><Tx text="Status" /></option><option value="SALARY"><Tx text="Salary" /></option></select></label>
        <label className="field"><Tx text={"Effective date"} /><TInput name="effectiveDate" type="date" required /></label>
        <label className="field"><Tx text={"Department"} /><select name="departmentId" defaultValue={employee.departmentId || ""}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="field"><Tx text={"Position"} /><select name="positionId" defaultValue={employee.positionId || ""}>{data.positions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="field"><Tx text={"Branch"} /><select name="branchId" defaultValue={employee.branchId || ""}>{data.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="field"><Tx text={"Work location"} /><select name="locationId" defaultValue={employee.locationId || ""}>{data.locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="field"><Tx text={"Supervisor"} /><select name="managerId" defaultValue={employee.managerId || ""}><option value=""><Tx text={"None"} /></option>{data.employees.filter((row) => row.id !== id).map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label>
        <label className="field"><Tx text={"Employment type"} /><select name="employmentType" defaultValue={employee.employmentType}><option value="PERMANENT"><Tx text="Permanent" /></option><option value="CONTRACT"><Tx text="Contract" /></option><option value="PROBATION"><Tx text="Probation" /></option></select></label>
        <label className="field"><Tx text={"Contract end"} /><TInput name="contractEnd" type="date" defaultValue={employee.contractEnd} /></label>
        {ctx.permissions.has("employees.salary") ? <label className="field"><Tx text={"Basic salary"} /><TInput name="basicSalary" type="number" defaultValue={employee.basicSalary} /></label> : null}
        <button className="btn" type="submit"><Tx text={"Save change"} /></button>
      </form>
    </div>
  );
}
