import Link from "next/link";
import { Tx } from "@/components/locale";
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
  changes: { id: string; field: string; before: string; after: string; source: string; effectiveFrom: string; status: string; user: string; when: string }[];
}) {
  const active = ["ptkp", "method", "calc", "history"].includes(tab) ? tab : "info";
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const exportQuery = new URLSearchParams();
  if (filters.period) exportQuery.set("period", filters.period);
  if (filters.employee) exportQuery.set("employee", filters.employee);
  if (filters.status) exportQuery.set("status", filters.status);
  const exportHref = `/api/tax/pph21?${exportQuery.toString()}`;
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
        {active === "method" ? <Method definition={definition} effectiveFrom={effectiveFrom} /> : null}
        {active === "calc" ? <Calc approved={approved} /> : null}
        {active === "history" ? <History rows={changes} /> : null}
      </section>
      <section className="card stack-form">
        <p className="section-label"><Tx text="PPh 21 withholding results" /></p>
        <form className="toolbar" method="get" action="/tax/pph21">
          <input type="hidden" name="tab" value="info" />
          <label className="field"><Tx text="Period" /><input name="period" defaultValue={filters.period} placeholder="YYYY-MM" /></label>
          <label className="field"><Tx text="Employee" /><input name="employee" defaultValue={filters.employee} placeholder="Name or ID" /></label>
          <label className="field"><Tx text="Calculation status" /><input name="status" defaultValue={filters.status} placeholder="Status" /></label>
          <button className="btn secondary"><Tx text="Filter" /></button>
        </form>
        {rows.length === 0 ? <p className="empty"><Tx text="No statutory lines yet." /></p> : <div className="table-wrap"><table><thead><tr><th><Tx text="Tax period" /></th><th><Tx text="Employee ID" /></th><th><Tx text="Employee name" /></th><th><Tx text="PTKP" /></th><th><Tx text="TER category / method" /></th><th className="num"><Tx text="Gross income" /></th><th className="num"><Tx text="PPh 21" /></th><th><Tx text="Calculation status" /></th><th><Tx text="Action" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.period}</td><td>{row.employeeCode}</td><td>{row.name}</td><td>{row.ptkp}</td><td><Tx text={row.method} /></td><td className="num">{formatIdr(row.gross)}</td><td className="num">{formatIdr(row.pph21)}</td><td><Tx text={row.status} /></td><td><Link href={`/tax/pph21?item=${row.id}`}><Tx text="Open detail" /></Link></td></tr>)}</tbody></table></div>}
        <div className="page-actions">
          <a className="btn secondary" href={exportHref}><Tx text="Export Excel" /></a>
          <a className="btn secondary" href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}format=pdf`}><Tx text="Export PDF" /></a>
        </div>
        {selected ? <ResultDetail row={selected} /> : null}
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

function Method({ definition, effectiveFrom }: { definition: RuleDefinition | null; effectiveFrom: string }) {
  return (
    <div className="stack-form">
      <RateTable title="Monthly TER" category="A" />
      <RateTable title="Monthly TER" category="B" />
      <RateTable title="Monthly TER" category="C" />
      <div>
        <p className="section-label"><Tx text="Daily TER" /></p>
        <p className="hint"><Tx text="Daily TER applies only to the daily income range in PMK 168/2023. It is not used for a permanent employee." /></p>
        <div className="table-wrap"><table><thead><tr><th><Tx text="Daily gross up to" /></th><th className="num"><Tx text="Rate" /></th><th><Tx text="Source" /></th><th><Tx text="Effective from" /></th></tr></thead><tbody>{DAILY_TER.map((band) => <tr key={band.upTo}><td>{formatIdr(band.upTo)}</td><td className="num">{percent(band.rate)}</td><td>{TER_SOURCE}</td><td>2024-01-01</td></tr>)}</tbody></table></div>
      </div>
      <div>
        <p className="section-label"><Tx text="Article 17 progressive rates" /></p>
        <p className="hint"><Tx text="Pasal 17 is used for the last tax month. It is not divided by 12 for every month." /></p>
        {definition ? <div className="table-wrap"><table><thead><tr><th><Tx text="Taxable income up to" /></th><th className="num"><Tx text="Rate" /></th><th><Tx text="Effective from" /></th></tr></thead><tbody>{definition.progressiveAnnual.map((row, index) => <tr key={index}><td>{row.upTo == null ? <Tx text="Above the previous bracket" /> : formatIdr(row.upTo)}</td><td className="num">{percent(row.rate)}</td><td>{effectiveFrom || "—"}</td></tr>)}</tbody></table></div> : <p><Tx text="No validated statutory rule is effective for this period." /></p>}
      </div>
    </div>
  );
}

function RateTable({ title, category }: { title: string; category: TerCategory }) {
  return (
    <div>
      <p className="section-label"><Tx text={title} /> {category}</p>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Monthly gross up to" /></th><th className="num"><Tx text="Rate" /></th><th><Tx text="Source" /></th></tr></thead><tbody>{TER_TABLES[category].filter((band) => Number.isFinite(band.upTo)).map((band) => <tr key={band.upTo}><td>{formatIdr(band.upTo)}</td><td className="num">{percent(band.rate)}</td><td>{TER_SOURCE}</td></tr>)}<tr><td><Tx text="Above the previous bracket" /></td><td className="num">34%</td><td>{TER_SOURCE}</td></tr></tbody></table></div>
    </div>
  );
}

function Calc({ approved }: { approved: boolean }) {
  return (
    <div>
      <p className="section-label"><Tx text="Tax month other than the last tax month" /></p>
      <p><Tx text="For a permanent employee covered by PMK 168/2023, PPh 21 = monthly gross × the monthly TER for that PTKP category and gross band." /></p>
      <p className="hint"><Tx text="Illustration, not a payroll result: TK/0, gross Rp10,000,000, TER A 2% = Rp200,000." /></p>
      <p className="section-label"><Tx text="Last tax month" /></p>
      <p><Tx text="The last tax month is December, or the month the employee stops working. PPh 21 = tax due for the tax year or part of the year − PPh 21 already withheld. The annual tax uses Pasal 17. Missing earlier payrolls are not estimated." /></p>
      <p className="hint"><Tx text="THR and bonus in the same month are added to that month's gross. They are not taxed with a separate annual-rate divided by 12." /></p>
      {approved ? null : <p className="hint"><Tx text="The active rule is still a sample. Do not treat the result as an official filing figure." /></p>}
    </div>
  );
}

function History({ rows }: { rows: { id: string; field: string; before: string; after: string; source: string; effectiveFrom: string; status: string; user: string; when: string }[] }) {
  if (rows.length === 0) return <p className="empty"><Tx text="No parameter change is recorded. A sample rule is not listed as a change." /></p>;
  return <div className="table-wrap"><table><thead><tr><th><Tx text="When" /></th><th><Tx text="Parameter" /></th><th><Tx text="Previous value" /></th><th><Tx text="New value" /></th><th><Tx text="Legal reference" /></th><th><Tx text="Effective from" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Changed by" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.when}</td><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td><td>{row.source || "—"}</td><td>{row.effectiveFrom}</td><td><Tx text={row.status === "APPROVED" ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td>{row.user || "—"}</td></tr>)}</tbody></table></div>;
}

function ResultDetail({ row }: { row: PphResultRow }) {
  const category = terCategory(row.ptkp);
  return (
    <div>
      <p className="section-label"><Tx text="Calculation detail" /></p>
      <dl className="facts">
        <div><dt><Tx text="Employee" /></dt><dd>{row.employeeCode} · {row.name}</dd></div>
        <div><dt><Tx text="Tax period" /></dt><dd>{row.period}</dd></div>
        <div><dt><Tx text="PTKP" /></dt><dd>{row.ptkp}</dd></div>
        <div><dt><Tx text="TER category" /></dt><dd>{category ? `TER ${category}` : "—"}</dd></div>
        <div><dt><Tx text="Method" /></dt><dd><Tx text={row.method} /></dd></div>
        <div><dt><Tx text="Gross income" /></dt><dd>{formatIdr(row.gross)}</dd></div>
        <div><dt><Tx text="PPh 21" /></dt><dd>{formatIdr(row.pph21)}</dd></div>
        <div><dt><Tx text="Calculation status" /></dt><dd><Tx text={row.status} /></dd></div>
      </dl>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Component" /></th><th><Tx text="Kind" /></th><th className="num"><Tx text="Amount" /></th></tr></thead><tbody>{row.lines.map((line) => <tr key={`${line.kind}-${line.name}`}><td><Tx text={line.name} /></td><td><Tx text={line.kind} /></td><td className="num">{formatIdr(line.amount)}</td></tr>)}</tbody></table></div>
      <p className="hint"><Tx text="This is the amount stored on the payroll. Opening this detail does not recalculate a locked or submitted payroll." /></p>
    </div>
  );
}
