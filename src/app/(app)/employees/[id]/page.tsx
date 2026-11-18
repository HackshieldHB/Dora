import { Tx, TTextarea, TInput } from "@/components/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/context";
import { activationGaps, canSeeSalary, getEmployee } from "@/server/people";
import { lookups } from "@/server/lookups";
import { activateAction, contractAction, documentAction, inviteAction, saveEmployeeAction, warningAction } from "@/app/actions";
import { translate } from "@/lib/i18n";
import { Avatar, Banner, Status } from "@/components/ui";
import { ChoiceButtons } from "@/components/choice-buttons";
import { EmployeeForm } from "@/components/employee-form";
import { formatIdr, currentMonth } from "@/lib/format";
import { prisma } from "@/lib/db";

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; tab?: string }> }) {
  const ctx = await requirePerm("employees.view");
  const { id } = await params;
  const query = await searchParams;
  let employee;
  try {
    employee = await getEmployee(ctx, id);
  } catch {
    notFound();
  }
  const tab = query.tab || "personal";
  const review = employee.status === "DRAFT" ? await activationGaps(ctx, id) : null;
  const data = await lookups(employee.companyId);
  const salary = canSeeSalary(ctx);
  const month = currentMonth();
  const lateThisMonth = await prisma.attendanceRecord.count({ where: { employeeId: id, status: "LATE", workDate: { gte: `${month}-01`, lte: `${month}-31` } } });
  const warnings = await prisma.warningLetter.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } });
  const canWarn = ctx.permissions.has("employees.manage") || employee.managerId === ctx.employeeId;
  const tabs = ["personal", "employment", "contract", "documents", "history", ...(salary ? ["salary"] : [])];
  const tabLabel: Record<string, string> = { personal: "Personal", employment: "Employment", contract: "Contract", documents: "Documents", history: "History", salary: "Salary" };
  return (
    <div>
      <div className="identity">
        <Avatar name={employee.fullName} large />
        <div>
          <h1>{employee.fullName}</h1>
          <p>{employee.employeeCode} · {employee.position?.name || "No position"} · {employee.department?.name || "No department"} · {data.roles.find((role) => role.id === (employee.user?.roleId || employee.accessRoleId))?.name || "Employee"}</p>
        </div>
        <Status value={employee.status} />
        <div className="page-actions">
          <Link className="btn secondary" href={`/employees/${id}/employment`}><Tx text={"Employment change"} /></Link>
          <Link className="btn secondary" href={`/employees/${id}/offboarding`}><Tx text={"Offboarding"} /></Link>
        </div>
      </div>
      <Banner ok={query.ok} error={query.error} />
      {review && ctx.permissions.has("employees.activate") ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong><Tx text={"Ready to activate?"} /></strong>
          {review.gaps.length ? <ul className="checklist">{review.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p className="ready"><Tx text={"Required fields are complete."} /></p>}
          {review.salaryWarning ? <p><Tx text={"Basic salary is required before the employee can be activated."} /></p> : null}
          <form action={activateAction}><TInput type="hidden" name="id" value={id} /><button className="btn" disabled={review.gaps.length > 0 || review.salaryWarning} type="submit"><Tx text={"Activate employee"} /></button></form>
        </div>
      ) : null}
      {review && !ctx.permissions.has("employees.activate") ? (
        <div className="card" style={{ marginBottom: 12 }}><p><Tx text={"Draft saved. HR will complete payroll details and activate the employee."} /></p></div>
      ) : null}
      {employee.status === "ACTIVE" && !employee.user && ctx.permissions.has("employees.activate") ? (
        <form action={inviteAction} className="card" style={{ marginBottom: 12 }}><TInput type="hidden" name="id" value={id} /><button className="btn" type="submit"><Tx text={"Send ESS invitation"} /></button></form>
      ) : null}
      <nav className="tabs">
        {tabs.map((item) => <Link key={item} className={item === tab ? "active" : ""} href={`/employees/${id}?tab=${item}`}>{tabLabel[item]}</Link>)}
      </nav>
      {tab === "personal" && ctx.permissions.has("employees.manage") ? <EmployeeForm action={saveEmployeeAction} data={data} showSalary={salary} employee={employee as unknown as Record<string, string | number | null>} /> : null}
      {tab === "personal" && !ctx.permissions.has("employees.manage") ? <div className="card"><dl className="facts"><div><dt><Tx text={"Email"} /></dt><dd>{employee.email || "—"}</dd></div><div><dt><Tx text={"Phone"} /></dt><dd>{employee.phone || "—"}</dd></div><div><dt><Tx text={"Address"} /></dt><dd>{employee.address || "—"}</dd></div></dl></div> : null}
      {tab === "employment" ? <div className="card"><dl className="facts"><div><dt><Tx text={"Department"} /></dt><dd>{employee.department?.name || "—"}</dd></div><div><dt><Tx text={"Position"} /></dt><dd>{employee.position?.name || "—"}</dd></div><div><dt><Tx text={"Branch"} /></dt><dd>{employee.branch?.name || "—"}</dd></div><div><dt><Tx text={"Work location"} /></dt><dd>{employee.location?.name || "—"}</dd></div><div><dt><Tx text={"Supervisor"} /></dt><dd>{employee.manager?.fullName || "—"}</dd></div><div><dt><Tx text={"Join date"} /></dt><dd>{employee.joinDate}</dd></div></dl></div> : null}
      {tab === "contract" ? (
        <div className="card">
          <dl className="facts"><div><dt><Tx text={"Type"} /></dt><dd><Status value={employee.employmentType} /></dd></div><div><dt><Tx text={"Contract end"} /></dt><dd>{employee.contractEnd || "—"}</dd></div><div><dt><Tx text={"Decision"} /></dt><dd>{employee.contractDecision === "END" ? "Will not be renewed" : employee.contractDecision === "RENEW" ? "Renewed" : "Not recorded"}</dd></div></dl>
          {ctx.permissions.has("employees.manage") && employee.contractEnd ? (
            <form action={contractAction} className="stack-form">
              <TInput type="hidden" name="id" value={id} />
              <p className="hint"><Tx text={"Renewing stores a later end date. Choosing not to renew keeps the current date. Salary does not change, and nothing happens by itself."} /></p>
              <label className="field"><Tx text={"New end date, only when renewing"} /><TInput name="contractEnd" type="date" defaultValue={employee.contractEnd} /></label>
              <ChoiceButtons className="form-actions" choices={[{ value: "RENEW", label: translate(ctx.locale, "Renew") }, { value: "END", label: translate(ctx.locale, "Do not renew"), secondary: true }]} />
            </form>
          ) : null}
        </div>
      ) : null}
      {tab === "salary" && salary ? <div className="card"><dl className="facts"><div><dt><Tx text={"Basic salary"} /></dt><dd>{formatIdr(employee.basicSalary)}</dd></div><div><dt><Tx text={"Bank"} /></dt><dd>{employee.bankName} {employee.bankAccount}</dd></div><div><dt><Tx text={"NIK"} /></dt><dd>{employee.nik || "—"}</dd></div><div><dt><Tx text={"NPWP"} /></dt><dd>{employee.npwp || "—"}</dd></div><div><dt><Tx text={"PTKP"} /></dt><dd>{employee.ptkp}</dd></div></dl></div> : null}
      {tab === "documents" ? (
        <div className="card">
          {employee.documents.length === 0 ? <p><Tx text={"No documents."} /></p> : employee.documents.map((doc) => <p key={doc.id}><a href={`/api/files/${doc.fileId}`}>{doc.name}</a>{doc.expiresOn ? ` · until ${doc.expiresOn}` : ""}</p>)}
          {ctx.permissions.has("employees.manage") ? <form action={documentAction}><TInput type="hidden" name="id" value={id} /><TInput name="file" type="file" required /><label className="field"><Tx text={"Valid until"} /><TInput name="expiresOn" type="date" /></label><button className="btn" type="submit"><Tx text={"Upload"} /></button></form> : null}
        </div>
      ) : null}
      {tab === "history" ? (
        <div className="card table-wrap">
          {employee.events.length === 0 ? <p><Tx text={"No employment history yet."} /></p> : (
            <table><thead><tr><th><Tx text={"Date"} /></th><th><Tx text={"Type"} /></th><th><Tx text={"Applied"} /></th><th><Tx text={"Detail"} /></th><th><Tx text={"Recorded"} /></th></tr></thead><tbody>
              {employee.events.map((event) => <tr key={event.id}><td>{event.effectiveDate}</td><td>{event.changeType}</td><td>{event.applied ? "Yes" : "Scheduled"}</td><td>{historyDetail(event.afterJson, event.changeType)}</td><td>{event.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td></tr>)}
            </tbody></table>
          )}
        </div>
      ) : null}
      <div className="card" style={{ marginTop: 14 }}>
        <p className="section-label"><Tx text={"Warning letters"} /></p>
        {warnings.length === 0 ? <p className="empty"><Tx text={"No warning letters."} /></p> : warnings.map((letter) => <p className="record" key={letter.id}><strong>{letter.level} · {letter.month}</strong><span>{letter.lateDays} late days · {letter.note}</span></p>)}
        <p className="hint">Late days in {month}: {lateThisMonth}. HR or the direct supervisor records the letter. DORA does not issue it.</p>
        {canWarn ? (
          <form action={warningAction} className="stack-form" style={{ marginTop: 10 }}>
            <TInput type="hidden" name="employeeId" value={id} />
            <label className="field"><Tx text={"Month"} /><TInput name="month" type="month" defaultValue={month} required /></label>
            <label className="field"><Tx text={"Note"} /><TTextarea name="note" required placeholder="What happened" /></label>
            <p className="hint"><Tx text={"A letter can be recorded only after 3 late days in that month, and only in order: SP1, then SP2, then SP3. Pay is not reduced."} /></p>
            <button className="btn" type="submit"><Tx text={"Record warning"} /></button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function historyDetail(afterJson: string, changeType: string) {
  if (changeType !== "OFFBOARDING") return afterJson;
  try {
    const after = JSON.parse(afterJson) as { exitType?: string; exitReason?: string; lastWorkingDay?: string; clearanceDone?: boolean; finalPayrollDone?: boolean; recordedBy?: string; status?: string };
    return `Exit ${after.exitType || "—"}. ${after.exitReason || "—"}. Last working day ${after.lastWorkingDay || "—"}. Clearance ${after.clearanceDone ? "done" : "not done"}. Final payroll ${after.finalPayrollDone ? "done" : "not done"}. Recorded by ${after.recordedBy || "—"}. Status ${after.status || "—"}.`;
  } catch {
    return afterJson;
  }
}
