"use client";

import { useState } from "react";
import { Tx, TInput } from "@/components/locale";
import { calculatePay, type PayResult, type RuleDefinition } from "@/lib/domain";
import { formatIdr } from "@/lib/format";

type ComponentLine = { name: string; kind: "EARNING" | "DEDUCTION"; calc: "FIXED" | "PERCENT_BASIC"; amount: number; added?: boolean };

type Input = {
  kind: "REGULAR" | "THR" | "BONUS" | "ADJUSTMENT";
  basicSalary: number;
  factor: number;
  components: ComponentLine[];
  overtimeIdr: number;
  unpaidLeaveDays: number;
  workdaysInPeriod: number;
  lateMinutes: number;
  lateDeductionPerMinute: number;
  adjustments: { name: string; kind: "EARNING" | "DEDUCTION" | "INCENTIVE"; amount: number }[];
  thrAmount: number;
  bonusAmount: number;
  ptkp: string;
  rule: RuleDefinition;
  jkkClass: number;
  bpjsKesEnabled: boolean;
  includeOvertime: boolean;
};

function signed(value: number) {
  if (value > 0) return `+${formatIdr(value)}`;
  if (value < 0) return `−${formatIdr(Math.abs(value))}`;
  return formatIdr(0);
}

export function SalarySimulator({ initial, baseline, assumption }: { initial: Input; baseline: PayResult; assumption: string }) {
  const [basic, setBasic] = useState(initial.basicSalary);
  const [lines, setLines] = useState<ComponentLine[]>(initial.components.map((row) => ({ ...row })));
  const [overtime, setOvertime] = useState(initial.overtimeIdr);
  const [unpaid, setUnpaid] = useState(initial.unpaidLeaveDays);
  const [late, setLate] = useState(initial.lateMinutes);
  const [result, setResult] = useState<PayResult | null>(null);
  const calculate = () => setResult(calculatePay({ ...initial, basicSalary: basic, components: lines.map(({ name, kind, calc, amount }) => ({ name, kind, calc, amount })), overtimeIdr: overtime, unpaidLeaveDays: unpaid, lateMinutes: late }));
  const reset = () => {
    setBasic(initial.basicSalary);
    setLines(initial.components.map((row) => ({ ...row })));
    setOvertime(initial.overtimeIdr);
    setUnpaid(initial.unpaidLeaveDays);
    setLate(initial.lateMinutes);
    setResult(null);
  };
  const shown = result || baseline;
  const rows = [
    ["Gross", baseline.gross, shown.gross],
    ["Total deduction", baseline.deduction, shown.deduction],
    ["Take home pay", baseline.net, shown.net],
  ] as const;
  return (
    <div className="card stack-form">
      <p className="section-label"><Tx text="Simulation only. This is not an actual payroll." /></p>
      {assumption ? <p className="hint"><Tx text={assumption} /></p> : null}
      {initial.basicSalary <= 0 ? <p className="hint"><Tx text="Basic salary is empty, so the simulation does not assume one." /></p> : null}
      <label className="field"><Tx text="Basic salary" /><TInput type="number" value={basic} onChange={(event) => setBasic(Number(event.target.value || 0))} /></label>
      {lines.map((line, index) => (
        <label className="field" key={`${line.name}-${index}`}>
          <span>{line.name}</span>
          <TInput type="number" value={line.amount} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value || 0) } : item))} />
        </label>
      ))}
      <label className="field"><Tx text="Reviewed overtime" /><TInput type="number" value={overtime} onChange={(event) => setOvertime(Number(event.target.value || 0))} /></label>
      <label className="field"><Tx text="Unpaid leave days" /><TInput type="number" value={unpaid} onChange={(event) => setUnpaid(Number(event.target.value || 0))} /></label>
      <label className="field"><Tx text="Late minutes" /><TInput type="number" value={late} onChange={(event) => setLate(Number(event.target.value || 0))} /></label>
      <div className="form-actions">
        <button className="btn" type="button" onClick={calculate}><Tx text="Calculate simulation" /></button>
        <button className="btn secondary" type="button" onClick={reset}><Tx text="Reset simulation" /></button>
      </div>
      <table>
        <thead><tr><th><Tx text="Item" /></th><th className="num"><Tx text="Starting value" /></th><th className="num"><Tx text="Simulation value" /></th><th className="num"><Tx text="Difference" /></th></tr></thead>
        <tbody>{rows.map(([label, before, after]) => <tr key={label}><td><Tx text={label} /></td><td className="num">{formatIdr(before)}</td><td className="num">{formatIdr(after)}</td><td className="num">{signed(after - before)}</td></tr>)}</tbody>
      </table>
      <div className="record-list">{shown.lines.filter((line) => line.kind !== "INFO").map((line) => <p className="record" key={line.name}><span>{line.name}</span><strong>{formatIdr(line.amount)}</strong></p>)}</div>
      {shown.lines.some((line) => line.kind === "INFO") ? <p className="hint"><Tx text="Employer contributions are not deducted from take home pay." /></p> : null}
      <div className="record-list">{shown.lines.filter((line) => line.kind === "INFO").map((line) => <p className="record" key={line.name}><span>{line.name}</span><span>{formatIdr(line.amount)}</span></p>)}</div>
      {shown.warnings.map((warning) => <p className="hint" key={warning}><Tx text={warning} /></p>)}
    </div>
  );
}
