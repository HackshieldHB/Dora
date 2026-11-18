import { prisma } from "@/lib/db";
import { hasPerm, type Ctx } from "@/lib/context";
import { roleActiveAction } from "@/app/actions";
import { Tx } from "@/components/locale";
import { WorkflowEditor } from "./workflow-editor";

export async function WorkflowBoard({ ctx }: { ctx: Ctx }) {
  if (!ctx.companyId) return null;
  const [roles, users, workflows] = await Promise.all([
    prisma.role.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { companyId: ctx.companyId, status: "ACTIVE" }, orderBy: { email: "asc" } }),
    prisma.approvalWorkflow.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" } }),
  ]);
  const custom = roles.filter((role) => role.isCustom);
  return (
    <>
      {custom.length ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p className="section-label"><Tx text={"Custom roles"} /></p>
          {custom.map((role) => (
            <form key={role.id} action={roleActiveAction} className="workflow-role">
              <input type="hidden" name="id" value={role.id} />
              <input type="hidden" name="active" value={role.active ? "false" : "true"} />
              <span><strong>{role.name}</strong> · {role.active ? <Tx text={"Active"} /> : <Tx text={"Inactive"} />}</span>
              <button className="btn secondary" type="submit">{role.active ? <Tx text={"Deactivate"} /> : <Tx text={"Activate"} />}</button>
            </form>
          ))}
          <p className="hint"><Tx text={"Deactivating a role blocks new assignments. Employees who already use it keep that access."} /></p>
        </section>
      ) : null}
      {hasPerm(ctx, "approvals.configure") ? (
        <section style={{ marginTop: 14 }}>
          <h2><Tx text={"Workflow configuration"} /></h2>
          <p className="hint"><Tx text={"One active workflow applies to each request type. A change does not alter a request that is already pending."} /></p>
          <WorkflowEditor
            locale={ctx.locale}
            roles={roles.filter((role) => role.key !== "company_admin" && role.key !== "platform").map((role) => ({ id: role.id, name: role.name, active: role.active }))}
            users={users.map((user) => ({ id: user.id, name: user.email }))}
            workflows={workflows.map((row) => ({ id: row.id, name: row.name, module: row.module, active: row.active, allowReturn: row.allowReturn, levelsJson: row.levelsJson }))}
          />
        </section>
      ) : null}
    </>
  );
}
