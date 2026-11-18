"use client";

import { useState } from "react";
import Link from "next/link";
import { userDetailAction } from "@/app/actions";
import { Tx } from "@/components/locale";
import { PermissionGrid } from "@/components/permission-grid";

type RoleOption = { id: string; name: string; dataScope: string; permissions: string[]; active: boolean };

export function UserAccessForm({ userId, email, employeeId, status, roleId, roles, canManage, dataScope, ownScope }: { userId: string; email: string; employeeId: string; status: string; roleId: string; roles: RoleOption[]; canManage: boolean; dataScope: string; ownScope: boolean }) {
  const [selected, setSelected] = useState(roleId);
  const [scope, setScope] = useState(dataScope);
  const [scopeTouched, setScopeTouched] = useState(ownScope);
  const role = roles.find((item) => item.id === selected) || roles[0];
  return (
    <form action={userDetailAction} className="card stack-form">
      <input type="hidden" name="id" value={userId} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="status" value={status} />
      <label className="field"><Tx text="System access role" /><select name="roleId" value={selected} onChange={(event) => { const next = roles.find((item) => item.id === event.target.value); setSelected(event.target.value); if (!scopeTouched && next) setScope(next.dataScope); }}>{roles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inactive)"}</option>)}</select></label>
      <label className="field"><Tx text="Data scope" /><select name="dataScope" value={scope} onChange={(event) => { setScopeTouched(true); setScope(event.target.value); }}><option value="SELF"><Tx text="Self" /></option><option value="DIRECT_REPORTS"><Tx text="Direct reports" /></option><option value="DEPARTMENT"><Tx text="Department" /></option><option value="BRANCH"><Tx text="Branch" /></option><option value="COMPANY"><Tx text="Company" /></option></select></label>
      <PermissionGrid selected={role?.permissions || []} readOnly />
      <div className="form-actions">
        <button className="btn" type="submit"><Tx text="Save changes" /></button>
        {canManage && roleId ? <Link className="btn secondary" href={`/settings/permissions?role=${roleId}&user=${userId}`}><Tx text="Manage this role" /></Link> : null}
      </div>
      <p className="hint"><Tx text="Saving here changes only this user's role. Extra permissions are not granted here. A change made in role settings applies to every user of that role." /></p>
      <p className="hint"><Tx text="The data scope saved here applies only to this user." /></p>
    </form>
  );
}
