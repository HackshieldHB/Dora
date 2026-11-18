import { Tx, TInput } from "@/components/locale";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { carryIn, leaveRemaining, policyEntitled } from "@/lib/domain";
import { monthBounds, todayJakarta } from "@/lib/format";
import { ensureLeaveCatalog } from "@/server/leave-catalog";
import Link from "next/link";
import { cancelLeaveAction, leaveAction } from "@/app/actions";
import { statusLabel } from "@/lib/status";
import { Banner, PageTitle, Status } from "@/components/ui";
import { LeaveInfo } from "@/components/leave-info";
import { LeaveRequestForm } from "@/components/leave-request-form";
import { translate } from "@/lib/i18n";

export default async function MyLeavePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; month?: string }> }) {
  const ctx = await requirePerm("leave.self");
  const params = await searchParams;
  if (!ctx.companyId || !ctx.employeeId) return <div className="card"><Tx text={"No employee record."} /></div>;
  await ensureLeaveCatalog(prisma, ctx.companyId);
  const bounds = params.month ? monthBounds(params.month) : null;
  const types = await prisma.leaveType.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } });
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: ctx.employeeId,
      ...(bounds ? { createdAt: { gte: new Date(`${bounds.start}T00:00:00+07:00`), lte: new Date(`${bounds.end}T23:59:59.999+07:00`) } } : {}),
    },
    include: { leaveType: true },
    orderBy: { createdAt: "desc" },
  });
  const balances = await prisma.leaveBalance.findMany({ where: { employeeId: ctx.employeeId }, include: { leaveType: true } });
  const today = todayJakarta();
  const year = Number(today.slice(0, 4));
  const month = today.slice(0, 7);
  const openLeave = await prisma.leaveRequest.findMany({
    where: { employeeId: ctx.employeeId, status: { in: ["PENDING", "APPROVED", "CANCEL_PENDING"] }, startDate: { gte: `${year}-01-01` } },
    select: { leaveTypeId: true, startDate: true, days: true, status: true },
  });
  const mates = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, departmentId: ctx.departmentId || "__none__", id: { not: ctx.employeeId }, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const text = (value: string) => translate(ctx.locale, value);
  return (
    <div>
      <PageTitle title={text("My Leave & Permission")} subtitle={text("Submit leave or permission under company policy. The request goes to your direct supervisor.")} />
      <Banner ok={params.ok} error={params.error} />
      <LeaveInfo
        title={text("Leave and permission types")}
        hint={text("See the leave types, rules, and the information that applies.")}
        types={types.map((type) => ({ id: type.id, name: text(type.name), quota: leaveQuota(type, ctx.locale), note: type.legalNote ? text(type.legalNote) : "" }))}
      />
      <div className="split">
        <LeaveRequestForm
          action={leaveAction}
          types={types.map((type) => ({ id: type.id, name: text(type.name), allowHalfDay: type.allowHalfDay }))}
          mates={mates}
          labels={{
            newRequest: text("New request"),
            type: text("Type"),
            start: text("Start"),
            end: text("End"),
            half: text("Half day, only when the policy allows it and the request is one day"),
            halfUnavailable: text("Half day is not available for this leave type."),
            halfStart: text("Half Day Starts From"),
            halfEnd: text("Ends At"),
            reason: text("Reason"),
            attachment: text("Attachment (optional)"),
            coverQuestion: text("Someone covering for you?"),
            coverYes: text("With a substitute"),
            coverNo: text("No substitute"),
            teammate: text("Teammate"),
            noMate: text("There is no teammate in your division to choose."),
            submit: text("Submit request"),
          }}
        />
        <div className="card">
          <strong>{text("Balance")}</strong>
          {types.map((type) => {
            if (type.balanceMode === "NONE") return null;
            const balance = balances.find((row) => row.leaveTypeId === type.id && row.year === year);
            const previous = balances.find((row) => row.leaveTypeId === type.id && row.year === year - 1);
            const entitled = policyEntitled({ mode: type.balanceMode, quotaDays: type.quotaDays, quotaPeriod: type.quotaPeriod, accrualRate: type.accrualRate, asOf: today });
            const rows = openLeave.filter((row) => row.leaveTypeId === type.id);
            const used = type.quotaPeriod === "MONTHLY"
              ? rows.filter((row) => row.startDate.startsWith(month)).reduce((sum, row) => sum + row.days, 0)
              : balance?.used ?? 0;
            const remaining = leaveRemaining({
              mode: type.balanceMode,
              entitled,
              used,
              carryIn: type.quotaPeriod === "MONTHLY" ? 0 : carryIn(previous ?? null, type.carryForwardDays),
              expiryMonth: type.expiryMonth,
              expiryDate: type.expiryDate,
              asOf: today,
            });
            const width = entitled > 0 ? Math.max(0, Math.min(100, (remaining / entitled) * 100)) : 0;
            const pending = type.quotaPeriod === "MONTHLY" ? 0 : rows.filter((row) => row.status === "PENDING").reduce((sum, row) => sum + row.days, 0);
            const forecast = Math.max(0, remaining - pending);
            return (
              <div className="meter" key={type.id}>
                <div className="meter-top"><span>{text(type.name)}</span><strong>{remaining} {text("left")}</strong></div>
                <div className="meter-track"><div className="meter-fill" style={{ width: `${width}%` }} /></div>
                {pending > 0 ? <p className="hint">{ctx.locale === "id" ? `Jika ${pending} hari yang masih menunggu disetujui, sisa ${forecast} sampai akhir ${year}.` : `If the ${pending} day${pending === 1 ? "" : "s"} still waiting are approved, ${forecast} remain until the end of ${year}.`}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
      {params.month ? <p className="hint" style={{ marginTop: 12 }}>{ctx.locale === "id" ? `Menampilkan pengajuan yang dikirim pada ${params.month}.` : `Showing requests submitted in ${params.month}.`}</p> : null}
      <div className="card table-wrap" style={{ marginTop: 12 }}>
        <table><thead><tr><th>{text("Type")}</th><th>{text("Dates")}</th><th>{text("Days")}</th><th>{text("Status")}</th><th></th></tr></thead><tbody>
          {requests.map((request) => <tr key={request.id} className={request.status === "RETURNED" ? "row-link" : ""}><td>{request.status === "RETURNED" ? <Link href={`/me/leave/${request.id}`}>{text(request.leaveType.name)}</Link> : text(request.leaveType.name)}</td><td>{request.status === "RETURNED" ? <Link href={`/me/leave/${request.id}`}>{request.startDate} – {request.endDate}{request.halfDay ? ` · ${text("Half day")} ${request.halfStart}–${request.halfEnd}` : ""}</Link> : `${request.startDate} – ${request.endDate}${request.halfDay ? ` · ${text("Half day")} ${request.halfStart}–${request.halfEnd}` : ""}`}</td><td>{request.status === "RETURNED" ? <Link href={`/me/leave/${request.id}`}>{request.days}</Link> : request.days}</td><td>{request.status === "RETURNED" ? <Link href={`/me/leave/${request.id}`}><Status value={request.status} label={text(statusLabel(request.status))} /></Link> : <Status value={request.status} label={text(statusLabel(request.status))} />}</td><td>
            {request.status === "APPROVED" ? <form action={cancelLeaveAction}><TInput type="hidden" name="id" value={request.id} /><button className="btn secondary" type="submit">{text("Cancel")}</button></form> : null}
          </td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}

function leaveQuota(type: { balanceMode: string; quotaDays: number; quotaPeriod: string; maxCalendarDays: number }, locale: string) {
  if (type.balanceMode === "NONE") {
    if (type.maxCalendarDays) return locale === "id" ? `Maks. ${type.maxCalendarDays} hari kalender` : `Up to ${type.maxCalendarDays} calendar days`;
    if (type.quotaDays > 0) return locale === "id" ? `Maks. ${type.quotaDays} hari kerja per kejadian` : `Up to ${type.quotaDays} working days each time`;
    return locale === "id" ? "Tanpa kuota tetap, sesuai kebijakan" : "No fixed quota";
  }
  if (type.quotaPeriod === "MONTHLY") return locale === "id" ? `${type.quotaDays} hari per bulan` : `${type.quotaDays} days each month`;
  return locale === "id" ? `${type.quotaDays} hari kerja per tahun` : `${type.quotaDays} working days a year`;
}
