import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasPerm, type Ctx } from "@/lib/context";
import { resolveAssignee } from "@/lib/domain";
import { activeDelegate, notify } from "@/lib/notify";
import { isLastApprovalLevel, parseLevels, validateLevels, workflowModuleLabel, WORKFLOW_MODULES, type ApprovalLevel, type WorkflowModule } from "@/lib/workflow";
import { requireCompany } from "./scope";

export type ApprovalPlan =
  | { mode: "fallback" }
  | { mode: "workflow"; levels: ApprovalLevel[]; allowReturn: boolean; assignees: ResolvedAssignee[] };

type ResolvedAssignee = { assigneeId: string; originalAssigneeId: string };

const BLOCKED_ASSIGN_KEYS = new Set(["company_admin", "platform"]);

export function assignableRoles<T extends { key: string; active: boolean }>(roles: T[]) {
  return roles.filter((role) => role.active && !BLOCKED_ASSIGN_KEYS.has(role.key));
}

export async function planApproval(input: { companyId: string; workflowKey: WorkflowModule; requesterId: string; employeeId: string; taskModule: string }): Promise<ApprovalPlan> {
  const workflow = await prisma.approvalWorkflow.findFirst({ where: { companyId: input.companyId, module: input.workflowKey, active: true }, orderBy: { createdAt: "desc" } });
  if (!workflow) return { mode: "fallback" };
  const levels = parseLevels(workflow.levelsJson);
  if (!levels.length) throw new Error("The approval workflow has no levels. The request was not submitted.");
  const assignees = await resolveLevel(input.companyId, levels[0], input.employeeId, input.requesterId, input.taskModule);
  if (!assignees.length) throw new Error(`No active approver was found for level 1. The request was not submitted.`);
  return { mode: "workflow", levels, allowReturn: workflow.allowReturn, assignees };
}

export async function commitApproval(input: {
  plan: ApprovalPlan;
  companyId: string;
  workflowKey: WorkflowModule;
  taskModule: string;
  subjectId: string;
  requesterId: string;
  employeeId: string;
  title: string;
  href: string;
  fallbackAssigneeId: string;
  fallbackOriginalId: string;
}) {
  await prisma.approvalRoute.deleteMany({ where: { companyId: input.companyId, subjectId: input.subjectId } });
  if (input.plan.mode === "fallback") {
    await prisma.approvalTask.create({
      data: {
        companyId: input.companyId,
        module: input.taskModule,
        subjectId: input.subjectId,
        assigneeId: input.fallbackAssigneeId,
        originalAssigneeId: input.fallbackOriginalId,
        requesterId: input.requesterId,
        title: input.title,
        href: input.href,
      },
    });
    return [input.fallbackAssigneeId];
  }
  await prisma.approvalRoute.create({
    data: {
      companyId: input.companyId,
      subjectId: input.subjectId,
      workflowKey: input.workflowKey,
      taskModule: input.taskModule,
      requesterId: input.requesterId,
      employeeId: input.employeeId,
      title: input.title,
      href: input.href,
      levelsJson: JSON.stringify(input.plan.levels),
      currentLevel: 1,
      allowReturn: input.plan.allowReturn,
    },
  });
  for (const assignee of input.plan.assignees) {
    await prisma.approvalTask.create({
      data: {
        companyId: input.companyId,
        module: input.taskModule,
        subjectId: input.subjectId,
        assigneeId: assignee.assigneeId,
        originalAssigneeId: assignee.originalAssigneeId,
        requesterId: input.requesterId,
        title: input.title,
        href: input.href,
      },
    });
  }
  return input.plan.assignees.map((assignee) => assignee.assigneeId);
}

export async function stageDecision(input: { companyId: string; subjectId: string; taskId: string; actorId: string; decision: "APPROVED" | "REJECTED" | "RETURNED"; note: string }): Promise<"legacy" | "next" | "apply"> {
  const route = await prisma.approvalRoute.findUnique({ where: { companyId_subjectId: { companyId: input.companyId, subjectId: input.subjectId } } });
  if (!route) return "legacy";
  if (input.actorId === route.requesterId) throw new Error("You cannot approve your own request.");
  const task = await prisma.approvalTask.findFirst({ where: { id: input.taskId, companyId: input.companyId, status: "PENDING" } });
  if (!task) throw new Error("This request was already decided.");
  if (input.decision === "RETURNED" && !route.allowReturn) throw new Error("This workflow does not send the request back for revision.");
  const levels = parseLevels(route.levelsJson);
  const openingNext = input.decision === "APPROVED" && !isLastApprovalLevel(route.currentLevel, levels.length);
  if (!openingNext) {
    await prisma.approvalTask.updateMany({ where: { companyId: input.companyId, subjectId: input.subjectId, status: "PENDING", NOT: { id: task.id } }, data: { status: "DONE" } });
    return "apply";
  }
  const nextLevel = levels[route.currentLevel];
  const assignees = await resolveLevel(input.companyId, nextLevel, route.employeeId, route.requesterId, route.taskModule);
  if (!assignees.length) throw new Error(`No active approver was found for level ${route.currentLevel + 1}. This request was not left without an owner.`);
  await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: input.actorId, decision: input.decision, note: input.note } });
  await prisma.approvalTask.updateMany({ where: { companyId: input.companyId, subjectId: input.subjectId, status: "PENDING" }, data: { status: "DONE" } });
  await prisma.approvalRoute.update({ where: { id: route.id }, data: { currentLevel: route.currentLevel + 1 } });
  for (const assignee of assignees) {
    await prisma.approvalTask.create({
      data: {
        companyId: input.companyId,
        module: route.taskModule,
        subjectId: input.subjectId,
        assigneeId: assignee.assigneeId,
        originalAssigneeId: assignee.originalAssigneeId,
        requesterId: route.requesterId,
        title: route.title,
        href: route.href,
      },
    });
    await notify(assignee.assigneeId, "Approval waiting", route.title, route.href);
  }
  return "next";
}

async function resolveLevel(companyId: string, level: ApprovalLevel, employeeId: string, requesterId: string, taskModule: string): Promise<ResolvedAssignee[]> {
  if (level.kind === "USER") {
    const user = await prisma.user.findFirst({ where: { id: level.userId, companyId, status: "ACTIVE" } });
    if (!user || user.id === requesterId) return [];
    return [{ assigneeId: user.id, originalAssigneeId: user.id }];
  }
  if (level.kind === "ROLE") {
    const users = await prisma.user.findMany({ where: { companyId, status: "ACTIVE", roleId: level.roleId } });
    return users.filter((user) => user.id !== requesterId).map((user) => ({ assigneeId: user.id, originalAssigneeId: user.id }));
  }
  if (!employeeId) return [];
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee?.managerId) return [];
  const manager = await prisma.user.findFirst({ where: { employeeId: employee.managerId, companyId, status: "ACTIVE" } });
  if (!manager || manager.id === requesterId) return [];
  const delegate = await activeDelegate(manager.id, taskModule, companyId);
  const assigneeId = resolveAssignee(manager.id, delegate, requesterId);
  if (assigneeId === requesterId) return [];
  return [{ assigneeId, originalAssigneeId: manager.id }];
}

export async function listWorkflows(companyId: string) {
  return prisma.approvalWorkflow.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
}

export async function saveWorkflow(ctx: Ctx, input: { id: string; name: string; module: string; active: boolean; allowReturn: boolean; levelsJson: string }) {
  if (!hasPerm(ctx, "approvals.configure")) throw new Error("You do not have permission to configure approval workflows.");
  const companyId = requireCompany(ctx);
  const workflowModule = WORKFLOW_MODULES.find((item) => item.key === input.module)?.key;
  if (!workflowModule) throw new Error("Choose a request type.");
  if (!input.name.trim()) throw new Error("A workflow name is required.");
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ where: { companyId } }),
    prisma.user.findMany({ where: { companyId } }),
  ]);
  const levels = parseLevels(input.levelsJson);
  const error = validateLevels(levels, roles, users);
  if (error) throw new Error(error);
  if (input.id) {
    const owned = await prisma.approvalWorkflow.findFirst({ where: { id: input.id, companyId } });
    if (!owned) throw new Error("Workflow not found.");
  }
  if (input.active) {
    await prisma.approvalWorkflow.updateMany({ where: { companyId, module: workflowModule, active: true, ...(input.id ? { NOT: { id: input.id } } : {}) }, data: { active: false } });
  }
  const data = { name: input.name.trim(), module: workflowModule, active: input.active, allowReturn: input.allowReturn, levelsJson: JSON.stringify(levels) };
  const saved = input.id
    ? await prisma.approvalWorkflow.update({ where: { id: input.id }, data })
    : await prisma.approvalWorkflow.create({ data: { ...data, companyId } });
  await audit(ctx, input.id ? "workflow.update" : "workflow.create", "ApprovalWorkflow", saved.id, `${saved.name} ${workflowModuleLabel(workflowModule)} ${levels.length} levels`);
}

export async function assertAssignableRole(companyId: string, roleId: string, currentRoleId = "") {
  const role = await prisma.role.findFirst({ where: { id: roleId, companyId } });
  if (!role) throw new Error("Choose an access role from this company.");
  if (role.id === currentRoleId) return role;
  if (!role.active) throw new Error("That access role is inactive.");
  if (BLOCKED_ASSIGN_KEYS.has(role.key)) throw new Error("That access role cannot be assigned from employee management.");
  return role;
}
