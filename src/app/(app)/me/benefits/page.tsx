import { Tx, TInput, TTextarea } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { formatIdr, todayJakarta } from "@/lib/format";
import { loanSchedule, paidLoanMonths } from "@/lib/domain";
import { benefitsAction, claimAction, loanAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";
import { formatMonth } from "@/lib/format";

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("payroll.self");
  const params = await searchParams;
  const employee = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null;
  if (!employee) return <div className="card"><Tx text={"Your account is not linked to an employee."} /></div>;
  const loans = await prisma.employeeLoan.findMany({ where: { employeeId: employee.id }, include: { installments: true }, orderBy: { createdAt: "desc" } });
  const claims = await prisma.reimbursement.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageTitle title="Benefits & Loans" subtitle="Membership numbers are stored here. Contribution amounts and PPh 21 stay on your published payslip, behind your PIN. A transport or health claim needs a receipt and your supervisor’s approval, then payroll posts it as an earning. Nothing on this page is filed to a government system." />
      <Banner ok={params.ok} error={params.error} />
      <div className="profile-board">
        <form action={benefitsAction} className="tone-card blue">
          <p className="section-label"><Tx text={"Membership"} /></p>
          <label className="field"><Tx text={"BPJS Kesehatan number"} /><TInput name="bpjsHealthNo" defaultValue={employee.bpjsHealthNo} /></label>
          <label className="field"><Tx text={"BPJS Ketenagakerjaan number"} /><TInput name="bpjsTkNo" defaultValue={employee.bpjsTkNo} /></label>
          <label className="field"><Tx text={"Private insurance"} /><TInput name="insuranceName" defaultValue={employee.insuranceName} placeholder="Insurer, if the company provides one" /></label>
          <label className="field"><Tx text={"Policy number"} /><TInput name="insuranceNo" defaultValue={employee.insuranceNo} /></label>
          <button className="btn" type="submit"><Tx text={"Save membership"} /></button>
        </form>
        <form action={claimAction} className="tone-card teal">
          <p className="section-label"><Tx text={"Reimbursement"} /></p>
          <p className="hint"><Tx text={"Transport or health, with the receipt. Your supervisor approves it. Payroll then adds one earning adjustment and recalculates. The pay formula does not change."} /></p>
          <label className="field"><Tx text={"Type"} /><select name="kind" defaultValue="TRANSPORT"><option value="TRANSPORT"><Tx text={"Transport"} /></option><option value="HEALTH"><Tx text={"Health"} /></option></select></label>
          <label className="field"><Tx text={"Amount (Rp)"} /><TInput name="amount" type="number" min={1} step={1} required /></label>
          <label className="field"><Tx text={"Expense date"} /><TInput name="expenseDate" type="date" max={todayJakarta()} required /></label>
          <label className="field"><Tx text={"Note"} /><TTextarea name="note" required placeholder="What was paid" /></label>
          <label className="field"><Tx text={"Receipt"} /><TInput name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
          <button className="btn" type="submit"><Tx text={"Submit claim"} /></button>
        </form>
        <form action={loanAction} className="tone-card amber">
          <p className="section-label"><Tx text={"Employee loan"} /></p>
          <p className="hint"><Tx text={"A supervisor approves the request. Installments start in the approval month. The cap is three months of basic salary. One open loan at a time, repaid over 1–24 months."} /></p>
          <label className="field"><Tx text={"Amount (Rp)"} /><TInput name="amount" type="number" min={1} step={1} required /></label>
          <label className="field"><Tx text={"Months"} /><TInput name="tenor" type="number" min={1} max={24} defaultValue={6} required /></label>
          <label className="field"><Tx text={"Reason"} /><TTextarea name="reason" required /></label>
          <button className="btn" type="submit"><Tx text={"Request loan"} /></button>
        </form>
      </div>
      <div className="card table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Type"} /></th><th><Tx text={"Amount"} /></th><th><Tx text={"Receipt"} /></th><th><Tx text={"Status"} /></th></tr></thead>
          <tbody>
            {claims.length === 0 ? <tr><td colSpan={5}><Tx text={"No claims yet."} /></td></tr> : claims.map((claim) => (
              <tr key={claim.id}><td>{claim.expenseDate}</td><td>{claim.kind === "HEALTH" ? "Health" : "Transport"}</td><td>{formatIdr(claim.amount)}</td><td><a href={`/api/files/${claim.fileId}`}><Tx text={"Open"} /></a></td><td><Status value={claim.status} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 14 }}>
        <p className="section-label"><Tx text={"Employee loan detail"} /></p>
        {loans.length === 0 ? <div className="card"><p className="empty"><Tx text={"No loans yet."} /></p></div> : loans.map((loan) => {
          const schedule = loanSchedule(loan.amount, loan.tenor, loan.startMonth);
          const paidMonths = paidLoanMonths(schedule, loan.installments);
          const paid = schedule.filter((row) => paidMonths.has(row.month)).reduce((sum, row) => sum + row.amount, 0);
          const progress = loan.amount > 0 ? Math.round((paid / loan.amount) * 100) : 0;
          const status = loan.status === "CLOSED" || loan.status === "PAID_OFF" ? "PAID_OFF" : loan.status;
          return (
            <article className="card" key={loan.id} style={{ marginBottom: 12 }}>
              <div className="facts">
                <div><dt><Tx text={"Loan amount"} /></dt><dd>{formatIdr(loan.amount)}</dd></div>
                <div><dt><Tx text={"Tenor"} /></dt><dd>{loan.tenor} <Tx text={"months"} /></dd></div>
                <div><dt><Tx text={"Monthly installment"} /></dt><dd>{formatIdr(loan.installment)}</dd></div>
                <div><dt><Tx text={"Installment start"} /></dt><dd>{loan.startMonth ? formatMonth(loan.startMonth, ctx.locale) : <Tx text={"Not set yet"} />}</dd></div>
                <div><dt><Tx text={"Total paid"} /></dt><dd>{formatIdr(paid)}</dd></div>
                <div><dt><Tx text={"Remaining"} /></dt><dd>{formatIdr(loan.remaining)}</dd></div>
                <div><dt><Tx text={"Loan status"} /></dt><dd><Status value={status} /></dd></div>
              </div>
              <p className="hint"><Tx text={"Repayment progress"} /> {progress}%</p>
              <div className="meter-track"><div className="meter-fill" style={{ width: `${Math.min(100, progress)}%` }} /></div>
              {schedule.length ? (
                <details className="fold" style={{ marginTop: 12 }}>
                  <summary><Tx text={"View installment schedule"} /></summary>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th><Tx text={"Period"} /></th><th><Tx text={"Installment amount"} /></th><th><Tx text={"Status"} /></th></tr></thead>
                      <tbody>
                        {schedule.map((row) => <tr key={row.month}><td>{formatMonth(row.month, ctx.locale)}</td><td>{formatIdr(row.amount)}</td><td><Status value={paidMonths.has(row.month) ? "PAID" : "UNPAID"} /></td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}