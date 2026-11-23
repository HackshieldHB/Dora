import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { parsePermissions, todayJakarta } from "./format";
import { sessionDeadline } from "./session-limit";
import { licenseAllowsUse } from "./license";

export type Ctx = {
  userId: string;
  email: string;
  fullName: string;
  companyId: string | null;
  companyName: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isCustom: boolean;
  layout: string;
  dataScope: string;
  scopeRefId: string;
  permissions: Set<string>;
  employeeId: string | null;
  departmentId: string | null;
  departmentIds: string[];
  branchId: string | null;
  mustChangePassword: boolean;
  locale: "en" | "id";
};

const COOKIE = "dora_session";

async function departmentTree(companyId: string, root: string): Promise<string[]> {
  const rows = await prisma.department.findMany({ where: { companyId }, select: { id: true, parentId: true } });
  const ids = new Set<string>();
  const walk = (id: string) => {
    if (!id || ids.has(id)) return;
    ids.add(id);
    for (const row of rows) if (row.parentId === id) walk(row.id);
  };
  walk(root);
  return [...ids];
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const EMPLOYEE_FIELDS = new Set([
  "status", "fullName", "email", "phone", "address", "emergencyName", "emergencyPhone", "nik", "npwp", "ptkp",
  "branchId", "locationId", "departmentId", "positionId", "managerId", "joinDate", "birthDate", "employmentType",
  "contractEnd", "contractDecision", "basicSalary", "bankName", "bankAccount", "bpjsHealthNo", "bpjsTkNo",
  "insuranceName", "insuranceNo", "exitType", "exitReason", "lastWorkingDay", "clearanceDone", "clearanceAccess",
  "clearanceAssets", "clearanceBpjs", "finalPayrollDone",
]);

function employeePatch(raw: string): Prisma.EmployeeUpdateInput {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!EMPLOYEE_FIELDS.has(key) || value === undefined) continue;
    data[key] = key === "basicSalary" && typeof value === "string" ? Number(value) : value;
  }
  return data;
}

export async function applyDueChanges(companyId: string) {
  const today = todayJakarta();
  const events = await prisma.employmentEvent.findMany({
    where: { applied: false, effectiveDate: { lte: today }, employee: { companyId } },
  });
  for (const event of events) {
    const after = employeePatch(event.afterJson);
    if (Object.keys(after).length) await prisma.employee.update({ where: { id: event.employeeId }, data: after });
    await prisma.employmentEvent.update({ where: { id: event.id }, data: { applied: true } });
  }
  const changes = await prisma.orgChange.findMany({ where: { companyId, applied: false, effectiveDate: { lte: today } } });
  for (const change of changes) {
    const after = JSON.parse(change.afterJson) as { parentId?: string | null; managerId?: string | null };
    if (change.entityType === "DEPARTMENT") {
      await prisma.department.update({ where: { id: change.entityId }, data: { parentId: after.parentId ?? null } });
    }
    if (change.entityType === "EMPLOYEE_MANAGER") {
      await prisma.employee.update({ where: { id: change.entityId }, data: { managerId: after.managerId ?? null } });
    }
    await prisma.orgChange.update({ where: { id: change.id }, data: { applied: true } });
  }
  const exiting = await prisma.employee.findMany({
    where: { companyId, status: { in: ["ACTIVE", "PENDING OFFBOARDING"] }, lastWorkingDay: { not: "", lt: today } },
  });
  for (const employee of exiting) {
    await prisma.employee.update({ where: { id: employee.id }, data: { status: "INACTIVE" } });
    await prisma.user.updateMany({ where: { employeeId: employee.id }, data: { status: "DISABLED" } });
    await prisma.employmentEvent.updateMany({ where: { employeeId: employee.id, changeType: "OFFBOARDING", applied: false }, data: { applied: true } });
  }
}

export async function getCtx(): Promise<Ctx | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  // Every page, server action and API route resolves the user here, so this one check
  // stops all use of a release build without a valid license (cached; cheap per request).
  if (!(await licenseAllowsUse())) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true, employee: true, company: true } } },
  });
  if (!session || session.user.status !== "ACTIVE") return null;
  if (!sessionDeadline(session.createdAt, session.expiresAt)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.companyId) await applyDueChanges(session.user.companyId);
  const user = session.user;
  const dataScope = user.dataScope || user.role.dataScope;
  const rootDepartment = dataScope === "DEPARTMENT" ? (user.dataScope ? user.employee?.departmentId || "" : user.role.scopeRefId || user.employee?.departmentId || "") : "";
  const departmentIds = user.companyId && rootDepartment ? await departmentTree(user.companyId, rootDepartment) : [];
  return {
    userId: user.id,
    email: user.email,
    fullName: user.employee?.fullName || user.email,
    companyId: user.companyId,
    companyName: user.company?.name ?? "DORA Platform",
    roleId: user.roleId,
    roleKey: user.role.key,
    roleName: user.role.name,
    isCustom: user.role.isCustom,
    layout: user.role.isCustom ? "standard" : user.role.layout,
    dataScope,
    scopeRefId: user.dataScope ? "" : user.role.scopeRefId,
    permissions: new Set(parsePermissions(user.role.permissions)),
    employeeId: user.employeeId,
    departmentId: user.employee?.departmentId ?? null,
    departmentIds,
    branchId: user.employee?.branchId ?? null,
    mustChangePassword: user.mustChangePassword,
    locale: user.locale === "id" ? "id" : "en",
  };
}

export async function sessionEndsAt(): Promise<number | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return null;
  return sessionDeadline(session.createdAt, session.expiresAt);
}

export async function requireUser(options?: { allowPasswordChange?: boolean }): Promise<Ctx> {
  const jar = await cookies();
  const hadSession = Boolean(jar.get(COOKIE)?.value);
  const ctx = await getCtx();
  if (!ctx) redirect(hadSession ? "/session-expired" : "/login");
  if (ctx.mustChangePassword && !options?.allowPasswordChange) redirect("/change-password");
  return ctx;
}

export async function requirePerm(permission: string): Promise<Ctx> {
  const ctx = await requireUser();
  if (!ctx.permissions.has(permission)) redirect(`/forbidden?need=${encodeURIComponent(permission)}`);
  return ctx;
}

export async function assertPerm(permission: string): Promise<Ctx> {
  const ctx = await requireUser();
  if (!ctx.permissions.has(permission)) throw new Error("You do not have permission for this action.");
  return ctx;
}

export function hasPerm(ctx: Ctx, permission: string): boolean {
  return ctx.permissions.has(permission);
}

export async function startSession(userId: string, timeoutMin: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + timeoutMin * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", expires: expiresAt });
}

/**
 * Session cookies carry the Secure flag in production, so they are never sent over plain HTTP.
 * DORA_COOKIE_SECURE=false is an escape hatch for a closed intranet without TLS (not recommended).
 */
export function secureCookies(): boolean {
  const flag = process.env.DORA_COOKIE_SECURE?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(COOKIE);
}

export function isNextRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest: unknown }).digest).includes("NEXT_REDIRECT");
}
