"use client";
import { Tx, useT, TInput } from "@/components/locale";

import { useState } from "react";

export type LeavePolicyRow = {
  id: string;
  name: string;
  balanceMode: string;
  quotaDays: number;
  quotaPeriod: string;
  accrualRate: number;
  requiresAttachment: boolean;
  paid: boolean;
  allowHalfDay: boolean;
  carryForwardDays: number;
  expiryDate: string;
};

type Action = (formData: FormData) => void | Promise<void>;

export function LeavePolicyEditor({ types, action, canManage }: { types: LeavePolicyRow[]; action: Action; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="stack">
      {canManage ? <div><button className="btn" type="button" onClick={() => setAdding(true)}><Tx text={"Add Leave Type"} /></button></div> : null}
      {adding && canManage ? (
        <PolicyForm key={`new-${resetKey}`} action={action} onCancel={() => { setAdding(false); setResetKey((value) => value + 1); }} />
      ) : null}
      {types.map((type) => (
        <PolicyForm key={`${type.id}-${resetKey}`} type={type} action={action} readOnly={!canManage} onCancel={() => setResetKey((value) => value + 1)} />
      ))}
    </div>
  );
}

function PolicyForm({ type, action, readOnly, onCancel }: { type?: LeavePolicyRow; action: Action; readOnly?: boolean; onCancel: () => void }) {
  const [useQuota, setUseQuota] = useState(type ? type.balanceMode !== "NONE" : false);
  const [allocation, setAllocation] = useState(type?.balanceMode === "ACCRUAL" ? "ACCRUAL" : "UPFRONT");
  const [carry, setCarry] = useState(Boolean(type && type.carryForwardDays > 0));
  const [expiryMode, setExpiryMode] = useState(type?.expiryDate ? "DATE" : "END");
  const t = useT();
  const yesNo = (name: string, value: boolean, label: string, tip: string) => (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="hint" title={t(tip)}>{t(label)}</legend>
      <div className="choice">
        <label><TInput type="radio" name={name} value="yes" defaultChecked={value} disabled={readOnly} /> <Tx text={"Yes"} /></label>
        <label><TInput type="radio" name={name} value="no" defaultChecked={!value} disabled={readOnly} /> <Tx text={"No"} /></label>
      </div>
    </fieldset>
  );
  return (
    <form action={action} className="card" style={{ display: "grid", gap: 12 }}>
      {type ? <TInput type="hidden" name="id" value={type.id} /> : null}
      <label className="field"><Tx text={"Leave type"} /><TInput name="name" defaultValue={type?.name ?? ""} required disabled={readOnly} /></label>
      <div className="table-wrap">
        <table>
          <thead><tr><th><Tx text={"Allow half day"} /></th><th><Tx text={"Require attachment"} /></th><th><Tx text={"Paid leave"} /></th><th><Tx text={"Use quota"} /></th></tr></thead>
          <tbody><tr>
            <td>{yesNo("allowHalfDay", Boolean(type?.allowHalfDay), "Allow half day?", "Half day is 0.5 day and only applies to a one-day request.")}</td>
            <td>{yesNo("requiresAttachment", Boolean(type?.requiresAttachment), "Require attachment?", "Shows whether this leave type asks for a supporting file.")}</td>
            <td>{yesNo("paid", type ? type.paid : true, "Paid leave?", "Paid leave stays in pay. Unpaid leave can reduce pay.")}</td>
            <td>
              <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="hint" title={t("Yes uses a balance. No lets the employee request this type without a quota.")}><Tx text={"Use quota?"} /></legend>
                <div className="choice">
                  <label><TInput type="radio" name="useQuota" value="yes" checked={useQuota} disabled={readOnly} onChange={() => setUseQuota(true)} /> <Tx text={"Yes"} /></label>
                  <label><TInput type="radio" name="useQuota" value="no" checked={!useQuota} disabled={readOnly} onChange={() => setUseQuota(false)} /> <Tx text={"No"} /></label>
                </div>
              </fieldset>
            </td>
          </tr></tbody>
        </table>
      </div>
      {useQuota ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="field" title={t("Number of leave days in the quota period.")}><Tx text={"Leave quota"} /><TInput name="quotaDays" type="number" min="0.5" step="0.5" defaultValue={type?.quotaDays || ""} required disabled={readOnly} /></label>
          <label className="field" title={t("Yearly is a balance for the year. Monthly is a balance for each calendar month.")}><Tx text={"Quota period"} />
            <select name="quotaPeriod" defaultValue={type?.quotaPeriod || "YEARLY"} disabled={readOnly}><option value="YEARLY"><Tx text={"Yearly"} /></option><option value="MONTHLY"><Tx text={"Monthly"} /></option></select>
          </label>
          <label className="field" title={t("Upfront gives the quota at the start of the period. Accrual adds it gradually.")}><Tx text={"Allocation method"} />
            <select name="allocation" value={allocation} disabled={readOnly} onChange={(event) => setAllocation(event.target.value)}><option value="UPFRONT"><Tx text={"Upfront"} /></option><option value="ACCRUAL"><Tx text={"Accrual"} /></option></select>
          </label>
          {allocation === "ACCRUAL" ? <label className="field" title={t("Days added each month until the leave quota is reached.")}><Tx text={"Accrual rate"} /><TInput name="accrualRate" type="number" min="0.5" step="0.5" defaultValue={type?.accrualRate || ""} required disabled={readOnly} /></label> : <TInput type="hidden" name="accrualRate" value="0" />}
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="hint" title={t("Yes carries unused balance into the next period, up to the cap.")}><Tx text={"Carry forward?"} /></legend>
            <div className="choice">
              <label><TInput type="radio" name="carryForward" value="yes" checked={carry} disabled={readOnly} onChange={() => setCarry(true)} /> <Tx text={"Yes"} /></label>
              <label><TInput type="radio" name="carryForward" value="no" checked={!carry} disabled={readOnly} onChange={() => setCarry(false)} /> <Tx text={"No"} /></label>
            </div>
          </fieldset>
          {carry ? <label className="field" title={t("Maximum unused days that move to the next period.")}><Tx text={"Carry forward cap"} /><TInput name="carryForwardDays" type="number" min="0.5" step="0.5" defaultValue={type?.carryForwardDays || ""} required disabled={readOnly} /></label> : <TInput type="hidden" name="carryForwardDays" value="0" />}
          <label className="field" title={t("End of period keeps the balance until that period closes. A specific date expires the balance after that date.")}><Tx text={"Expiry"} />
            <select name="expiryMode" value={expiryMode} disabled={readOnly} onChange={(event) => setExpiryMode(event.target.value)}><option value="END"><Tx text={"End of period"} /></option><option value="DATE"><Tx text={"Specific date"} /></option></select>
          </label>
          {expiryMode === "DATE" ? <label className="field"><Tx text={"Expiry date"} /><TInput name="expiryDate" type="date" defaultValue={type?.expiryDate || ""} required disabled={readOnly} /></label> : <TInput type="hidden" name="expiryDate" value="" />}
        </div>
      ) : (
        <>
          <TInput type="hidden" name="quotaDays" value="0" />
          <TInput type="hidden" name="quotaPeriod" value="YEARLY" />
          <TInput type="hidden" name="allocation" value="UPFRONT" />
          <TInput type="hidden" name="accrualRate" value="0" />
          <TInput type="hidden" name="carryForward" value="no" />
          <TInput type="hidden" name="carryForwardDays" value="0" />
          <TInput type="hidden" name="expiryMode" value="END" />
          <TInput type="hidden" name="expiryDate" value="" />
        </>
      )}
      {readOnly ? null : (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="submit">{type ? "Save Changes" : "Save"}</button>
          <button className="btn secondary" type="button" onClick={onCancel}><Tx text={"Cancel"} /></button>
        </div>
      )}
    </form>
  );
}
