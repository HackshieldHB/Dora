import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPerm, requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { translate } from "@/lib/i18n";
import { Banner, PageTitle, Status } from "@/components/ui";
import { Tx } from "@/components/locale";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { UserAccessForm } from "@/components/user-access-form";

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("settings.users");
  const { id } = await params;
  const query = await searchParams;
  const user = await prisma.user.findFirst({ where: { id, companyId: ctx.companyId }, include: { role: true, employee: true } });
  if (!user) notFound();
  const roles = await prisma.role.findMany({ where: { companyId: ctx.companyId, OR: [{ active: true }, { id: user.roleId }] }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageTitle title="User detail" subtitle="One user has one role. The checkboxes follow that role and cannot be edited here." />
      <Banner ok={query.ok} error={query.error} />
      <div className="card" style={{ marginBottom: 12 }}>
        <p><strong>{user.email}</strong></p>
        <p><Tx text="Linked employee" />: {user.employee?.fullName || "—"}</p>
        <p><Tx text="Status" />: <Status value={user.status} /></p>
        <ResetPasswordButton userId={user.id} confirmText={translate(ctx.locale, "Reset this user's password? A temporary password is shown once.")} />
        <p style={{ marginTop: 12 }}><Link href="/settings/users"><Tx text="Back to users" /></Link></p>
      </div>
      <UserAccessForm
        userId={user.id}
        email={user.email}
        employeeId={user.employeeId || ""}
        status={user.status}
        roleId={user.roleId}
        dataScope={user.dataScope || user.role.dataScope}
        ownScope={Boolean(user.dataScope)}
        canManage={hasPerm(ctx, "settings.roles")}
        roles={roles.map((role) => {
          let permissions: string[] = [];
          try {
            const parsed = JSON.parse(role.permissions) as unknown;
            if (Array.isArray(parsed)) permissions = parsed.filter((item): item is string => typeof item === "string");
          } catch { permissions = []; }
          return { id: role.id, name: role.name, dataScope: role.dataScope, permissions, active: role.active };
        })}
      />
    </div>
  );
}
