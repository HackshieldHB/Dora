"use client";

import { useState } from "react";
import Link from "next/link";
import { Tx, useT } from "@/components/locale";
import { formatIdr } from "@/lib/format";
import type { RuleDefinition } from "@/lib/domain";
import { DAILY_TER, TER_SOURCE, TER_TABLES, terCategory, type TerCategory } from "@/lib/tax-method";

export type PphResultRow = {
  id: string;
  period: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  ptkp: string;
  method: string;
  gross: number;
  pph21: number;
  status: string;
  lines: { name: string; kind: string; amount: number }[];
};

type ChangeRow = { id: string; field: string; before: string; after: string; source: string; effectiveFrom: string; status: string; user: string; when: string };

const PTKP_ORDER = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

function percent(rate: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rate * 100)}%`;
}

export function Pph21Workspace({
  tab,
  approved,
  ruleCode,
  effectiveFrom,
  source,
  definition,
  rows,
  filters,
  selectedId,
  changes,
}: {
  tab: string;
  approved: boolean;
  ruleCode: string;
  effectiveFrom: string;
  source: string;
  definition: RuleDefinition | null;
  rows: PphResultRow[];
  filters: { period: string; employee: string; status: string };
  selectedId: string;
  changes: ChangeRow[];
}) {
  const active = ["ptkp", "method", "calc", "history"].includes(tab) ? tab : "info";
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  return (
    <div className="stack-form">
      <section className="card stack-form">
        <p className="section-label"><Tx text="PPh 21 component detail" /></p>
        <p className="hint"><Tx text={approved ? "Approved for calculation" : "Sample, not verified for official use"} />{ruleCode ? ` · ${ruleCode}` : ""}{effectiveFrom ? ` · ${effectiveFrom}` : ""}</p>
        <div className="form-actions">
          <Tab href="/tax/pph21" label="Information and rules" active={active === "info"} />
          <Tab href="/tax/pph21?tab=ptkp" label="PTKP parameters" active={active === "ptkp"} />
          <Tab href="/tax/pph21?tab=method" label="Rates and method" active={active === "method"} />
          <Tab href="/tax/pph21?tab=calc" label="Calculation" active={active === "calc"} />
          <Tab href="/tax/pph21?tab=history" label="Change history" active={active === "history"} />
        </div>
        {active === "info" ? <Info source={source} approved={approved} effectiveFrom={effectiveFrom} /> : null}
        {active === "ptkp" ? <Ptkp definition={definition} effectiveFrom={effectiveFrom} /> : null}
        {active === "method" ? <Method definition={definition} approved={approved} ruleCode={ruleCode} effectiveFrom={effectiveFrom} source={source} /> : null}
        {active === "calc" ? <Calc approved={approved} rows={rows} filters={filters} selected={selected} ruleCode={ruleCode} source={source} /> : null}
        {active === "history" ? <History rows={changes} /> : null}
      </section>
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <Link className={active ? "btn" : "btn secondary"} href={href}><Tx text={label} /></Link>;
}

function Info({ source, approved, effectiveFrom }: { source: string; approved: boolean; effectiveFrom: string }) {
  return (
    <div>
      <dl className="facts">
        <div><dt><Tx text="Component" /></dt><dd>PPh 21</dd></div>
        <div><dt><Tx text="Description" /></dt><dd><Tx text="Income tax on employment income. A permanent employee uses monthly TER outside the last tax month, and the annual Pasal 17 settlement in the last tax month." /></dd></div>
        <div><dt><Tx text="Supported recipients" /></dt><dd><Tx text="Permanent, contract, and probation employees paid by this company. Other recipient types are not calculated with the permanent-employee method." /></dd></div>
        <div><dt><Tx text="Legal basis" /></dt><dd>{TER_SOURCE}</dd></div>
        <div><dt><Tx text="Article" /></dt><dd><Tx text="PMK 168/2023 article 15 for the monthly and last-month methods." /></dd></div>
        <div><dt><Tx text="Methods" /></dt><dd><Tx text="Monthly TER, daily TER for the supported daily range, and Pasal 17 for the last tax month." /></dd></div>
        <div><dt><Tx text="Effective from" /></dt><dd>{effectiveFrom || "—"}</dd></div>
        <div><dt><Tx text="Regulatory verification" /></dt><dd><Tx text={approved ? "Approved for calculation" : "Sample, not verified for official use"} /></dd></div>
        <div><dt><Tx text="Source" /></dt><dd>{source || <Tx text="No source recorded" />}</dd></div>
      </dl>
      {approved ? null : <p className="hint"><Tx text="The active rule is still a sample. Do not treat the result as an official filing figure." /></p>}
    </div>
  );
}

function Ptkp({ definition, effectiveFrom }: { definition: RuleDefinition | null; effectiveFrom: string }) {
  if (!definition) return <p><Tx text="No validated statutory rule is effective for this period." /></p>;
  const statuses = [...new Set([...PTKP_ORDER, ...Object.keys(definition.ptkpAnnual)])];
  return (
    <div className="table-wrap"><table><thead><tr><th><Tx text="PTKP status" /></th><th className="num"><Tx text="Annual amount" /></th><th><Tx text="TER category" /></th><th><Tx text="Effective from" /></th></tr></thead><tbody>
      {statuses.map((status) => {
        const amount = definition.ptkpAnnual[status];
        const category = terCategory(status);
        return <tr key={status}><td>{status}</td><td className="num">{amount == null ? "—" : formatIdr(amount)}</td><td>{category ? `TER ${category}` : "—"}</td><td>{effectiveFrom || "—"}</td></tr>;
      })}
    </tbody></table></div>
  );
}

function Method({ definition, approved, ruleCode, effectiveFrom, source }: { definition: RuleDefinition | null; approved: boolean; ruleCode: string; effectiveFrom: string; source: string }) {
  const [category, setCategory] = useState<TerCategory>("A");
  return (
    <div className="stack-form">
      <p className="section-label"><Tx text="Rates and method" /></p>
      <p className="hint"><Tx text="Effective from" /> {effectiveFrom || "—"} · <Tx text="Rule version" /> {ruleCode || "—"} · <Tx text="Regulatory verification" /> <Tx text={approved ? "Approved for calculation" : "Needs verification"} /></p>
      <section className="stack-form">
        <p className="section-label"><Tx text="Monthly TER" /></p>
        <div className="form-actions">
          {(["A", "B", "C"] as const).map((item) => <button key={item} type="button" className={category === item ? "btn" : "btn secondary"} onClick={() => setCategory(item)}><Tx text={`Monthly TER ${item}`} /></button>)}
        </div>
        <CategoryHeader category={category} definition={definition} approved={approved} ruleCode={ruleCode} effectiveFrom={effectiveFrom} source={source} />
        <RateTable category={category} effectiveFrom={effectiveFrom} />
      </section>
      <details className="fold">
        <summary className="section-label"><Tx text="Daily TER" /></summary>
        <p className="hint"><Tx text="Daily TER applies only to the daily income range in PMK 168/2023. It is not used for a permanent employee." /></p>
        <p className="hint">{source || TER_SOURCE} · {effectiveFrom || "2024-01-01"} · <Tx text={approved ? "Approved for calculation" : "Needs verification"} /></p>
        <div className="table-wrap"><table><thead><tr><th>No.</th><th><Tx text="Daily wage base range" /></th><th className="num"><Tx text="Effective rate" /></th><th><Tx text="Legal reference" /></th><th><Tx text="Effective from" /></th></tr></thead><tbody>{DAILY_TER.map((band, index) => <tr key={band.upTo}><td>{index + 1}</td><td>{rangeLabel(DAILY_TER, index)}</td><td className="num">{percent(band.rate)}</td><td>{TER_SOURCE}</td><td>{effectiveFrom || "2024-01-01"}</td></tr>)}</tbody></table></div>
      </details>
      <details className="fold">
        <summary className="section-label"><Tx text="Article 17 progressive rates" /></summary>
        <p className="hint"><Tx text="Pasal 17 is used where the calculation requires it, including the last tax month for a permanent employee. It does not replace monthly TER in a month that should use TER." /></p>
        {definition ? <div className="table-wrap"><table><thead><tr><th>No.</th><th><Tx text="Taxable income range" /></th><th className="num"><Tx text="Progressive rate" /></th><th><Tx text="Legal reference" /></th><th><Tx text="Effective from" /></th></tr></thead><tbody>{definition.progressiveAnnual.map((row, index) => <tr key={index}><td>{index + 1}</td><td>{row.upTo == null ? <Tx text="Above the previous bracket" /> : rangeMoney(index === 0 ? 0 : definition.progressiveAnnual[index - 1].upTo, row.upTo)}</td><td className="num">{percent(row.rate)}</td><td>{source || "—"}</td><td>{effectiveFrom || "—"}</td></tr>)}</tbody></table></div> : <p><Tx text="Rate data is not available for the selected period." /></p>}
      </details>
    </div>
  );
}

function CategoryHeader({ category, definition, approved, ruleCode, effectiveFrom, source }: { category: TerCategory; definition: RuleDefinition | null; approved: boolean; ruleCode: string; effectiveFrom: string; source: string }) {
  const statuses = definition ? PTKP_ORDER.filter((status) => status in definition.ptkpAnnual && terCategory(status) === category) : [];
  return (
    <dl className="facts">
      <div><dt><Tx text="Monthly TER" /></dt><dd><Tx text={`Monthly TER ${category}`} /></dd></div>
      <div><dt><Tx text="PTKP statuses in this category" /></dt><dd>{statuses.length ? statuses.join(", ") : <Tx text="Not available" />}</dd></div>
      <div><dt><Tx text="Legal reference" /></dt><dd>{source || TER_SOURCE}</dd></div>
      <div><dt><Tx text="Effective from" /></dt><dd>{effectiveFrom || "—"}</dd></div>
      <div><dt><Tx text="Rule version" /></dt><dd>{ruleCode || "—"}</dd></div>
      <div><dt><Tx text="Regulatory verification" /></dt><dd><Tx text={approved ? "Approved for calculation" : "Needs verification"} /></dd></div>
    </dl>
  );
}

function RateTable({ category, effectiveFrom }: { category: TerCategory; effectiveFrom: string }) {
  const bands = TER_TABLES[category];
  if (bands.length === 0) return <p><Tx text="Rate data is not available for the selected period." /></p>;
  return (
    <div className="table-wrap table-scroll"><table><thead><tr><th>No.</th><th><Tx text="Gross income range per month" /></th><th className="num"><Tx text="Effective rate" /></th><th><Tx text="Effective from" /></th><th><Tx text="Legal reference" /></th></tr></thead><tbody>
      {bands.map((band, index) => <tr key={`${category}-${index}`}><td>{index + 1}</td><td>{rangeLabel(bands, index)}</td><td className="num">{percent(band.rate)}</td><td>{effectiveFrom || "2024-01-01"}</td><td>{TER_SOURCE}</td></tr>)}
    </tbody></table></div>
  );
}

function rangeLabel(bands: { upTo: number }[], index: number) {
  const band = bands[index];
  if (!Number.isFinite(band.upTo)) return <Tx text="Above the previous bracket" />;
  const previous = index === 0 ? 0 : bands[index - 1].upTo;
  return <>{formatIdr(index === 0 ? 0 : previous + 1)} – {formatIdr(band.upTo)}</>;
}

function rangeMoney(from: number | null, to: number | null) {
  if (to == null) return <Tx text="Above the previous bracket" />;
  return <>{formatIdr(from && from > 0 ? from + 1 : 0)} – {formatIdr(to)}</>;
}

function Calc({ approved, rows, filters, selected, ruleCode, source }: { approved: boolean; rows: PphResultRow[]; filters: { period: string; employee: string; status: string }; selected: PphResultRow | null; ruleCode: string; source: string }) {
  const exportQuery = new URLSearchParams();
  if (filters.period) exportQuery.set("period", filters.period);
  if (filters.employee) exportQuery.set("employee", filters.employee);
  if (filters.status) exportQuery.set("status", filters.status);
  const exportHref = `/api/tax/pph21?${exportQuery.toString()}`;
  const keep = new URLSearchParams({ tab: "calc" });
  if (filters.period) keep.set("period", filters.period);
  if (filters.employee) keep.set("employee", filters.employee);
  if (filters.status) keep.set("status", filters.status);
  return (
    <div className="stack-form">
      <p className="section-label"><Tx text="Tax month other than the last tax month" /></p>
      <p><Tx text="For a permanent employee covered by PMK 168/2023, PPh 21 = monthly gross × the monthly TER for that PTKP category and gross band." /></p>
      <p className="hint"><Tx text="Illustration, not a payroll result: TK/0, gross Rp10,000,000, TER A 2% = Rp200,000." /></p>
      <p className="section-label"><Tx text="Last tax month" /></p>
      <p><Tx text="The last tax month is December, or the month the employee stops working. PPh 21 = tax due for the tax year or part of the year − PPh 21 already withheld. The annual tax uses Pasal 17. Missing earlier payrolls are not estimated." /></p>
      <p className="hint"><Tx text="THR and bonus in the same month are added to that month's gross. They are not taxed with a separate annual-rate divided by 12." /></p>
      {approved ? null : <p className="hint"><Tx text="The active rule is still a sample. Do not treat the result as an official filing figure." /></p>}
      <p className="section-label"><Tx text="PPh 21 withholding results" /></p>
      <form className="toolbar" method="get" action="/tax/pph21">
        <input type="hidden" name="tab" value="calc" />
        <label className="field"><Tx text="Period" /><input name="period" defaultValue={filters.period} placeholder="YYYY-MM" /></label>
        <label className="field"><Tx text="Employee" /><input name="employee" defaultValue={filters.employee} placeholder="Name or ID" /></label>
        <label className="field"><Tx text="Calculation status" /><input name="status" defaultValue={filters.status} placeholder="Status" /></label>
        <button className="btn secondary"><Tx text="Filter" /></button>
      </form>
      {rows.length === 0 ? <p className="empty"><Tx text="No statutory lines yet." /></p> : <div className="table-wrap"><table><thead><tr><th><Tx text="Tax period" /></th><th><Tx text="Employee ID" /></th><th><Tx text="Employee name" /></th><th><Tx text="PTKP" /></th><th><Tx text="TER category / method" /></th><th className="num"><Tx text="Gross income" /></th><th className="num"><Tx text="PPh 21" /></th><th><Tx text="Calculation status" /></th><th><Tx text="Action" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.period}</td><td>{row.employeeCode}</td><td>{row.name}</td><td>{row.ptkp}</td><td><Tx text={row.method} /></td><td className="num">{formatIdr(row.gross)}</td><td className="num">{formatIdr(row.pph21)}</td><td><Tx text={row.status} /></td><td><Link href={`/tax/pph21?${keep.toString()}&item=${row.id}`}><Tx text="Open detail" /></Link></td></tr>)}</tbody></table></div>}
      <div className="page-actions">
        <a className="btn secondary" href={exportHref}><Tx text="Export Excel" /></a>
        <a className="btn secondary" href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}format=pdf`}><Tx text="Export PDF" /></a>
      </div>
      {selected ? <ResultDetail row={selected} ruleCode={ruleCode} source={source} /> : null}
    </div>
  );
}

function History({ rows }: { rows: ChangeRow[] }) {
  const t = useT();
  const [parameter, setParameter] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (parameter && !row.field.toLowerCase().includes(parameter.trim().toLowerCase())) return false;
    if (status && row.status !== status) return false;
    const day = row.when.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (needle && !`${row.field} ${row.source} ${row.before} ${row.after}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const selected = rows.find((row) => row.id === open) ?? null;
  return (
    <div className="stack-form">
      <p className="section-label"><Tx text="PPh 21 parameter change history" /></p>
      <div className="toolbar">
        <label className="field"><Tx text="Parameter" /><input value={parameter} onChange={(event) => setParameter(event.target.value)} /></label>
        <label className="field"><Tx text="Regulatory verification" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("All")}</option><option value="APPROVED">{t("Approved for calculation")}</option><option value="SAMPLE">{t("Sample, not verified for official use")}</option></select></label>
        <label className="field"><Tx text="Change date from" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="field"><Tx text="Change date to" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label className="field"><Tx text="Search parameter or reference" /><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Change date" /></th><th><Tx text="Parameter" /></th><th><Tx text="Previous value" /></th><th><Tx text="New value" /></th><th><Tx text="Legal reference" /></th><th><Tx text="Effective from" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Changed by" /></th><th><Tx text="Parameter note" /></th><th><Tx text="Action" /></th></tr></thead><tbody>
        {filtered.length === 0 ? <tr><td colSpan={10}><p className="empty"><Tx text="No change history yet" /></p><p><Tx text="No PPh 21 parameter change is recorded for the selected criteria." /></p></td></tr> : filtered.map((row) => <tr key={row.id}><td>{row.when}</td><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td><td>{row.source || "—"}</td><td>{row.effectiveFrom}</td><td><Tx text={row.status === "APPROVED" ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td>{row.user || "—"}</td><td>—</td><td><button type="button" className="text-action" onClick={() => setOpen(row.id)}><Tx text="Open detail" /></button></td></tr>)}
      </tbody></table></div>
      {selected ? (
        <div className="card stack-form">
          <p className="section-label"><Tx text="Open detail" /></p>
          <dl className="facts">
            <div><dt><Tx text="Parameter" /></dt><dd>{selected.field}</dd></div>
            <div><dt><Tx text="Parameter kind" /></dt><dd><Tx text="Regulation" /></dd></div>
            <div><dt><Tx text="Previous value" /></dt><dd>{selected.before}</dd></div>
            <div><dt><Tx text="New value" /></dt><dd>{selected.after}</dd></div>
            <div><dt><Tx text="Legal reference" /></dt><dd>{selected.source || "—"}</dd></div>
            <div><dt><Tx text="Effective from" /></dt><dd>{selected.effectiveFrom || "—"}</dd></div>
            <div><dt><Tx text="Change date" /></dt><dd>{selected.when}</dd></div>
            <div><dt><Tx text="Changed by" /></dt><dd>{selected.user || "—"}</dd></div>
            <div><dt><Tx text="Regulatory verification" /></dt><dd><Tx text={selected.status === "APPROVED" ? "Approved for calculation" : "Sample, not verified for official use"} /></dd></div>
            <div><dt><Tx text="Parameter note" /></dt><dd>—</dd></div>
            <div><dt><Tx text="Rule version" /></dt><dd>{selected.id.split(":")[0]}</dd></div>
          </dl>
          <button type="button" className="btn secondary" onClick={() => setOpen("")}><Tx text="Close" /></button>
        </div>
      ) : null}
    </div>
  );
}

function ResultDetail({ row, ruleCode, source }: { row: PphResultRow; ruleCode: string; source: string }) {
  const category = terCategory(row.ptkp);
  const earnings = row.lines.filter((line) => line.kind !== "DEDUCTION");
  const deductions = row.lines.filter((line) => line.kind === "DEDUCTION");
  return (
    <div>
      <p className="section-label"><Tx text="Calculation detail" /></p>
      <dl className="facts">
        <div><dt><Tx text="Employee" /></dt><dd>{row.employeeCode} · {row.name}</dd></div>
        <div><dt><Tx text="Tax period" /></dt><dd>{row.period}</dd></div>
        <div><dt><Tx text="PTKP" /></dt><dd>{row.ptkp}</dd></div>
        <div><dt><Tx text="TER category / method" /></dt><dd>{category ? `TER ${category} · ` : ""}<Tx text={row.method} /></dd></div>
        <div><dt><Tx text="Gross income" /></dt><dd>{formatIdr(row.gross)}</dd></div>
        <div><dt><Tx text="Deductions" /></dt><dd>{deductions.length ? deductions.map((line) => line.name).join(", ") : "—"}</dd></div>
        <div><dt><Tx text="PPh 21" /></dt><dd>{formatIdr(row.pph21)}</dd></div>
        <div><dt><Tx text="Calculation status" /></dt><dd><Tx text={row.status} /></dd></div>
        <div><dt><Tx text="Rule version" /></dt><dd>{ruleCode || "—"}</dd></div>
        <div><dt><Tx text="Source" /></dt><dd>{source || "—"}</dd></div>
      </dl>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Component" /></th><th><Tx text="Kind" /></th><th className="num"><Tx text="Amount" /></th></tr></thead><tbody>{earnings.concat(deductions).map((line) => <tr key={`${line.kind}-${line.name}`}><td><Tx text={line.name} /></td><td><Tx text={line.kind} /></td><td className="num">{formatIdr(line.amount)}</td></tr>)}</tbody></table></div>
      {row.method === "Last tax month" ? <p className="hint"><Tx text="Last tax month detail uses the stored tax due and the PPh 21 already withheld. Missing earlier payrolls are not estimated." /></p> : null}
      <p className="hint"><Tx text="The stored payroll result is shown. Opening this detail does not recalculate a locked payroll." /></p>
    </div>
  );
}
