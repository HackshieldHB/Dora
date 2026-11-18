import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/context";
import { visibleNav } from "@/lib/permissions";
import { Shell } from "@/components/shell";
import { LICENSE_ENFORCED, licenseStatus } from "@/lib/license";
import { translate } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const license = LICENSE_ENFORCED && (ctx.permissions.has("settings.platform") || ctx.permissions.has("settings.users")) ? await licenseStatus() : null;
  const expiring = license?.ok && license.daysLeft !== null && license.daysLeft <= 30 ? license : null;
  const unread = await prisma.notification.count({ where: { userId: ctx.userId, readAt: null } });
  const rows = await prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 6 });
  const photo = ctx.employeeId
    ? await prisma.employeeDocument.findFirst({ where: { employeeId: ctx.employeeId, name: "Profile photo" }, orderBy: { createdAt: "desc" } })
    : null;
  return (
    <Shell
      nav={visibleNav(ctx.permissions, Boolean(ctx.employeeId))}
      user={{ name: ctx.fullName, role: ctx.roleName, company: ctx.companyName, unread, locale: ctx.locale, photo: photo ? `/api/files/${photo.fileId}` : "" }}
      notices={rows.map((row) => ({ id: row.id, title: row.title, body: row.body, href: row.href, time: row.createdAt.toISOString().slice(0, 16).replace("T", " "), read: Boolean(row.readAt) }))}
    >
      {expiring ? (
        <p role="status" style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 12, border: "1px solid #fcd34d", background: "#fffbeb", color: "#92400e", fontSize: 14 }}>
          {translate(ctx.locale, `The DORA license expires on ${expiring.claims?.expiresOn} (${expiring.daysLeft} days left). Contact your vendor to renew it.`)}
        </p>
      ) : null}
      {children}
    </Shell>
  );
}
