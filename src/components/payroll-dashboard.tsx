"use client";

import Link from "next/link";
import { useState } from "react";
import { formatIdr } from "@/lib/format";
import { Tx, useT } from "./locale";
import { Pipeline } from "./ui";

export function PayrollDashboard({
  periods,
  selectedId,
  employees,
  gross,
  deduction,
  net,
  status,
  note,
}: {
  periods: { id: string; name: string }[];
  selectedId: string;
  employees: number;
  gross: number;
  deduction: number;
  net: number;
  status: string;
  note: string;
}) {
  const t = useT();
  const [hidden, setHidden] = useState(false);
  const money = (value: number) => (hidden ? "Rp ••••••" : formatIdr(value));
  return (
    <div>
      <form className="toolbar">
        <label className="field"><Tx text="Payroll period" />
          <select name="period" defaultValue={selectedId} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
          </select>
        </label>
        <button className="btn secondary" type="button" onClick={() => setHidden((value) => !value)}>{t(hidden ? "Show amounts" : "Hide amounts")}</button>
      </form>
      <div className="grid stats">
        <div className="card"><p className="section-label"><Tx text="Employees" /></p><strong>{employees}</strong></div>
        <div className="card"><p className="section-label"><Tx text="Total gross pay" /></p><strong>{money(gross)}</strong></div>
        <div className="card"><p className="section-label"><Tx text="Total deduction" /></p><strong>{money(deduction)}</strong></div>
        <div className="card"><p className="section-label"><Tx text="Total net pay" /></p><strong>{money(net)}</strong></div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <Pipeline status={status} />
        <p>{t(note)}</p>
        <div className="page-actions"><Link className="btn" href={`/payroll/processing?period=${selectedId}`}><Tx text="Open payroll processing" /></Link></div>
      </div>
    </div>
  );
}
