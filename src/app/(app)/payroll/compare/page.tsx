import { Tx } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { formatIdr } from "@/lib/format";
import { PageTitle } from "@/components/ui";

export default async function PayComparePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requirePerm("payroll.view");
  const params = await searchParams;
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId: ctx.companyId || "", status: { in: ["PROCESSED", "SUBMITTED", "APPROVED", "LOCKED"] }, kind: "REGULAR" },
    orderBy: { startDate: "desc" },
  });
  const selected = periods.find((period) => period.id === params.period) || periods[0];
  const previous = selected
    ? periods.find((period) => period.status === "LOCKED" && period.endDate < selected.startDate)
    : undefined;
  const currentItems = selected ? await prisma.payrollItem.findMany({ where: { periodId: selected.id }, include: { employee: true } }) : [];
  const previousItems = previous ? await prisma.payrollItem.findMany({ where: { periodId: previous.id } }) : [];
  const before = new Map(previousItems.map((item) => [item.employeeId, item.net]));
  return (
    <div>
      <PageTitle title="Pay comparison" subtitle="Net pay next to the previous locked regular period. This is a comparison only. It does not change the payroll formula." />
      {periods.length === 0 || !selected ? <div className="card"><Tx text={"Process a regular payroll before comparing it."} /></div> : (
        <>
          <form className="toolbar" method="get">
            <label className="field"><Tx text={"Period"} /><select name="period" defaultValue={selected.id}>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label>
            <button className="btn" type="submit"><Tx text={"Show"} /></button>
          </form>
          {!previous ? <p className="hint"><Tx text={"There is no earlier locked regular period to compare with."} /></p> : (
            <div className="card table-wrap">
              <table>
                <thead><tr><th><Tx text={"Employee"} /></th><th>{selected.name}</th><th>{previous.name}</th><th><Tx text={"Change"} /></th></tr></thead>
                <tbody>
                  {currentItems.map((item) => {
                    const old = before.get(item.employeeId);
                    const delta = old == null ? null : item.net - old;
                    return (
                      <tr key={item.id}>
                        <td>{item.employee.fullName}</td>
                        <td>{formatIdr(item.net)}</td>
                        <td>{old == null ? "—" : formatIdr(old)}</td>
                        <td>{delta == null ? "New" : `${delta > 0 ? "+" : ""}${formatIdr(delta)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
