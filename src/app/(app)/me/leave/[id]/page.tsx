import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { resubmitLeaveAction } from "@/app/actions";
import { Banner, PageTitle } from "@/components/ui";
import { LeaveRequestForm } from "@/components/leave-request-form";
import { translate } from "@/lib/i18n";

export default async function ReviseLeavePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("leave.self");
  const { id } = await params;
  const query = await searchParams;
  const text = (value: string) => translate(ctx.locale, value);
  if (!ctx.companyId || !ctx.employeeId) return <div className="card">{text("No employee record.")}</div>;
  const request = await prisma.leaveRequest.findFirst({
    where: { id, employeeId: ctx.employeeId },
    include: { leaveType: true },
  });
  if (!request) notFound();
  const types = await prisma.leaveType.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } });
  const mates = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, departmentId: ctx.departmentId || "__none__", id: { not: ctx.employeeId }, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const decisions = await prisma.approvalDecision.findMany({
    where: { task: { module: "LEAVE", subjectId: request.id } },
    orderBy: { createdAt: "desc" },
  });
  const decision = decisions.find((row) => row.decision === "RETURNED") || decisions[0] || null;
  const actor = decision ? await prisma.user.findUnique({ where: { id: decision.actorId }, select: { email: true, employee: { select: { fullName: true } } } }) : null;
  const revisionNote = request.decisionNote || (decision?.decision === "RETURNED" || decision?.decision === "" ? decision.note : "");
  const file = request.attachmentId ? await prisma.storedFile.findUnique({ where: { id: request.attachmentId }, select: { name: true } }) : null;
  const labels = {
    revise: text("Revise Leave & Permission Request"),
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
    currentAttachment: text("Current attachment"),
    coverQuestion: text("Someone covering for you?"),
    coverYes: text("With a substitute"),
    coverNo: text("No substitute"),
    teammate: text("Teammate"),
    noMate: text("There is no teammate in your division to choose."),
    submit: text("Submit again"),
    back: text("Back"),
  };
  return (
    <div>
      <PageTitle title={text("Revise Leave & Permission Request")} subtitle={`${text("Request ID")}: ${request.id}`} />
      <Banner ok={query.ok} error={query.error} />
      {request.status !== "RETURNED" ? (
        <div className="card">
          <p>{text("This request cannot be revised.")}</p>
          <Link href="/me/leave">{text("Back")}</Link>
        </div>
      ) : (
        <>
          <div className="card revise" style={{ marginBottom: 12 }}>
            <strong>{text("Returned for revision")}</strong>
            {actor ? <p>{text("Returned by")}: {actor.employee?.fullName || actor.email}</p> : null}
            {revisionNote ? <p>{text("Revision note")}: “{revisionNote}”</p> : null}
          </div>
          <LeaveRequestForm
            action={resubmitLeaveAction}
            types={types.map((type) => ({ id: type.id, name: text(type.name), allowHalfDay: type.allowHalfDay }))}
            mates={mates}
            labels={labels}
            draft={{
              id: request.id,
              leaveTypeId: request.leaveTypeId,
              startDate: request.startDate,
              endDate: request.endDate,
              halfDay: request.halfDay,
              halfStart: request.halfStart,
              halfEnd: request.halfEnd,
              reason: request.reason,
              coverId: request.coverId,
              attachmentName: file?.name,
              attachmentHref: file ? `/api/files/${request.attachmentId}` : undefined,
            }}
          />
        </>
      )}
    </div>
  );
}
