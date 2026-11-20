import Link from "next/link";
import { Tx } from "@/components/locale";
import { formatIdr } from "@/lib/format";
import type { RuleDefinition } from "@/lib/domain";

type HistoryRow = { id: string; code: string; name: string; effectiveFrom: string; approvalStatus: string; source: string };

const JKK_LABELS = ["Very low", "Low", "Medium", "High", "Very high"];

function percent(rate: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rate * 100)}%`;
}

function moneyExample(base: number, rate: number, cap: number) {
  const used = cap > 0 ? Math.min(base, cap) : base;
  return Math.round(used * rate);
}

function tabLink(base: string, program: string, tab: string, label: string, active: boolean) {
  const href = `${base}?program=${program}&tab=${tab}`;
  return <Link className={active ? "btn" : "btn secondary"} href={href}><Tx text={label} /></Link>;
}

function verification(approved: boolean) {
  return approved ? "Approved for calculation" : "Sample, not verified for official use";
}

export function StatutoryPanels({
  base,
  family,
  program,
  tab,
  approved,
  ruleCode,
  ruleName,
  effectiveFrom,
  source,
  definition,
  jkkClass,
  history,
}: {
  base: string;
  family: "pph" | "health" | "tk";
  program: string;
  tab: string;
  approved: boolean;
  ruleCode: string;
  ruleName: string;
  effectiveFrom: string;
  source: string;
  definition: RuleDefinition | null;
  jkkClass: number;
  history: HistoryRow[];
}) {
  const programs = family === "pph"
    ? [{ id: "pph21", label: "PPh 21" }]
    : family === "health"
      ? [{ id: "jkn", label: "Jaminan Kesehatan (JKN)" }]
      : [
          { id: "jht", label: "Jaminan Hari Tua (JHT)" },
          { id: "jkk", label: "Jaminan Kecelakaan Kerja (JKK)" },
          { id: "jkm", label: "Jaminan Kematian (JKM)" },
          { id: "jp", label: "Jaminan Pensiun (JP)" },
          { id: "jkp", label: "Jaminan Kehilangan Pekerjaan (JKP)" },
        ];
  const selected = programs.some((item) => item.id === program) ? program : programs[0].id;
  const selectedTab = tab || "info";
  const pphTabs = [
    ["info", "Information and rules"],
    ["ptkp", "PTKP parameters"],
    ["method", "Rates and method"],
    ["calc", "Calculation"],
    ["history", "Change history"],
  ];
  const bpjsTabs = [
    ["info", "Information and rules"],
    ["calc", "Calculation"],
    ["status", "Active regulation status"],
  ];
  const tabs = family === "pph" ? pphTabs : bpjsTabs;
  const activeTab = tabs.some((item) => item[0] === selectedTab) ? selectedTab : "info";
  const exampleBase = 10_000_000;
  const bpjs = definition?.bpjs;
  const classIndex = Math.min(Math.max(jkkClass, 1), bpjs?.jkkByClass.length || 1) - 1;
  return (
    <div className="card stack-form">
      <p className="section-label"><Tx text={family === "pph" ? "PPh 21 component detail" : "BPJS component detail"} /></p>
      <p className="hint"><Tx text={verification(approved)} />{ruleCode ? ` · ${ruleCode}` : ""}{ruleName ? ` · ${ruleName}` : ""}{effectiveFrom ? ` · ${effectiveFrom}` : ""}</p>
      {!approved ? <p className="hint"><Tx text="Stored parameters are not an approved official tariff." /></p> : null}
      {family !== "pph" ? <div className="form-actions">{programs.map((item) => <Link key={item.id} className={item.id === selected ? "btn" : "btn secondary"} href={`${base}?program=${item.id}&tab=${activeTab}`}><Tx text={item.label} /></Link>)}</div> : null}
      <div className="form-actions">{tabs.map((item) => tabLink(base, selected, item[0], item[1], item[0] === activeTab))}</div>
      {!definition ? <p><Tx text="No validated statutory rule is effective for this period." /></p> : null}
      {definition && activeTab === "info" ? <Info family={family} program={selected} source={source} /> : null}
      {definition && activeTab === "ptkp" ? <Ptkp definition={definition} /> : null}
      {definition && activeTab === "method" ? <Method definition={definition} /> : null}
      {definition && bpjs && activeTab === "calc" ? <Calc program={selected} bpjs={bpjs} exampleBase={exampleBase} classIndex={classIndex} jkkClass={jkkClass} brackets={definition.progressiveAnnual} /> : null}
      {definition && (activeTab === "status" || activeTab === "history") ? <Status history={history} approved={approved} effectiveFrom={effectiveFrom} source={source} /> : null}
    </div>
  );
}

function Info({ family, program, source }: { family: "pph" | "health" | "tk"; program: string; source: string }) {
  const text = program === "jkn"
    ? "JKN is separate from BPJS Ketenagakerjaan. The stored employee and employer rates are shown only as stored parameters."
    : program === "jht"
      ? "JHT reference recorded with this rule: PP 46/2015 article 16. Employee 2% and employer 3.7% are the stored rates, not a newly approved tariff."
      : program === "jkk"
        ? "JKK is paid by the employer. The rate follows the company risk class stored for this company."
        : program === "jkm"
          ? "JKM is paid by the employer. It is not an employee deduction."
          : program === "jp"
            ? "JP uses basic salary plus fixed allowances, then the stored wage cap for the period. The Rp7,000,000 figure in PP 45/2015 is the 2015 starting cap, not a permanent cap."
            : program === "jkp"
              ? "JKP is recognized as its own program. No verified rate is stored, so it is not deducted from net pay."
              : "PPh 21 for a permanent employee distinguishes a non-final tax month from the last tax month. The monthly TER table is not stored in the active rule.";
  return (
    <div>
      <p className="section-label"><Tx text="Information and rules" /></p>
      <p><Tx text={text} /></p>
      {family === "pph" ? <p className="hint">UU HPP · PP 58/2023 · PMK 168/2023</p> : null}
      <p className="hint"><Tx text="Source" />: {source || <Tx text="No source recorded" />}</p>
    </div>
  );
}

function Ptkp({ definition }: { definition: RuleDefinition }) {
  const rows = Object.entries(definition.ptkpAnnual);
  return (
    <div>
      <p className="section-label"><Tx text="PTKP parameters" /></p>
      <p className="hint"><Tx text="PTKP status is not a TER category. These are the stored annual amounts." /></p>
      <div className="table-wrap"><table><thead><tr><th><Tx text="PTKP" /></th><th className="num"><Tx text="Annual amount" /></th></tr></thead><tbody>{rows.map(([status, amount]) => <tr key={status}><td>{status}</td><td className="num">{formatIdr(amount)}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function Method({ definition }: { definition: RuleDefinition }) {
  return (
    <div>
      <p className="section-label"><Tx text="Rates and method" /></p>
      <p><Tx text="The monthly TER table is not stored. Payroll still uses the stored annual progressive brackets divided by 12. That is not the TER method and is not an official filing figure." /></p>
      <p className="hint"><Tx text="Last tax month reconciliation is not calculated, because prior monthly TER withholding is not stored." /></p>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Stored annual bracket" /></th><th className="num"><Tx text="Rate" /></th></tr></thead><tbody>{definition.progressiveAnnual.map((row, index) => <tr key={index}><td>{row.upTo == null ? <Tx text="Above the previous bracket" /> : formatIdr(row.upTo)}</td><td className="num">{percent(row.rate)}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function Calc({ program, bpjs, exampleBase, classIndex, jkkClass, brackets }: { program: string; bpjs: RuleDefinition["bpjs"]; exampleBase: number; classIndex: number; jkkClass: number; brackets: RuleDefinition["progressiveAnnual"] }) {
  if (program === "jkp") {
    return <p><Tx text="JKP is recognized as its own program. No verified rate is stored, so it is not deducted from net pay." /></p>;
  }
  if (program === "pph21") {
    return (
      <div>
        <p className="section-label"><Tx text="Calculation" /></p>
        <p><Tx text="Current payroll method: annual progressive tax on twelve times the monthly taxable amount, minus stored PTKP, then divided by 12." /></p>
        <p className="hint">{brackets.length} <Tx text="stored annual brackets. They do not replace a monthly TER table." /></p>
      </div>
    );
  }
  const employeeRate = program === "jkn" ? bpjs.kesEmployee : program === "jht" ? bpjs.jhtEmployee : program === "jp" ? bpjs.jpEmployee : 0;
  const employerRate = program === "jkn" ? bpjs.kesEmployer : program === "jht" ? bpjs.jhtEmployer : program === "jp" ? bpjs.jpEmployer : program === "jkm" ? bpjs.jkmEmployer : bpjs.jkkByClass[classIndex] || 0;
  const cap = program === "jkn" ? bpjs.kesCap : program === "jp" ? bpjs.jpCap : 0;
  const employee = moneyExample(exampleBase, employeeRate, cap);
  const employer = moneyExample(exampleBase, employerRate, cap);
  return (
    <div>
      <p className="section-label"><Tx text="Calculation" /></p>
      <p className="hint"><Tx text="Stored rate" /> · <Tx text="Employee share" /> {percent(employeeRate)} · <Tx text="Employer share" /> {percent(employerRate)}{cap > 0 ? <> · <Tx text="Wage cap" /> {formatIdr(cap)}</> : <> · <Tx text="No wage cap is stored for this program." /></>}{program === "jkk" ? <> · <Tx text="Risk class" /> {jkkClass} {JKK_LABELS[classIndex] ? <Tx text={JKK_LABELS[classIndex]} /> : null}</> : null}</p>
      <p><Tx text="Employer contribution is not a deduction." /></p>
      <p className="section-label"><Tx text="Illustration for a Rp10,000,000 wage base" /></p>
      <p className="record"><span><Tx text="Employee share" /></span><strong>{formatIdr(employee)}</strong></p>
      <p className="record"><span><Tx text="Employer share" /></span><strong>{formatIdr(employer)}</strong></p>
      <p className="hint"><Tx text="Illustration only. This is not an official payroll result." /></p>
    </div>
  );
}

function Status({ history, approved, effectiveFrom, source }: { history: HistoryRow[]; approved: boolean; effectiveFrom: string; source: string }) {
  return (
    <div>
      <p className="section-label"><Tx text="Active regulation status" /></p>
      <p><Tx text={verification(approved)} /> · <Tx text="Effective from" /> {effectiveFrom || "—"} · <Tx text="Source" /> {source || <Tx text="No source recorded" />}</p>
      <p className="hint"><Tx text="An active component does not mean its calculation has been legally verified." /></p>
      <div className="table-wrap"><table><thead><tr><th><Tx text="Code" /></th><th><Tx text="Effective from" /></th><th><Tx text="Regulatory verification" /></th></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.effectiveFrom}</td><td><Tx text={verification(row.approvalStatus === "APPROVED")} /></td></tr>)}</tbody></table></div>
    </div>
  );
}
