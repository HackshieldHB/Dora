import { Tx, TInput } from "@/components/locale";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/context";
import { openNotificationAction, readAllNotificationsAction, readNotificationAction } from "@/app/actions";
import { Banner, PageTitle, Status } from "@/components/ui";
import { translate } from "@/lib/i18n";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const rows = await prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  const emails = await prisma.emailLog.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" }, take: 10 });
  return (
    <div>
      <PageTitle title="Notifications" subtitle="In-app notices are listed here. Each request also writes an email log, and the email is sent when SMTP is configured.">
        <form action={readAllNotificationsAction}>
          <TInput type="hidden" name="return" value="/notifications" />
          <button className="btn secondary" type="submit"><Tx text={"Read all"} /></button>
        </form>
      </PageTitle>
      <Banner ok={params.ok} error={params.error} />
      <div className="grid">
        {rows.length === 0 ? <div className="card"><Tx text={"No notifications."} /></div> : rows.map((row) => (
          <div key={row.id} className={row.readAt ? "card note" : "card note unread"}>
            <strong>{translate(ctx.locale, row.title)}</strong>
            <p>{translate(ctx.locale, row.body)}</p>
            <div><span className={row.readAt ? "badge neutral" : "badge info"}>{translate(ctx.locale, row.readAt ? "Read" : "Unread")}</span> <span className="note-meta">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span></div>
            <div className="form-actions">
              {row.href ? <form action={openNotificationAction}><TInput type="hidden" name="id" value={row.id} /><button className="btn" type="submit"><Tx text={"Open request"} /></button></form> : null}
              {row.readAt ? null : <form action={readNotificationAction}><TInput type="hidden" name="id" value={row.id} /><button className="btn secondary" type="submit"><Tx text={"Mark read"} /></button></form>}
            </div>
          </div>
        ))}
        <div className="card">
          <strong><Tx text={"Email log"} /></strong>
          {emails.length === 0 ? <p className="empty"><Tx text={"No email has been recorded."} /></p> : <div className="record-list">{emails.map((email) => <p className="record" key={email.id}><span><Status value={email.status} /> {email.to}</span><span>{translate(ctx.locale, email.subject)}</span></p>)}</div>}
          <p className="hint"><Tx text={"Leave, overtime, profile, and payroll requests already create these rows. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to send them. Without SMTP_HOST the status stays Logged and the in-app notice is unchanged."} /></p>
        </div>
      </div>
    </div>
  );
}
