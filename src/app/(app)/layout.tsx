import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/context";
import { visibleNav } from "@/lib/permissions";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
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
      {children}
    </Shell>
  );
}
