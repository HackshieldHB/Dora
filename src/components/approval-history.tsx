import { TInput } from "@/components/locale";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { translate } from "@/lib/i18n";
import { statusLabel } from "@/lib/status";
import { approvalModules, inApprovalScope } from "@/lib/approval-scope";
import { employeeWhere } from "@/server/scope";
import { PageTitle, Status } from "@/components/ui";

function whenLabel(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function decisionText(decision: string) {
  if (decision === "APPROVED") return "Approved";
  if (decision === "REJECTED") return "Rejected";
  if (decision === "RETURNED") return "Returned for Revision";
  return "";
}

type Subject = { employeeId: string; requester: string; request: string };

export async function ApprovalHistory({ ctx, companyId, query, banner }: { ctx: Ctx; companyId: string; query: Record<string, string | undefined>; banner: React.ReactNode }) {
  const t = (value: string) => translate(ctx.locale, value);
  const modules = approvalModules(ctx.permissions);
  const modulePick = query.module && modules.includes(query.module) ? query.module : "";
  const decisionPick = query.decision === "APPROVED" || query.decision === "REJECTED" || query.decision === "RETURNED" ? query.decision : "";
  const from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : "";
  const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : "";
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00+07:00`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999+07:00`);
  const decisions = companyId ? await prisma.approvalDecision.findMany({
    where: {
      ...(decisionPick ? { decision: decisionPick } : {}),
      ...(from || to ? { createdAt } : {}),
      task: { companyId, module: modulePick ? modulePick : { in: modules.length ? modules : ["__none__"] } },
    },
    include: { task: true },
    orderBy: { createdAt: "desc" },
    take: 400,
  }) : [];
  const ids = (module: string) => [...new Set(decisions.filter((row) => row.task.module === module).map((row) => row.task.subjectId))];
  const leaveIds = [...ids("LEAVE"), ...ids("LEAVE_CANCEL")];
  const actorIds = [...new Set(decisions.flatMap((row) => [row.actorId, row.task.requesterId].filter(Boolean)))];
  const [leaves, overtime, profiles, attendance, loans, claims, swaps, sheets, periods, people, actors] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { id: { in: leaveIds } }, include: { employee: true, leaveType: true } }),
    prisma.overtimeRequest.findMany({ where: { id: { in: ids("OVERTIME") } }, include: { employee: true } }),
    prisma.profileChange.findMany({ where: { id: { in: ids("PROFILE") } }, include: { employee: true } }),
    prisma.attendanceRequest.findMany({ where: { id: { in: ids("ATTENDANCE") } }, include: { employee: true } }),
    prisma.employeeLoan.findMany({ where: { id: { in: ids("LOAN") } }, include: { employee: true } }),
    prisma.reimbursement.findMany({ where: { id: { in: ids("REIMBURSEMENT") } }, include: { employee: true } }),
    prisma.shiftSwap.findMany({ where: { id: { in: ids("SHIFT") } }, include: { requester: true } }),
    prisma.timesheet.findMany({ where: { id: { in: ids("TIMESHEET") } }, include: { employee: true } }),
    prisma.payrollPeriod.findMany({ where: { id: { in: ids("PAYROLL") } } }),
    ctx.dataScope === "COMPANY" ? Promise.resolve([]) : prisma.employee.findMany({ where: employeeWhere(ctx), select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: actorIds } }, include: { employee: true } }),
  ]);
  const subject = new Map<string, Subject>();
  const put = (module: string, id: string, value: Subject) => subject.set(`${module}:${id}`, value);
  for (const row of leaves) {
    const value = { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t(row.leaveType.name)} – ${row.employee.fullName}` };
    put("LEAVE", row.id, value);
    put("LEAVE_CANCEL", row.id, { ...value, request: `${t("Leave cancellation")} – ${row.employee.fullName}` });
  }
  for (const row of overtime) put("OVERTIME", row.id, { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t("Overtime")} – ${row.employee.fullName}` });
  for (const row of profiles) put("PROFILE", row.id, { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t("Profile change")} – ${row.employee.fullName}` });
  for (const row of attendance) put("ATTENDANCE", row.id, { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t(statusLabel(row.kind))} – ${row.employee.fullName}` });
  for (const row of loans) put("LOAN", row.id, { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t("Loan")} – ${row.employee.fullName}` });
  for (const row of claims) put("REIMBURSEMENT", row.id, { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t("Reimbursement")} – ${row.employee.fullName}` });
  for (const row of swaps) put("SHIFT", row.id, { employeeId: row.requesterId, requester: row.requester.fullName, request: `${t("Shift swap")} – ${row.requester.fullName}` });
  for (const row of sheets) put("TIMESHEET", row.id, { employeeId: row.employeeId, requester: row.employee.fullName, request: `${t("Timesheet")} – ${row.employee.fullName}` });
  for (const row of periods) put("PAYROLL", row.id, { employeeId: "", requester: "", request: `${t("Payroll period")} – ${row.name}` });
  const names = new Map(actors.map((user) => [user.id, user.employee?.fullName || user.email]));
  const scopeIds = ctx.dataScope === "COMPANY" ? null : new Set(people.map((person) => person.id));
  const visible = decisions.filter((row) => {
    const info = subject.get(`${row.task.module}:${row.task.subjectId}`);
    return inApprovalScope({
      dataScope: ctx.dataScope,
      userId: ctx.userId,
      actorId: row.actorId,
      assigneeId: row.task.assigneeId,
      originalAssigneeId: row.task.originalAssigneeId,
      requesterId: row.task.requesterId,
      module: row.task.module,
      employeeId: info?.employeeId || "",
      scopeIds,
    });
  });
  const filtered = Boolean(modulePick || decisionPick || from || to);
  return (
    <div>
      <PageTitle title="Approval History" subtitle="Every saved approval decision stays here, including an earlier return and a later approval of the same request." />
      {banner}
      <form className="toolbar" action="/approvals/history">
        <label className="field">{t("Module")}
          <select name="module" defaultValue={modulePick}>
            <option value="">{t("All modules")}</option>
            {modules.map((module) => <option key={module} value={module}>{t(statusLabel(module))}</option>)}
          </select>
        </label>
        <label className="field">{t("Decision")}
          <select name="decision" defaultValue={decisionPick}>
            <option value="">{t("All decisions")}</option>
            <option value="APPROVED">{t("Approved")}</option>
            <option value="REJECTED">{t("Rejected")}</option>
            <option value="RETURNED">{t("Returned for Revision")}</option>
          </select>
        </label>
        <label className="field">{t("From")}<TInput name="from" type="date" defaultValue={from} /></label>
        <label className="field">{t("To")}<TInput name="to" type="date" defaultValue={to} /></label>
        <div className="toolbar-actions"><button className="btn" type="submit">{t("Apply")}</button></div>
      </form>
      <div className="card table-wrap">
        {visible.length === 0 ? <p className="empty">{t(filtered ? "No results found" : "No decisions yet.")}</p> : (
          <table>
            <thead>
              <tr>
                <th>{t("When")}</th>
                <th>{t("Module")}</th>
                <th>{t("Request")}</th>
                <th>{t("Requester")}</th>
                <th>{t("Approver")}</th>
                <th>{t("Decision")}</th>
                <th>{t("Note")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const info = subject.get(`${row.task.module}:${row.task.subjectId}`);
                const label = decisionText(row.decision);
                return (
                  <tr key={row.id}>
                    <td>{whenLabel(row.createdAt)}</td>
                    <td><Status value={row.task.module} /></td>
                    <td>{info?.request || t(row.task.title)}<div className="hint">{row.task.subjectId}</div></td>
                    <td>{info?.requester || names.get(row.task.requesterId) || "—"}</td>
                    <td>{names.get(row.actorId) || "—"}</td>
                    <td>{label ? <Status value={row.decision} label={label} /> : <Status value="" />}</td>
                    <td>{row.note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
