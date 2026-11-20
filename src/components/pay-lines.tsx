"use client";

import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { Tx, TInput } from "@/components/locale";
import { processingAdjustmentAction } from "@/app/actions";
import { formatIdr } from "@/lib/format";
import { PayslipBreakdown } from "@/components/payslip-breakdown";

type Adjustment = {
  id: string;
  employeeId: string;
  name: string;
  kind: string;
  amount: number;
  reason: string;
  beforeGross: number;
  beforeDeduction: number;
  beforeNet: number;
  beforePph21: number;
  beforeAmount: number;
  actorName: string;
  when: string;
  createdAt: string;
};
type Line = { name: string; kind: string; amount: number };
type Item = { id: string; employeeId: string; employeeName: string; gross: number; deduction: number; net: number; pph21: number; lines?: Line[] };

function signed(value: number) {
  if (value > 0) return `+${formatIdr(value)}`;
  if (value < 0) return `−${formatIdr(Math.abs(value))}`;
  return formatIdr(0);
}

export function PayLines({ periodId, canEdit, items, adjustments }: { periodId: string; canEdit: boolean; items: Item[]; adjustments: Adjustment[] }) {
  const [openId, setOpenId] = useState("");
  const [detailId, setDetailId] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const columns = canEdit ? 6 : 5;
  return (
    <div className="table-wrap">
      {items.length === 0 ? <p className="empty"><Tx text="No payroll lines for this period." /></p> : (
        <table className="pay-table">
          <thead>
            <tr>
              <th><Tx text="Employee" /></th>
              <th className="num"><Tx text="Gross" /></th>
              <th className="num"><Tx text="Deduction" /></th>
              <th className="num"><Tx text="Net" /></th>
              <th className="num"><Tx text="PPh 21" /></th>
              {canEdit ? <th className="pay-action"><Tx text="Actions" /></th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const rows = adjustments.filter((row) => row.employeeId === item.employeeId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              const open = openId === item.id && rows.length > 0;
              const first = rows[0];
              const cards = first ? [
                ["Gross pay", first.beforeGross, item.gross],
                ["Total deduction", first.beforeDeduction, item.deduction],
                ["Net pay", first.beforeNet, item.net],
                ["PPh 21", first.beforePph21, item.pph21],
              ] as const : [];
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td>
                      {rows.length ? (
                        <button className="pay-toggle" type="button" aria-expanded={open} onClick={() => setOpenId(open ? "" : item.id)}>
                          <span className="pay-chev" />
                          <span>{item.employeeName}</span>
                          <span className="change-count"><Tx text={rows.length === 1 ? "1 change" : `${rows.length} changes`} /></span>
                        </button>
                      ) : item.employeeName}
                      <button className="text-action" type="button" onClick={() => setDetailId(detailId === item.id ? "" : item.id)}><Tx text="View detail" /></button>
                    </td>
                    <td className="num">{formatIdr(item.gross)}</td>
                    <td className="num">{formatIdr(item.deduction)}</td>
                    <td className="num">{formatIdr(item.net)}</td>
                    <td className="num">{formatIdr(item.pph21)}</td>
                    {canEdit ? (
                      <td className="pay-action">
                        <button className="edit-btn" type="button" onClick={() => setEditing(item)}><Pencil /><Tx text="Edit" /></button>
                      </td>
                    ) : null}
                  </tr>
                  {detailId === item.id ? (
                    <tr className="pay-detail">
                      <td colSpan={columns}>
                        <div className="pay-panel">
                          <PayslipBreakdown lines={item.lines || []} gross={item.gross} deduction={item.deduction} net={item.net} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {open ? (
                    <tr key={`${item.id}-detail`} className="pay-detail">
                      <td colSpan={columns}>
                        <div className="pay-panel">
                          <strong><Tx text="Pay change detail" /></strong>
                          <p className="section-label"><Tx text="Pay summary" /></p>
                          <div className="pay-cards">
                            {cards.map(([label, before, after]) => (
                              <div key={label} className="pay-card">
                                <span><Tx text={label} /></span>
                                <p><Tx text="Before" /> <strong>{formatIdr(before)}</strong></p>
                                <p><Tx text="After" /> <strong>{formatIdr(after)}</strong></p>
                                <p className={after - before > 0 ? "up" : after - before < 0 ? "down" : ""}><Tx text="Difference" /> {signed(after - before)}</p>
                              </div>
                            ))}
                          </div>
                          <p className="section-label"><Tx text="Component history" /></p>
                          <table>
                            <thead>
                              <tr>
                                <th><Tx text="Component" /></th>
                                <th><Tx text="Kind" /></th>
                                <th className="num"><Tx text="Before" /></th>
                                <th className="num"><Tx text="Amount change" /></th>
                                <th className="num"><Tx text="After" /></th>
                                <th><Tx text="Reason" /></th>
                                <th><Tx text="Changed by" /></th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.name}</td>
                                  <td><Tx text={row.kind === "DEDUCTION" ? "Deduction" : row.kind === "INCENTIVE" ? "Incentive" : "Earning"} /></td>
                                  <td className="num">{formatIdr(row.beforeAmount)}</td>
                                  <td className="num">{signed(row.amount)}</td>
                                  <td className="num">{formatIdr(row.beforeAmount + row.amount)}</td>
                                  <td>{row.reason}</td>
                                  <td>{row.actorName}{row.when ? ` · ${row.when}` : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && typeof document !== "undefined" ? createPortal(
        <div className="edit-layer" onClick={() => setEditing(null)}>
          <form action={processingAdjustmentAction} className="card stack-form" onClick={(event) => event.stopPropagation()}>
            <strong>{editing.employeeName}</strong>
            <TInput type="hidden" name="periodId" value={periodId} />
            <TInput type="hidden" name="employeeId" value={editing.employeeId} />
            <label className="field"><Tx text="Name" /><TInput name="name" placeholder="Adjustment name" required /></label>
            <label className="field"><Tx text="Kind" /><select name="kind"><option value="EARNING"><Tx text="Earning" /></option><option value="DEDUCTION"><Tx text="Deduction" /></option><option value="INCENTIVE"><Tx text="Incentive" /></option></select></label>
            <label className="field"><Tx text="Amount" /><TInput name="amount" type="number" required /></label>
            <label className="field"><Tx text="Reason" /><TInput name="reason" placeholder="Reason" required /></label>
            <button className="btn" type="submit"><Tx text="Save changes" /></button>
          </form>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function Pencil() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
