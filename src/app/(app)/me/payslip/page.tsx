import { Tx } from "@/components/locale";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { payslipAction } from "@/app/actions";
import Link from "next/link";
import { Banner, PageTitle } from "@/components/ui";
import { PayslipBreakdown } from "@/components/payslip-breakdown";
import { PasswordField } from "@/components/password-field";

export default async function MyPayslipPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; period?: string; pick?: string }> }) {
  const ctx = await requirePerm("payroll.self");
  const params = await searchParams;
  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { payslipPinHash: true } });
  const hasPin = Boolean(user?.payslipPinHash);
  const items = ctx.employeeId ? await prisma.payrollItem.findMany({ where: { employeeId: ctx.employeeId, period: { payslipPublished: true } }, include: { period: true }, orderBy: { period: { payDate: "desc" } } }) : [];
  const picking = params.pick === "1";
  const selected = items.find((item) => item.periodId === params.period) || items[0];
  const jar = await cookies();
  const token = jar.get("dora_payslip")?.value;
  const grant = token && selected ? await prisma.payslipGrant.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } }) : null;
  const open = !picking && Boolean(grant && selected && grant.userId === ctx.userId && grant.periodId === selected.periodId && grant.expiresAt.getTime() > Date.now());
  const lines = open && selected ? JSON.parse(selected.breakdown) as { name: string; kind: string; amount: number }[] : [];
  return (
    <div>
      <PageTitle title="My Payslip" subtitle="Only a published payslip for your own employee record opens, and only after you enter your 6-digit PIN." />
      <Banner ok={params.ok} error={params.error} />
      {items.length === 0 ? <div className="card"><Tx text={"No published payslip."} /></div> : (
        <div className="grid">
          {open && selected ? (
            <div className="card">
              <Link className="btn secondary pay-back" href="/me/payslip?pick=1"><Tx text="Choose another period" /></Link>
              <p className="section-label">{selected.period.payDate}</p>
              <h2 style={{ margin: "0 0 8px" }}>{selected.period.name}</h2>
              <PayslipBreakdown lines={lines} gross={selected.gross} deduction={selected.deduction} net={selected.net} />
              <a className="btn secondary" href={`/api/me/payslip?period=${selected.periodId}`}><Tx text={"Download PDF"} /></a>
            </div>
          ) : (
            hasPin ? (
              <form action={payslipAction} className="card stack-form">
                <label className="field"><Tx text={"Period"} /><select name="periodId" defaultValue={selected?.periodId}>{items.map((item) => <option key={item.periodId} value={item.periodId}>{item.period.name}</option>)}</select></label>
                <PasswordField name="pin" label="Payslip PIN" autoComplete="off" />
                <button className="btn" type="submit"><Tx text={"Show payslip"} /></button>
              </form>
            ) : (
              <div className="card">
                <p><Tx text={"Set a 6-digit PIN on your profile before a payslip can open."} /></p>
                <Link className="btn" href="/me/profile"><Tx text={"Set PIN"} /></Link>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
