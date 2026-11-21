import Link from "next/link";
import { Tx } from "@/components/locale";
import { formatIdr } from "@/lib/format";
import { BPJS_PROGRAMS, type BpjsProgram } from "@/lib/bpjs-catalog";
import type { RuleDefinition } from "@/lib/domain";

export type BpjsChange = {
  id: string;
  code: string;
  program: string;
  field: string;
  before: string;
  after: string;
  source: string;
  effectiveFrom: string;
  status: string;
  user: string;
  when: string;
};

export type MemberRow = {
  id: string;
  code: string;
  name: string;
  program: string;
  number: string;
  status: string;
  start: string;
  end: string;
  verification: string;
};

const JKK = ["Very low", "Low", "Medium", "High", "Very high"];

function percent(rate: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rate * 100)}%`;
}

function phrase(value: string) {
  if (value === "—" || value.endsWith("%")) return value;
  return <Tx text={value} />;
}

function noteText(note: string) {
  const wage = note.match(/^Wage cap (.+)$/);
  if (wage) return <><Tx text="Wage cap" /> {wage[1]}</>;
  const period = note.match(/^Period cap (.+)$/);
  if (period) return <><Tx text="Period cap" /> {period[1]}</>;
  const risk = note.match(/^Risk class (\d+)(?: \((.+)\))?$/);
  if (risk) return <><Tx text="Risk class" /> {risk[1]}{risk[2] ? <> (<Tx text={risk[2]} />)</> : null}</>;
  return <Tx text={note} />;
}

function rateText(program: BpjsProgram, rule: RuleDefinition | null, jkkClass: number) {
  if (!rule) return { employee: "—", employer: "—", note: "No validated statutory rule is effective for this period." };
  const bpjs = rule.bpjs;
  if (program.code === "JKN") return { employee: percent(bpjs.kesEmployee), employer: percent(bpjs.kesEmployer), note: bpjs.kesCap > 0 ? `Wage cap ${formatIdr(bpjs.kesCap)}` : "No wage cap is stored." };
  if (program.code === "JHT") return { employee: percent(bpjs.jhtEmployee), employer: percent(bpjs.jhtEmployer), note: "No wage cap is stored for JHT." };
  if (program.code === "JKK") {
    const index = Math.min(Math.max(jkkClass, 1), bpjs.jkkByClass.length) - 1;
    return { employee: "Employer pays", employer: percent(bpjs.jkkByClass[index] || 0), note: `Risk class ${jkkClass}${JKK[index] ? ` (${JKK[index]})` : ""}` };
  }
  if (program.code === "JKM") return { employee: "Not an employee deduction", employer: percent(bpjs.jkmEmployer), note: "No wage cap is stored." };
  if (program.code === "JP") return { employee: percent(bpjs.jpEmployee), employer: percent(bpjs.jpEmployer), note: `Period cap ${formatIdr(bpjs.jpCap)}` };
  return { employee: "Not an employee deduction", employer: "Not verified", note: "No verified JKP rate is stored." };
}

function componentStatus(program: BpjsProgram, hasRule: boolean) {
  if (program.code === "JKP") return "Recognized, formula not active";
  return hasRule ? "Parameter stored" : "No active rule";
}

export function BpjsWorkspace({
  view,
  family,
  program,
  section,
  approved,
  ruleCode,
  effectiveFrom,
  source,
  definition,
  jkkClass,
  canEditRule,
  canEditCompany,
  members,
  changes,
  history,
}: {
  view: string;
  family: string;
  program: string;
  section: string;
  approved: boolean;
  ruleCode: string;
  effectiveFrom: string;
  source: string;
  definition: RuleDefinition | null;
  jkkClass: number;
  canEditRule: boolean;
  canEditCompany: boolean;
  members: MemberRow[];
  changes: BpjsChange[];
  history: { id: string; code: string; effectiveFrom: string; approvalStatus: string; source: string; user: string; when: string }[];
}) {
  const selected = bpjsProgramSafe(program);
  const activeView = selected ? "detail" : view === "members" || view === "changes" ? view : "components";
  const activeSection = section === "calc" || section === "status" ? section : "info";
  const shown = BPJS_PROGRAMS.filter((item) => family === "health" ? item.family === "health" : family === "tk" ? item.family === "tk" : true);
  return (
    <div className="stack-form">
      <div className="form-actions">
        <Link className={activeView === "components" ? "btn" : "btn secondary"} href="/tax/bpjs"><Tx text="Component list" /></Link>
        <Link className={activeView === "members" ? "btn" : "btn secondary"} href="/tax/bpjs?view=members"><Tx text="Employee membership" /></Link>
        <Link className={activeView === "changes" ? "btn" : "btn secondary"} href="/tax/bpjs?view=changes"><Tx text="Rule changes" /></Link>
      </div>
      {activeView === "components" ? <List shown={shown} family={family} definition={definition} approved={approved} jkkClass={jkkClass} canEditRule={canEditRule} canEditCompany={canEditCompany} /> : null}
      {activeView === "detail" && selected ? <Detail program={selected} section={activeSection} definition={definition} approved={approved} jkkClass={jkkClass} ruleCode={ruleCode} effectiveFrom={effectiveFrom} source={source} canEditRule={canEditRule} canEditCompany={canEditCompany} history={history} changes={changes} /> : null}
      {activeView === "members" ? <Members rows={members} /> : null}
      {activeView === "changes" ? <Changes rows={changes} /> : null}
    </div>
  );
}

function bpjsProgramSafe(code: string) {
  return BPJS_PROGRAMS.find((item) => item.code === code.toUpperCase()) ?? null;
}

function List({ shown, family, definition, approved, jkkClass, canEditRule, canEditCompany }: { shown: BpjsProgram[]; family: string; definition: RuleDefinition | null; approved: boolean; jkkClass: number; canEditRule: boolean; canEditCompany: boolean }) {
  return (
    <div className="card stack-form">
      <div className="form-actions">
        <Link className={!family ? "btn" : "btn secondary"} href="/tax/bpjs"><Tx text="All" /></Link>
        <Link className={family === "health" ? "btn" : "btn secondary"} href="/tax/bpjs?family=health"><Tx text="BPJS Kesehatan" /></Link>
        <Link className={family === "tk" ? "btn" : "btn secondary"} href="/tax/bpjs?family=tk"><Tx text="BPJS Ketenagakerjaan" /></Link>
      </div>
      <div className="table-wrap"><table><thead><tr><th>No.</th><th><Tx text="Program code" /></th><th><Tx text="BPJS type" /></th><th><Tx text="Benefit name" /></th><th><Tx text="Employee contribution" /></th><th><Tx text="Employer contribution" /></th><th><Tx text="Component status" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Action" /></th></tr></thead><tbody>
        {shown.map((item, index) => {
          const rates = rateText(item, definition, jkkClass);
          return <tr key={item.code}><td>{index + 1}</td><td>{item.code}</td><td><Tx text={item.kind} /></td><td><Tx text={item.name} /></td><td>{phrase(rates.employee)}</td><td>{phrase(rates.employer)}</td><td><Tx text={componentStatus(item, Boolean(definition))} /></td><td><Tx text={approved ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td><Link href={`/tax/bpjs?program=${item.code}`}><Tx text="Open detail" /></Link>{item.code === "JKK" && canEditCompany ? <> · <Link href="/tax/config"><Tx text="Edit" /></Link></> : null}{item.code !== "JKP" && canEditRule ? <> · <Link href="/platform/rules"><Tx text="Edit stored rule" /></Link></> : null}</td></tr>;
        })}
      </tbody></table></div>
      <p className="hint"><Tx text={ratesHint(approved)} /></p>
    </div>
  );
}

function ratesHint(approved: boolean) {
  return approved
    ? "Employee and employer contributions are shown separately. JKK follows the stored company risk class."
    : "Stored percentages are not an approved official tariff. JKP has no verified rate, so it is not deducted.";
}

function Detail({ program, section, definition, approved, jkkClass, ruleCode, effectiveFrom, source, canEditRule, canEditCompany, history, changes }: { program: BpjsProgram; section: string; definition: RuleDefinition | null; approved: boolean; jkkClass: number; ruleCode: string; effectiveFrom: string; source: string; canEditRule: boolean; canEditCompany: boolean; history: { id: string; code: string; effectiveFrom: string; approvalStatus: string; source: string; user: string; when: string }[]; changes: BpjsChange[] }) {
  const rates = rateText(program, definition, jkkClass);
  const programChanges = changes.filter((row) => row.program === program.code);
  return (
    <div className="card stack-form">
      <p className="section-label"><Tx text={program.name} /></p>
      <div className="form-actions">
        <Link className={section === "info" ? "btn" : "btn secondary"} href={`/tax/bpjs?program=${program.code}&section=info`}><Tx text="Information and rules" /></Link>
        <Link className={section === "calc" ? "btn" : "btn secondary"} href={`/tax/bpjs?program=${program.code}&section=calc`}><Tx text="Calculation" /></Link>
        <Link className={section === "status" ? "btn" : "btn secondary"} href={`/tax/bpjs?program=${program.code}&section=status`}><Tx text="Active regulation status" /></Link>
      </div>
      {section === "info" ? (
        <dl className="facts">
          <div><dt><Tx text="Program code" /></dt><dd>{program.code}</dd></div>
          <div><dt><Tx text="Benefit name" /></dt><dd><Tx text={program.name} /></dd></div>
          <div><dt><Tx text="BPJS type" /></dt><dd><Tx text={program.kind} /></dd></div>
          <div><dt><Tx text="Program description" /></dt><dd><Tx text={program.description} /></dd></div>
          <div><dt><Tx text="Relevant membership" /></dt><dd><Tx text={program.membership} /></dd></div>
          <div><dt><Tx text="Membership rule" /></dt><dd><Tx text="Enrollment is read from the employee record. This page does not add an approval flow." /></dd></div>
          <div><dt><Tx text="Who pays" /></dt><dd><Tx text={program.payer} /></dd></div>
          <div><dt><Tx text="Legal basis" /></dt><dd><Tx text={program.law} /></dd></div>
          <div><dt><Tx text="Article" /></dt><dd><Tx text={program.article} /></dd></div>
          <div><dt><Tx text="Special conditions" /></dt><dd><Tx text={program.special} /></dd></div>
        </dl>
      ) : null}
      {section === "calc" ? (
        <div>
          <p><Tx text={program.wage} /></p>
          <p><Tx text={program.formula} /></p>
          <p className="hint"><Tx text="Employee contribution" />: {rates.employee} · <Tx text="Employer contribution" />: {rates.employer} · {noteText(rates.note)}</p>
          <p className="hint"><Tx text="Parameter version" />: {ruleCode || "—"} · {effectiveFrom || "—"} · {source || <Tx text="No source recorded" />}</p>
          {program.code === "JKP" || !approved ? <p className="hint"><Tx text="This is not an official contribution. Unverified parameters are not used as an official tariff." /></p> : <Illustration program={program} definition={definition} jkkClass={jkkClass} />}
          {canEditCompany && program.code === "JKK" ? <Link className="text-action" href="/tax/config"><Tx text="Edit company risk class" /></Link> : null}
          {canEditRule ? <Link className="text-action" href="/platform/rules"><Tx text="Edit stored rule" /></Link> : null}
        </div>
      ) : null}
      {section === "status" ? (
        <div>
          <p>{program.code} · {ruleCode || "—"} · <Tx text={approved ? "Approved for calculation" : "Sample, not verified for official use"} /></p>
          <p className="hint"><Tx text="Effective from" /> {effectiveFrom || "—"} · <Tx text="Source" /> {source || <Tx text="No source recorded" />}</p>
          <p className="hint"><Tx text="Regulation status is not the same as an employee's membership." /></p>
          {programChanges.length === 0 ? <p className="empty"><Tx text="No parameter change is recorded for this program." /></p> : <div className="table-wrap"><table><thead><tr><th><Tx text="Parameter" /></th><th><Tx text="Previous value" /></th><th><Tx text="New value" /></th><th><Tx text="Effective from" /></th><th><Tx text="Changed by" /></th><th><Tx text="When" /></th></tr></thead><tbody>{programChanges.map((row) => <tr key={row.id}><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td><td>{row.effectiveFrom}</td><td>{row.user || "—"}</td><td>{row.when}</td></tr>)}</tbody></table></div>}
          <div className="table-wrap"><table><thead><tr><th><Tx text="Code" /></th><th><Tx text="Effective from" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Source" /></th></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.effectiveFrom}</td><td><Tx text={row.approvalStatus === "APPROVED" ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td>{row.source || "—"}</td></tr>)}</tbody></table></div>
        </div>
      ) : null}
    </div>
  );
}

function Illustration({ program, definition, jkkClass }: { program: BpjsProgram; definition: RuleDefinition | null; jkkClass: number }) {
  if (!definition || program.code === "JKP") return null;
  const base = 10_000_000;
  const bpjs = definition.bpjs;
  const index = Math.min(Math.max(jkkClass, 1), bpjs.jkkByClass.length) - 1;
  const cap = program.code === "JKN" ? bpjs.kesCap : program.code === "JP" ? bpjs.jpCap : 0;
  const used = cap > 0 ? Math.min(base, cap) : base;
  const employeeRate = program.code === "JKN" ? bpjs.kesEmployee : program.code === "JHT" ? bpjs.jhtEmployee : program.code === "JP" ? bpjs.jpEmployee : 0;
  const employerRate = program.code === "JKN" ? bpjs.kesEmployer : program.code === "JHT" ? bpjs.jhtEmployer : program.code === "JP" ? bpjs.jpEmployer : program.code === "JKM" ? bpjs.jkmEmployer : bpjs.jkkByClass[index] || 0;
  return (
    <div>
      <p className="section-label"><Tx text="Illustration for a Rp10,000,000 wage base" /></p>
      <p className="record"><span><Tx text="Employee contribution" /></span><strong>{formatIdr(Math.round(used * employeeRate))}</strong></p>
      <p className="record"><span><Tx text="Employer contribution" /></span><strong>{formatIdr(Math.round(used * employerRate))}</strong></p>
      <p className="hint"><Tx text="Illustration only. This is not an official payroll result. Employer contribution is not a deduction." /></p>
    </div>
  );
}

function Members({ rows }: { rows: MemberRow[] }) {
  return (
    <div className="card table-wrap">
      {rows.length === 0 ? <p className="empty"><Tx text="No employee is enrolled in a BPJS program yet. Enrollment stays on the employee record." /></p> : <table><thead><tr><th><Tx text="Employee ID" /></th><th><Tx text="Employee name" /></th><th><Tx text="BPJS program" /></th><th><Tx text="Membership number" /></th><th><Tx text="Membership status" /></th><th><Tx text="Start" /></th><th><Tx text="End" /></th><th><Tx text="Verification" /></th><th><Tx text="Action" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.program}</td><td>{row.number || "—"}</td><td><Tx text={row.status} /></td><td>{row.start || "—"}</td><td>{row.end || "—"}</td><td><Tx text={row.verification} /></td><td><Link href={`/employees/${row.id.split(":")[0]}`}><Tx text="Open detail" /></Link></td></tr>)}</tbody></table>}
    </div>
  );
}

function Changes({ rows }: { rows: BpjsChange[] }) {
  return (
    <div className="card table-wrap">
      {rows.length === 0 ? <p className="empty"><Tx text="No parameter change is recorded. A sample rule is not listed as a change." /></p> : <table><thead><tr><th><Tx text="Program code" /></th><th><Tx text="Program" /></th><th><Tx text="Parameter" /></th><th><Tx text="Previous value" /></th><th><Tx text="Proposed value" /></th><th><Tx text="Legal reference" /></th><th><Tx text="Effective from" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="When" /></th><th><Tx text="Changed by" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.program}</td><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td><td>{row.source || "—"}</td><td>{row.effectiveFrom}</td><td><Tx text={row.status === "APPROVED" ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td>{row.when}</td><td>{row.user || "—"}</td></tr>)}</tbody></table>}
    </div>
  );
}
