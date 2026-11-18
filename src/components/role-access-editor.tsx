"use client";

import Link from "next/link";
import { roleAccessAction } from "@/app/actions";
import { Tx } from "@/components/locale";
import { PermissionGrid } from "@/components/permission-grid";

export function RoleAccessEditor({ userId, userName, roleId, roleName, dataScope, scopeRefId, permissions, confirmText }: { userId: string; userName: string; roleId: string; roleName: string; dataScope: string; scopeRefId: string; permissions: string[]; confirmText: string }) {
  return (
    <form action={roleAccessAction} className="card stack-form" onSubmit={(event) => { if (!window.confirm(confirmText)) event.preventDefault(); }}>
      <p><Tx text="User name" />: {userName || "—"}</p>
      <p><Tx text="Current role" />: {roleName}</p>
      <p><Tx text="Mode" />: <Tx text="Edit role access" /></p>
      <input type="hidden" name="id" value={roleId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="name" value={roleName} />
      <input type="hidden" name="dataScope" value={dataScope} />
      <input type="hidden" name="scopeRefId" value={scopeRefId} />
      <PermissionGrid selected={permissions} />
      <div className="form-actions">
        <button className="btn" type="submit"><Tx text="Save changes" /></button>
        <Link className="btn secondary" href={userId ? `/settings/users/${userId}` : "/settings/permissions"}><Tx text="Cancel" /></Link>
      </div>
    </form>
  );
}
