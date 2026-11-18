import { Tx, TInput, TTextarea } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { formatIdr, todayJakarta } from "@/lib/format";
import { STATUTORY_GUIDE } from "@/lib/leave-catalog";
import { benefitsAction, claimAction, loanAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("payroll.self");
  const params = await searchParams;
  const employee = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null;
  if (!employee) return <div className="card"><Tx text={"Your account is not linked to an employee."} /></div>;
  const loans = await prisma.employeeLoan.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } });
  const claims = await prisma.reimbursement.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageTitle title="Benefits & Loans" subtitle="Membership numbers are stored here. Contribution amounts and PPh 21 stay on your published payslip, behind your PIN. A transport or health claim needs a receipt and your supervisor’s approval, then payroll posts it as an earning. Nothing on this page is filed to a government system." />
      <Banner ok={params.ok} error={params.error} />
      <div className="card table-wrap">
        <table>
          <thead><tr><th><Tx text={"Program"} /></th><th><Tx text={"You"} /></th><th><Tx text={"Employer"} /></th><th><Tx text={"Wage ceiling"} /></th><th><Tx text={"Basis"} /></th></tr></thead>
          <tbody>
            {STATUTORY_GUIDE.map((row) => <tr key={row.program}><td>{row.program}</td><td>{row.employee}</td><td>{row.employer}</td><td>{row.ceiling}</td><td>{row.basis}</td></tr>)}
          </tbody>
        </table>
        <p className="hint"><Tx text={"Jaminan Pensiun’s wage ceiling is reset each March under PP 45/2015. Payroll still uses this company’s platform rule, so confirm the latest BPJS letter before treating a figure as a filing number. Private insurance does not replace BPJS."} /></p>
      </div>
      <div className="profile-board" style={{ marginTop: 14 }}>
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
          <p className="hint"><Tx text={"A supervisor approves the request. Payroll then posts one installment into a draft period. The cap is three months of basic salary. One open loan at a time, repaid over 1–24 months."} /></p>
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
      <div className="card table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th><Tx text={"Amount"} /></th><th><Tx text={"Tenor"} /></th><th><Tx text={"Installment"} /></th><th><Tx text={"Remaining"} /></th><th><Tx text={"Status"} /></th></tr></thead>
          <tbody>
            {loans.length === 0 ? <tr><td colSpan={5}><Tx text={"No loans yet."} /></td></tr> : loans.map((loan) => (
              <tr key={loan.id}><td>{formatIdr(loan.amount)}</td><td>{loan.tenor} months</td><td>{formatIdr(loan.installment)}</td><td>{formatIdr(loan.remaining)}</td><td><Status value={loan.status} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}