import { Tx, TInput } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { formatIdr } from "@/lib/format";
import { claimPostAction, loanInstallmentAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function PayrollLoansPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("payroll.prepare");
  const params = await searchParams;
  const loans = await prisma.employeeLoan.findMany({
    where: { companyId: ctx.companyId || "", status: { in: ["ACTIVE", "CLOSED", "PAID_OFF"] } },
    include: { employee: true, installments: true },
    orderBy: { createdAt: "desc" },
  });
  const claims = await prisma.reimbursement.findMany({
    where: { companyId: ctx.companyId || "", status: "APPROVED" },
    include: { employee: true },
    orderBy: { expenseDate: "desc" },
  });
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId: ctx.companyId || "", status: { in: ["DRAFT", "PROCESSED", "NEEDS_REVISION"] }, kind: "REGULAR" },
    orderBy: { startDate: "desc" },
  });
  return (
    <div>
      <PageTitle title="Employee Loans" subtitle="An approved loan is deducted in the approval month and the months after it. Recalculate a draft payroll to add the installment. The balance changes only after that payroll is locked. This does not change the pay formula." />
      <Banner ok={params.ok} error={params.error} />
      <div className="card table-wrap">
        {loans.length === 0 ? <p className="empty"><Tx text={"No approved loans."} /></p> : (
          <table>
            <thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Remaining"} /></th><th><Tx text={"Installment"} /></th><th><Tx text={"Status"} /></th><th></th></tr></thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.employee.fullName}</td>
                  <td>{formatIdr(loan.remaining)}</td>
                  <td>{formatIdr(Math.min(loan.remaining, loan.installment))}</td>
                  <td><Status value={loan.status} /></td>
                  <td>
                    {loan.status === "ACTIVE" && periods.length > 0 ? (
                      <form action={loanInstallmentAction} className="goal-update">
                        <TInput type="hidden" name="loanId" value={loan.id} />
                        <select name="periodId" aria-label="Payroll period">
                          {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                        </select>
                        <button className="btn secondary" type="submit"><Tx text={"Post installment"} /></button>
                      </form>
                    ) : <span className="hint">{loan.installments.length} posted</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card table-wrap" style={{ marginTop: 14 }}>
        <p className="section-label"><Tx text={"Approved claims waiting for a period"} /></p>
        {claims.length === 0 ? <p className="empty"><Tx text={"No approved claim is waiting. A claim with an open payroll period is posted when the supervisor approves it."} /></p> : (
          <table>
            <thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Type"} /></th><th><Tx text={"Amount"} /></th><th></th></tr></thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td>{claim.employee.fullName}</td>
                  <td>{claim.kind === "HEALTH" ? "Health" : "Transport"} · {claim.expenseDate}</td>
                  <td>{formatIdr(claim.amount)}</td>
                  <td>{periods.length > 0 ? (
                    <form action={claimPostAction} className="goal-update">
                      <TInput type="hidden" name="claimId" value={claim.id} />
                      <select name="periodId" aria-label="Payroll period">{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select>
                      <button className="btn secondary" type="submit"><Tx text={"Post claim"} /></button>
                    </form>
                  ) : <span className="hint"><Tx text={"Open a draft period first"} /></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}