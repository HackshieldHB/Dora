import { Tx, TInput } from "@/components/locale";
import Link from "next/link";
import { requirePerm } from "@/lib/context";
import { previewEmployeeImport } from "@/server/import";
import { cancelImportAction, confirmImportAction } from "@/app/actions";
import { translate } from "@/lib/i18n";
import { PageTitle, Status } from "@/components/ui";

export default async function ImportPreviewPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const ctx = await requirePerm("employees.manage");
  const { batch = "" } = await searchParams;
  const rows = await previewEmployeeImport(ctx, batch);
  if (!rows) {
    return (
      <div>
        <PageTitle title="Import preview" subtitle="Upload the Excel file again from Employee Directory." />
        <div className="card"><Link href="/employees"><Tx text={"Back to Employee Directory"} /></Link></div>
      </div>
    );
  }
  const added = rows.filter((row) => row.kind === "new").length;
  const updated = rows.filter((row) => row.kind === "update").length;
  const invalid = rows.filter((row) => row.kind === "invalid");
  return (
    <div>
      <PageTitle title="Import preview" subtitle="Confirm adds only the valid new rows. An existing employee ID or email is rejected and is not overwritten." />
      <div className="card" style={{ marginBottom: 12 }}>
        <dl className="facts">
          <div><dt><Tx text={"Total rows"} /></dt><dd>{rows.length}</dd></div>
          <div><dt><Tx text={"New employees"} /></dt><dd>{added}</dd></div>
          <div><dt><Tx text={"Existing employees"} /></dt><dd>{updated}</dd></div>
          <div><dt><Tx text={"Invalid rows"} /></dt><dd>{invalid.length}</dd></div>
        </dl>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <form action={confirmImportAction}><TInput type="hidden" name="batch" value={batch} /><button className="btn" type="submit"><Tx text={"Confirm Import"} /></button></form>
          <form action={cancelImportAction}><TInput type="hidden" name="batch" value={batch} /><button className="btn secondary" type="submit"><Tx text={"Cancel"} /></button></form>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Row"} /></th><th>ID</th><th><Tx text={"Name"} /></th><th><Tx text={"Status in file"} /></th><th><Tx text={"Department"} /></th><th><Tx text={"Branch"} /></th><th><Tx text={"Location"} /></th><th><Tx text={"Result"} /></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.row}>
                <td>{row.row}</td>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.status ? <Status value={row.status} /> : "—"}</td>
                <td>{row.department}</td>
                <td>{row.branch}</td>
                <td>{row.location}</td>
                <td>{row.kind === "invalid" ? translate(ctx.locale, row.reason) : "New draft"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
