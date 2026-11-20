"use client";

import { Tx } from "@/components/locale";
import { formatIdr } from "@/lib/format";

type Line = { name: string; kind: string; amount: number };

export function PayslipBreakdown({ lines, gross, deduction, net }: { lines: Line[]; gross: number; deduction: number; net: number }) {
  const earnings = lines.filter((line) => line.kind === "EARNING" || line.kind === "INCENTIVE");
  const deductions = lines.filter((line) => line.kind === "DEDUCTION");
  const employer = lines.filter((line) => line.kind === "INFO");
  return (
    <div>
      <p className="section-label"><Tx text="Earnings detail" /></p>
      <div className="record-list">{earnings.map((line) => <p className="record" key={`e-${line.name}`}><span>{line.name}</span><strong>{formatIdr(line.amount)}</strong></p>)}</div>
      <p className="record"><span><Tx text="Total earnings" /></span><strong>{formatIdr(gross)}</strong></p>
      <p className="section-label"><Tx text="Deduction detail" /></p>
      <div className="record-list">{deductions.map((line) => <p className="record" key={`d-${line.name}`}><span>{line.name}</span><strong>{formatIdr(line.amount)}</strong>{line.name === "PPh 21" ? <span className="hint"><Tx text="PPh 21 uses the stored annual progressive brackets divided by 12. This is not the monthly TER method, so it is not an official filing figure." /></span> : null}</p>)}</div>
      <p className="record"><span><Tx text="Total deduction" /></span><strong>{formatIdr(deduction)}</strong></p>
      <p className="payslip-net"><strong><Tx text="Take home pay" /> {formatIdr(net)}</strong></p>
      {employer.length ? (
        <>
          <p className="section-label"><Tx text="Employer contributions" /></p>
          <p className="hint"><Tx text="Employer contributions are not deducted from take home pay." /></p>
          <div className="record-list">{employer.map((line) => <p className="record" key={`i-${line.name}`}><span>{line.name}</span><span>{formatIdr(line.amount)}</span></p>)}</div>
        </>
      ) : null}
    </div>
  );
}
