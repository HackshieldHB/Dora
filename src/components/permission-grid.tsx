"use client";

import { Tx, TInput } from "@/components/locale";
import { PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from "@/lib/permissions";

export function PermissionGrid({ selected, readOnly = false }: { selected?: string[]; readOnly?: boolean }) {
  const chosen = new Set(selected || []);
  return (
    <div className="perm-groups">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend><Tx text={group.title} /></legend>
          <div className="perm-grid">
            {group.permissions.map((permission) => (
              <label key={permission}>
                <TInput name={readOnly ? undefined : "permissions"} type="checkbox" value={permission} defaultChecked={readOnly ? undefined : chosen.has(permission)} checked={readOnly ? chosen.has(permission) : undefined} disabled={readOnly} /> <Tx text={PERMISSION_LABELS[permission as Permission]} />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
