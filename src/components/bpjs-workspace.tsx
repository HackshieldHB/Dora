"use client";

import { useState } from "react";
import Link from "next/link";
import { Tx, useT } from "@/components/locale";
import { checkRegulatoryAction, statutoryAction } from "@/app/actions";
import { formatIdr, todayJakarta } from "@/lib/format";
import { BPJS_PROGRAMS, type BpjsProgram } from "@/lib/bpjs-catalog";
import type { RuleDefinition } from "@/lib/domain";

export type BpjsChange = {
  id: string;
  code: string;
  program: string;
  programName: string;
  field: string;
  before: string;
  after: string;
  source: string;
  effectiveFrom: string;
  reason: string;
  kind: string;
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

type CompanyChoice = { jkkClass: number; bpjsKesEnabled: boolean; includeOvertime: boolean };
type Regulatory = { checkedAt: string; result: string; pending: number; canCheck: boolean };
type Compare = { from: string; to: string; rules: { id: string; code: string }[]; diff: { field: string; before: string; after: string }[] | null };

function percent(rate: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rate * 100)}%`;
}

function phrase(value: string) {
  if (value === "—" || value.endsWith("%")) return value;
  return <Tx text={value} />;
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

function classRate(definition: RuleDefinition | null, approved: boolean, jkkClass: number) {
  if (!definition || !approved) return "Needs verification";
  const rates = definition.bpjs.jkkByClass;
  const index = jkkClass - 1;
  if (index < 0 || index >= rates.length) return "Not available";
  return percent(rates[index] || 0);
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
  company,
  canEditRule,
  canEditCompany,
  members,
  changes,
  history,
  regulatory,
  compare,
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
  company: CompanyChoice;
  canEditRule: boolean;
  canEditCompany: boolean;
  members: MemberRow[];
  changes: BpjsChange[];
  history: { id: string; code: string; effectiveFrom: string; approvalStatus: string; source: string; user: string; when: string }[];
  regulatory: Regulatory;
  compare: Compare;
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
      {activeView === "components" ? <List shown={shown} family={family} definition={definition} approved={approved} company={company} canEditRule={canEditRule} canEditCompany={canEditCompany} /> : null}
      {activeView === "detail" && selected ? <Detail program={selected} section={activeSection} definition={definition} approved={approved} company={company} ruleCode={ruleCode} effectiveFrom={effectiveFrom} source={source} canEditRule={canEditRule} canEditCompany={canEditCompany} history={history} changes={changes} /> : null}
      {activeView === "members" ? <Members rows={members} /> : null}
      {activeView === "changes" ? <Changes rows={changes} regulatory={regulatory} compare={compare} canCheck={regulatory.canCheck} /> : null}
    </div>
  );
}

function bpjsProgramSafe(code: string) {
  return BPJS_PROGRAMS.find((item) => item.code === code.toUpperCase()) ?? null;
}

function List({ shown, family, definition, approved, company, canEditRule, canEditCompany }: { shown: BpjsProgram[]; family: string; definition: RuleDefinition | null; approved: boolean; company: CompanyChoice; canEditRule: boolean; canEditCompany: boolean }) {
  return (
    <div className="card stack-form">
      <div className="form-actions">
        <Link className={!family ? "btn" : "btn secondary"} href="/tax/bpjs"><Tx text="All" /></Link>
        <Link className={family === "health" ? "btn" : "btn secondary"} href="/tax/bpjs?family=health"><Tx text="BPJS Kesehatan" /></Link>
        <Link className={family === "tk" ? "btn" : "btn secondary"} href="/tax/bpjs?family=tk"><Tx text="BPJS Ketenagakerjaan" /></Link>
      </div>
      <div className="table-wrap"><table><thead><tr><th>No.</th><th><Tx text="Program code" /></th><th><Tx text="BPJS type" /></th><th><Tx text="Benefit name" /></th><th><Tx text="Employee contribution" /></th><th><Tx text="Employer contribution" /></th><th><Tx text="Component status" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Action" /></th></tr></thead><tbody>
        {shown.map((item, index) => {
          const rates = rateText(item, definition, company.jkkClass);
          return <tr key={item.code}><td>{index + 1}</td><td>{item.code}</td><td><Tx text={item.kind} /></td><td><Tx text={item.name} /></td><td>{phrase(rates.employee)}</td><td>{phrase(rates.employer)}</td><td><Tx text={componentStatus(item, Boolean(definition))} /></td><td><Tx text={approved ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td><Link href={`/tax/bpjs?program=${item.code}`}><Tx text="Open detail" /></Link>{item.code === "JKK" && canEditCompany ? <> · <Link href="/tax/bpjs?program=JKK&section=calc"><Tx text="Edit company risk class" /></Link></> : null}{item.code !== "JKP" && canEditRule ? <> · <Link href="/platform/rules"><Tx text="Edit stored rule" /></Link></> : null}</td></tr>;
        })}
      </tbody></table></div>
      <p className="hint"><Tx text={ratesHint(approved)} /></p>
      {canEditCompany ? <OvertimeChoice company={company} /> : null}
    </div>
  );
}

function ratesHint(approved: boolean) {
  return approved
    ? "Employee and employer contributions are shown separately. JKK follows the stored company risk class."
    : "Stored percentages are not an approved official tariff. JKP has no verified rate, so it is not deducted.";
}

function OvertimeChoice({ company }: { company: CompanyChoice }) {
  return (
    <form action={statutoryAction} className="stack-form">
      <p className="section-label"><Tx text="Company wage base" /></p>
      <p className="hint"><Tx text="JKK risk class is edited on the JKK calculation tab. BPJS Kesehatan participation is edited on the JKN detail." /></p>
      <input type="hidden" name="return" value="/tax/bpjs" />
      <input type="hidden" name="jkkClass" value={company.jkkClass} />
      {company.bpjsKesEnabled ? <input type="hidden" name="bpjsKesEnabled" value="on" /> : null}
      <label><input name="includeOvertime" type="checkbox" defaultChecked={company.includeOvertime} /> <Tx text="Include reviewed overtime in the BPJS wage base" /></label>
      <button className="btn"><Tx text="Save parameters" /></button>
    </form>
  );
}

function Detail({ program, section, definition, approved, company, ruleCode, effectiveFrom, source, canEditRule, canEditCompany, history, changes }: { program: BpjsProgram; section: string; definition: RuleDefinition | null; approved: boolean; company: CompanyChoice; ruleCode: string; effectiveFrom: string; source: string; canEditRule: boolean; canEditCompany: boolean; history: { id: string; code: string; effectiveFrom: string; approvalStatus: string; source: string; user: string; when: string }[]; changes: BpjsChange[] }) {
  const programChanges = changes.filter((row) => row.program === program.code);
  return (
    <div className="card stack-form">
      <p><Link href="/tax/bpjs"><Tx text="Back to the list" /></Link></p>
      <p className="section-label">{program.code} · <Tx text={program.name} /></p>
      <div className="form-actions">
        <Link className={section === "info" ? "btn" : "btn secondary"} href={`/tax/bpjs?program=${program.code}&section=info`}><Tx text="Information and rules" /></Link>
        <Link className={section === "calc" ? "btn" : "btn secondary"} href={`/tax/bpjs?program=${program.code}&section=calc`}><Tx text="Calculation" /></Link>
        <Link className={section === "status" ? "btn" : "btn secondary"} href={`/tax/bpjs?program=${program.code}&section=status`}><Tx text="Active regulation status" /></Link>
      </div>
      {section === "info" ? <Info program={program} company={company} canEditCompany={canEditCompany} /> : null}
      {section === "calc" ? <Calculation program={program} definition={definition} approved={approved} company={company} ruleCode={ruleCode} effectiveFrom={effectiveFrom} source={source} canEditRule={canEditRule} canEditCompany={canEditCompany} /> : null}
      {section === "status" ? (
        <div>
          <dl className="facts">
            <div><dt><Tx text="Legal reference" /></dt><dd><Tx text={program.law} /></dd></div>
            <div><dt><Tx text="Rule version" /></dt><dd>{ruleCode || <Tx text="Not available" />}{effectiveFrom ? ` · ${effectiveFrom}` : ""}</dd></div>
            <div><dt><Tx text="Source" /></dt><dd>{source || <Tx text="No source recorded" />}</dd></div>
            <div><dt><Tx text="Regulatory verification" /></dt><dd><Tx text={approved ? "Approved for calculation" : definition ? "Needs verification" : "Not available"} /></dd></div>
          </dl>
          <p className="hint"><Tx text="Regulation status is not the same as an employee's membership." /></p>
          <div className="table-wrap"><table><thead><tr><th><Tx text="Parameter" /></th><th><Tx text="Previous value" /></th><th><Tx text="New value" /></th><th><Tx text="Effective from" /></th><th><Tx text="Changed by" /></th><th><Tx text="Change date" /></th></tr></thead><tbody>
            {programChanges.length === 0 ? <tr><td colSpan={6}><p className="empty"><Tx text="No change history yet" /></p><p><Tx text="No parameter change is recorded for this program." /></p></td></tr> : programChanges.map((row) => <tr key={row.id}><td><Tx text={row.field} /></td><td>{phrase(row.before)}</td><td>{phrase(row.after)}</td><td>{row.effectiveFrom}</td><td>{row.user || "—"}</td><td>{row.when}</td></tr>)}
          </tbody></table></div>
          <div className="table-wrap"><table><thead><tr><th><Tx text="Code" /></th><th><Tx text="Effective from" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Source" /></th></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.effectiveFrom}</td><td><Tx text={row.approvalStatus === "APPROVED" ? "Approved for calculation" : "Sample, not verified for official use"} /></td><td>{row.source || "—"}</td></tr>)}</tbody></table></div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ program, company, canEditCompany }: { program: BpjsProgram; company: CompanyChoice; canEditCompany: boolean }) {
  return (
    <div className="stack-form">
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
      {program.code === "JKN" && canEditCompany ? (
        <form action={statutoryAction} className="stack-form">
          <p className="section-label"><Tx text="BPJS Kesehatan participation" /></p>
          <input type="hidden" name="return" value="/tax/bpjs?program=JKN&section=info" />
          <input type="hidden" name="jkkClass" value={company.jkkClass} />
          {company.includeOvertime ? <input type="hidden" name="includeOvertime" value="on" /> : null}
          <label><input name="bpjsKesEnabled" type="checkbox" defaultChecked={company.bpjsKesEnabled} /> <Tx text="BPJS Kesehatan enabled" /></label>
          <button className="btn"><Tx text="Save parameters" /></button>
        </form>
      ) : null}
    </div>
  );
}

function Calculation({ program, definition, approved, company, ruleCode, effectiveFrom, source, canEditRule, canEditCompany }: { program: BpjsProgram; definition: RuleDefinition | null; approved: boolean; company: CompanyChoice; ruleCode: string; effectiveFrom: string; source: string; canEditRule: boolean; canEditCompany: boolean }) {
  const rows = parameterRows(program, definition, approved, company.jkkClass, effectiveFrom, ruleCode, source);
  return (
    <div className="stack-form">
      <section>
        <p className="section-label"><Tx text="Calculation parameters" /></p>
        <dl className="facts">{rows.map((row) => <div key={row.label}><dt><Tx text={row.label} /></dt><dd>{row.label === "Risk class" && row.value !== "Not applicable" ? <>{company.jkkClass}{JKK[company.jkkClass - 1] ? <> (<Tx text={JKK[company.jkkClass - 1]} />)</> : null}</> : phrase(row.value)}</dd></div>)}</dl>
      </section>
      <section>
        <p className="section-label"><Tx text="Calculation formula" /></p>
        <dl className="facts">
          <div><dt><Tx text="Calculation formula" /></dt><dd><Tx text={program.formula} /></dd></div>
          <div><dt><Tx text="Wage base" /></dt><dd><Tx text={program.wage} /></dd></div>
          <div><dt><Tx text="Employee rate" /></dt><dd>{phrase(rows.find((row) => row.label === "Employee rate")?.value || "Not applicable")}</dd></div>
          <div><dt><Tx text="Employer rate" /></dt><dd>{phrase(rows.find((row) => row.label === "Employer rate")?.value || "Not applicable")}</dd></div>
          <div><dt><Tx text="Maximum wage base" /></dt><dd>{phrase(rows.find((row) => row.label === "Maximum wage base")?.value || "Not applicable")}</dd></div>
        </dl>
        <p className="hint"><Tx text="Official rates are not changed from this screen." /></p>
      </section>
      <Example program={program} definition={definition} approved={approved} jkkClass={company.jkkClass} />
      {program.code === "JKK" ? <RiskClass company={company} definition={definition} approved={approved} canEdit={canEditCompany} /> : null}
      {canEditRule && program.code !== "JKP" ? <Link className="text-action" href="/platform/rules"><Tx text="Edit stored rule" /></Link> : null}
    </div>
  );
}

function parameterRows(program: BpjsProgram, definition: RuleDefinition | null, approved: boolean, jkkClass: number, effectiveFrom: string, ruleCode: string, source: string) {
  const stored = Boolean(definition) && approved;
  const rate = (value: number | null, applicable: boolean) => {
    if (!applicable) return "Not applicable";
    if (value == null) return "Not available";
    return stored ? percent(value) : "Needs verification";
  };
  const money = (value: number | null, applicable: boolean) => {
    if (!applicable) return "Not applicable";
    if (value == null || value <= 0) return stored ? "Not applicable" : "Needs verification";
    return stored ? formatIdr(value) : "Needs verification";
  };
  const bpjs = definition?.bpjs;
  const employeeRate = !bpjs ? null : program.code === "JKN" ? bpjs.kesEmployee : program.code === "JHT" ? bpjs.jhtEmployee : program.code === "JP" ? bpjs.jpEmployee : null;
  const employerRate = !bpjs ? null : program.code === "JKN" ? bpjs.kesEmployer : program.code === "JHT" ? bpjs.jhtEmployer : program.code === "JKM" ? bpjs.jkmEmployer : program.code === "JP" ? bpjs.jpEmployer : program.code === "JKK" ? bpjs.jkkByClass[Math.min(Math.max(jkkClass, 1), bpjs.jkkByClass.length) - 1] : null;
  const employeeApplies = program.code === "JKN" || program.code === "JHT" || program.code === "JP";
  const employerApplies = program.code !== "JKP";
  const cap = program.code === "JKN" ? bpjs?.kesCap ?? null : program.code === "JP" ? bpjs?.jpCap ?? null : null;
  const capApplies = program.code === "JKN" || program.code === "JP";
  return [
    { label: "Calculation period", value: effectiveFrom || "Not available" },
    { label: "Program code", value: program.code },
    { label: "Wage base", value: program.wage },
    { label: "Wage components", value: program.special },
    { label: "Employee rate", value: rate(employeeApplies ? employeeRate : null, employeeApplies) },
    { label: "Employer rate", value: program.code === "JKP" ? "Not available" : rate(employerApplies ? employerRate : null, employerApplies) },
    { label: "Risk class", value: program.code === "JKK" ? `${jkkClass}${JKK[jkkClass - 1] ? ` (${JKK[jkkClass - 1]})` : ""}` : "Not applicable" },
    { label: "Minimum wage base", value: "Not applicable" },
    { label: "Maximum wage base", value: money(capApplies ? cap : null, capApplies) },
    { label: "Effective from", value: effectiveFrom || "Not available" },
    { label: "Legal reference", value: source || program.law },
    { label: "Parameter version", value: ruleCode || "Not available" },
    { label: "Regulatory verification", value: approved ? "Approved for calculation" : definition ? "Needs verification" : "Not available" },
  ];
}

function Example({ program, definition, approved, jkkClass }: { program: BpjsProgram; definition: RuleDefinition | null; approved: boolean; jkkClass: number }) {
  const [period, setPeriod] = useState(todayJakarta().slice(0, 7));
  const [wage, setWage] = useState("10000000");
  const amount = Number(wage);
  const wageOk = Number.isFinite(amount) && amount >= 0 && wage.trim() !== "";
  const ready = approved && Boolean(definition) && program.code !== "JKP" && wageOk;
  const result = ready && definition ? illustrate(program, definition, jkkClass, amount) : null;
  return (
    <section className="card stack-form">
      <p className="section-label"><Tx text="Calculation example" /></p>
      <label className="field"><Tx text="Example payroll period" /><input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="YYYY-MM" /></label>
      <label className="field"><Tx text="Illustrative wage base" /><input value={wage} onChange={(event) => setWage(event.target.value)} inputMode="numeric" /></label>
      <p className="hint"><Tx text="The example uses the parameter version shown above. It does not change payroll or the stored parameters." /></p>
      {!ready ? (
        <div>
          {!wageOk ? <p><Tx text="Enter an illustrative wage base." /></p> : <p><Tx text="The example cannot run as a validated simulation because the parameters for this period are incomplete or not verified." /></p>}
          <p className="hint"><Tx text="This example treats the typed amount as the wage base. It does not check membership, a regulation change, the wage cap, or production rounding." /></p>
          <p className="hint"><Tx text="This example is not an official payroll result for any employee." /></p>
        </div>
      ) : result ? (
        <dl className="facts">
          <div><dt><Tx text="Payroll period" /></dt><dd>{period || "—"}</dd></div>
          <div><dt><Tx text="Wage base after the relevant cap" /></dt><dd>{formatIdr(result.used)}</dd></div>
          <div><dt><Tx text="Employee contribution" /></dt><dd>{result.employee == null ? <Tx text="Not applicable" /> : formatIdr(result.employee)}</dd></div>
          <div><dt><Tx text="Employer contribution" /></dt><dd>{formatIdr(result.employer)}</dd></div>
          {result.total == null ? null : <div><dt><Tx text="Total contribution" /></dt><dd>{formatIdr(result.total)}</dd></div>}
        </dl>
      ) : null}
    </section>
  );
}

function illustrate(program: BpjsProgram, definition: RuleDefinition, jkkClass: number, wage: number) {
  const bpjs = definition.bpjs;
  const cap = program.code === "JKN" ? bpjs.kesCap : program.code === "JP" ? bpjs.jpCap : 0;
  const used = cap > 0 ? Math.min(wage, cap) : wage;
  const index = Math.min(Math.max(jkkClass, 1), bpjs.jkkByClass.length) - 1;
  const employeeRate = program.code === "JKN" ? bpjs.kesEmployee : program.code === "JHT" ? bpjs.jhtEmployee : program.code === "JP" ? bpjs.jpEmployee : null;
  const employerRate = program.code === "JKN" ? bpjs.kesEmployer : program.code === "JHT" ? bpjs.jhtEmployer : program.code === "JP" ? bpjs.jpEmployer : program.code === "JKM" ? bpjs.jkmEmployer : bpjs.jkkByClass[index] || 0;
  const employee = employeeRate == null ? null : Math.round(used * employeeRate);
  const employer = Math.round(used * employerRate);
  return { used, employee, employer, total: employee == null ? null : employee + employer };
}

function RiskClass({ company, definition, approved, canEdit }: { company: CompanyChoice; definition: RuleDefinition | null; approved: boolean; canEdit: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState(String(company.jkkClass));
  const label = JKK[company.jkkClass - 1];
  return (
    <section className="stack-form">
      <p className="section-label"><Tx text="Risk class" /></p>
      <dl className="facts">
        <div><dt><Tx text="Current risk class" /></dt><dd>{company.jkkClass}{label ? <> (<Tx text={label} />)</> : null}</dd></div>
        <div><dt><Tx text="Rate for this class" /></dt><dd>{phrase(classRate(definition, approved, company.jkkClass))}</dd></div>
        <div><dt><Tx text="Regulatory verification" /></dt><dd><Tx text={approved ? "Approved for calculation" : "Needs verification"} /></dd></div>
      </dl>
      {canEdit ? <button type="button" className="btn secondary" onClick={() => setOpen(true)}><Tx text="Edit company risk class" /></button> : null}
      {open && canEdit ? (
        <form action={statutoryAction} className="card stack-form">
          <input type="hidden" name="return" value="/tax/bpjs?program=JKK&section=calc" />
          {company.bpjsKesEnabled ? <input type="hidden" name="bpjsKesEnabled" value="on" /> : null}
          {company.includeOvertime ? <input type="hidden" name="includeOvertime" value="on" /> : null}
          <p><Tx text="Current risk class" />: {company.jkkClass}{label ? <> (<Tx text={label} />)</> : null}</p>
          <label className="field"><Tx text="New risk class" /><select name="jkkClass" value={next} onChange={(event) => setNext(event.target.value)}>{JKK.map((name, index) => <option key={name} value={index + 1}>{index + 1} — {t(name)}</option>)}</select></label>
          <p><Tx text="Rate for this class" />: {phrase(classRate(definition, approved, Number(next)))}</p>
          <label className="field"><Tx text="Effective from" /><input name="effectiveFrom" type="date" required /></label>
          <label className="field"><Tx text="Reason for the change" /><input name="reason" required /></label>
          <p className="hint"><Tx text="The rate follows the stored rule for the selected class. This form does not edit the official rate." /></p>
          <p className="hint"><Tx text="A saved class is used the next time payroll is calculated. Locked payroll is not recalculated." /></p>
          <div className="form-actions">
            <button className="btn" type="submit"><Tx text="Save parameters" /></button>
            <button className="btn secondary" type="button" onClick={() => setOpen(false)}><Tx text="Cancel" /></button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Members({ rows }: { rows: MemberRow[] }) {
  return (
    <div className="card table-wrap">
      {rows.length === 0 ? <p className="empty"><Tx text="No employee is enrolled in a BPJS program yet. Enrollment stays on the employee record." /></p> : <table><thead><tr><th><Tx text="Employee ID" /></th><th><Tx text="Employee name" /></th><th><Tx text="BPJS program" /></th><th><Tx text="Membership number" /></th><th><Tx text="Membership status" /></th><th><Tx text="Start" /></th><th><Tx text="End" /></th><th><Tx text="Verification" /></th><th><Tx text="Action" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.program}</td><td>{row.number || "—"}</td><td><Tx text={row.status} /></td><td>{row.start || "—"}</td><td>{row.end || "—"}</td><td><Tx text={row.verification} /></td><td><Link href={`/employees/${row.id.split(":")[0]}`}><Tx text="Open detail" /></Link></td></tr>)}</tbody></table>}
    </div>
  );
}

function Changes({ rows, regulatory, compare, canCheck }: { rows: BpjsChange[]; regulatory: Regulatory; compare: Compare; canCheck: boolean }) {
  const t = useT();
  const [program, setProgram] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState("");
  const filtered = rows.filter((row) => {
    if (program && row.program !== program) return false;
    if (kind && row.kind !== kind) return false;
    if (status && row.status !== status) return false;
    const day = row.when.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
  const selected = rows.find((row) => row.id === open) ?? null;
  const programs = [...new Set(rows.map((row) => row.program))];
  return (
    <div className="card stack-form">
      <p className="section-label"><Tx text="Component and rule changes" /></p>
      <p className="hint"><Tx text="A change records the program, the previous and proposed values, the reason, the legal reference, the effective date, and the verification status." /></p>
      <RegulatoryStatus regulatory={regulatory} canCheck={canCheck} />
      <form className="toolbar" method="get" action="/tax/bpjs">
        <input type="hidden" name="view" value="changes" />
        <label className="field"><Tx text="Compare versions" /><select name="compareFrom" defaultValue={compare.from}><option value=""></option>{compare.rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.code}</option>)}</select></label>
        <label className="field"><Tx text="New value" /><select name="compareTo" defaultValue={compare.to}><option value=""></option>{compare.rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.code}</option>)}</select></label>
        <button className="btn secondary"><Tx text="Compare versions" /></button>
      </form>
      {compare.diff ? <div className="table-wrap">{compare.diff.length === 0 ? <p><Tx text="No parameter differs." /></p> : <table><thead><tr><th><Tx text="Parameter" /></th><th><Tx text="Previous value" /></th><th><Tx text="New value" /></th></tr></thead><tbody>{compare.diff.map((row) => <tr key={row.field}><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table>}</div> : null}
      <div className="toolbar">
        <label className="field"><Tx text="BPJS program" /><select value={program} onChange={(event) => setProgram(event.target.value)}><option value="">{t("All")}</option>{programs.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <label className="field"><Tx text="Parameter kind" /><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">{t("All")}</option><option value="Company parameter">{t("Company parameter")}</option><option value="Regulation">{t("Regulation")}</option></select></label>
        <label className="field"><Tx text="Regulatory verification" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("All")}</option><option value="APPROVED">{t("Approved for calculation")}</option><option value="SAMPLE">{t("Sample, not verified for official use")}</option><option value="COMPANY">{t("Saved company parameter")}</option></select></label>
        <label className="field"><Tx text="Change date from" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="field"><Tx text="Change date to" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Program code" /></th><th><Tx text="Program name" /></th><th><Tx text="Parameter" /></th><th><Tx text="Existing value" /></th><th><Tx text="Proposed value" /></th><th><Tx text="Legal reference" /></th><th><Tx text="Effective from" /></th><th><Tx text="Change reason" /></th><th><Tx text="Regulatory verification" /></th><th><Tx text="Change date" /></th><th><Tx text="Changed by" /></th><th><Tx text="Action" /></th></tr></thead><tbody>
        {filtered.length === 0 ? <tr><td colSpan={12}><p className="empty"><Tx text="No change history yet" /></p><p>{rows.length === 0 ? <Tx text="No BPJS parameter or rule change is recorded." /> : <Tx text="No rows match the selected criteria." />}</p></td></tr> : filtered.map((row) => <tr key={row.id}><td>{row.code}</td><td><Tx text={row.programName} /></td><td><Tx text={row.field} /></td><td>{phrase(row.before)}</td><td>{phrase(row.after)}</td><td>{row.source || "—"}</td><td>{row.effectiveFrom || "—"}</td><td>{row.reason || "—"}</td><td><Tx text={statusText(row.status)} /></td><td>{row.when}</td><td>{row.user || "—"}</td><td><button type="button" className="text-action" onClick={() => setOpen(row.id)}><Tx text="Open detail" /></button></td></tr>)}
      </tbody></table></div>
      {selected ? <ChangeDetail row={selected} onClose={() => setOpen("")} /> : null}
    </div>
  );
}

function statusText(status: string) {
  if (status === "APPROVED") return "Approved for calculation";
  if (status === "COMPANY") return "Saved company parameter";
  if (status === "PENDING_REVIEW") return "Waiting for review";
  return "Sample, not verified for official use";
}

function ChangeDetail({ row, onClose }: { row: BpjsChange; onClose: () => void }) {
  return (
    <div className="card stack-form">
      <p className="section-label"><Tx text="Open detail" /></p>
      <dl className="facts">
        <div><dt><Tx text="Program code" /></dt><dd>{row.program}</dd></div>
        <div><dt><Tx text="Program name" /></dt><dd><Tx text={row.programName} /></dd></div>
        <div><dt><Tx text="Parameter kind" /></dt><dd><Tx text={row.kind} /></dd></div>
        <div><dt><Tx text="Parameter" /></dt><dd><Tx text={row.field} /></dd></div>
        <div><dt><Tx text="Existing value" /></dt><dd>{phrase(row.before)}</dd></div>
        <div><dt><Tx text="Proposed value" /></dt><dd>{phrase(row.after)}</dd></div>
        <div><dt><Tx text="Legal reference" /></dt><dd>{row.source || "—"}</dd></div>
        <div><dt><Tx text="Effective from" /></dt><dd>{row.effectiveFrom || "—"}</dd></div>
        <div><dt><Tx text="Change reason" /></dt><dd>{row.reason || "—"}</dd></div>
        <div><dt><Tx text="Regulatory verification" /></dt><dd><Tx text={statusText(row.status)} /></dd></div>
        <div><dt><Tx text="Changed by" /></dt><dd>{row.user || "—"}</dd></div>
        <div><dt><Tx text="Change date" /></dt><dd>{row.when}</dd></div>
      </dl>
      <button type="button" className="btn secondary" onClick={onClose}><Tx text="Close" /></button>
    </div>
  );
}

function RegulatoryStatus({ regulatory, canCheck }: { regulatory: Regulatory; canCheck: boolean }) {
  return (
    <div>
      <p className="section-label"><Tx text="Regulatory update status" /></p>
      <p><Tx text="Automatic update is off." /></p>
      <p><Tx text="Last check" />: {regulatory.checkedAt || <Tx text="Not checked yet" />}</p>
      {regulatory.result ? <p><Tx text={regulatory.result} /></p> : null}
      <p><Tx text="Waiting for review" />: {regulatory.pending}</p>
      {canCheck ? <form action={checkRegulatoryAction}><input type="hidden" name="return" value="bpjs" /><button className="btn secondary"><Tx text="Check for updates" /></button></form> : null}
    </div>
  );
}
