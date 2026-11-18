import { Tx, TInput } from "@/components/locale";
import Link from "next/link";
import { requirePerm } from "@/lib/context";
import { listEmployees } from "@/server/people";
import { lookups } from "@/server/lookups";
import { Avatar, Banner, PageTitle, Status } from "@/components/ui";
import { importAction } from "@/app/actions";
import { SearchField } from "@/components/search-field";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePerm("employees.view");
  const params = await searchParams;
  const sort = params.sort === "asc" || params.sort === "desc" ? params.sort : "";
  const rows = await listEmployees(ctx, { q: params.q || "", status: params.status || "", branchId: params.branchId || "", departmentId: params.departmentId || "", locationId: params.locationId || "", sort });
  const sortQuery = new URLSearchParams();
  for (const key of ["q", "status", "branchId", "departmentId", "locationId"] as const) if (params[key]) sortQuery.set(key, params[key]);
  sortQuery.set("sort", sort === "asc" ? "desc" : "asc");
  const options = ctx.companyId ? await lookups(ctx.companyId) : null;
  return (
    <div>
      <PageTitle title="Employee Directory">
        {ctx.permissions.has("employees.manage") ? <Link className="btn" href="/employees/onboarding"><Tx text={"Onboarding"} /></Link> : null}
        {ctx.permissions.has("employees.export") ? <form method="get" action="/api/employees/export">{Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])).map(([name, value]) => <TInput key={name} type="hidden" name={name} value={value} />)}<button className="btn secondary"><Tx text={"Export Excel"} /></button></form> : null}
      </PageTitle>
      <Banner ok={params.ok} error={params.error} />
      <form className="toolbar">
        <SearchField placeholder="Search name, ID, email" defaultValue={params.q || ""} />
        <select name="status" defaultValue={params.status || ""}><option value=""><Tx text={"Any status"} /></option><option value="DRAFT"><Tx text={"Draft"} /></option><option value="ACTIVE"><Tx text={"Active"} /></option><option value="PENDING OFFBOARDING"><Tx text={"Pending offboarding"} /></option><option value="INACTIVE"><Tx text={"Inactive"} /></option></select>
        <select name="branchId" defaultValue={params.branchId || ""}><option value=""><Tx text={"Any branch"} /></option>{options?.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select name="departmentId" defaultValue={params.departmentId || ""}><option value=""><Tx text={"Any department"} /></option>{options?.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select name="locationId" defaultValue={params.locationId || ""}><option value=""><Tx text={"Any location"} /></option>{options?.locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        {sort ? <TInput type="hidden" name="sort" value={sort} /> : null}
        <div className="toolbar-actions"><button className="btn" type="submit"><Tx text={"Filter"} /></button></div>
      </form>
      {ctx.permissions.has("employees.manage") ? (
        <details className="card" style={{ marginBottom: 12 }}>
          <summary><Tx text={"Import Excel"} /></summary>
          <p className="hint"><Tx text={"Columns: ID, Name, Status, Department, Branch, Location. New employees stay Draft. An existing ID is updated after you confirm the preview, and fields left blank stay as they are."} /></p>
          <div className="import-row">
            <form action={importAction} className="import-row">
              <TInput name="file" type="file" accept=".xlsx" required />
              <button className="btn secondary" type="submit"><Tx text={"Import"} /></button>
            </form>
            <form method="get" action="/api/employees/template"><button className="btn secondary" type="submit"><Tx text={"Download Template Excel"} /></button></form>
          </div>
        </details>
      ) : null}
      <div className="card table-wrap">
        {rows.length === 0 ? <p><Tx text={"No employees match this filter."} /></p> : (
          <table>
            <thead><tr><th><Link className="text-action" href={`/employees?${sortQuery.toString()}`}>ID{sort === "asc" ? " ↑" : sort === "desc" ? " ↓" : ""}</Link></th><th><Tx text={"Name"} /></th><th><Tx text={"Status"} /></th><th><Tx text={"Department"} /></th><th><Tx text={"Branch"} /></th><th><Tx text={"Location"} /></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="row-link">
                  <td><Link href={`/employees/${row.id}`}>{row.employeeCode}</Link></td>
                  <td><Link className="person" href={`/employees/${row.id}`}><Avatar name={row.fullName} /><span><strong>{row.fullName}</strong><span className="hint">{row.position?.name || row.department?.name}</span></span></Link></td>
                  <td><Link href={`/employees/${row.id}`}><Status value={row.status} /></Link></td>
                  <td><Link href={`/employees/${row.id}`}>{row.department?.name}</Link></td>
                  <td><Link href={`/employees/${row.id}`}>{row.branch?.name}</Link></td>
                  <td><Link href={`/employees/${row.id}`}>{row.location?.name}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
