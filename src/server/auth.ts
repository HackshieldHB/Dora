import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { cookies } from "next/headers";
import { startSession, clearSession, getCtx } from "@/lib/context";
import { verifyPassword } from "@/lib/password";
import { SESSION_LIMIT_MS } from "@/lib/session-limit";

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { company: true } });
  const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
  const maxFailed = user?.company?.maxFailedLogins ?? platform?.maxFailedLogins ?? 5;
  const lockoutMin = user?.company?.lockoutMin ?? platform?.lockoutMin ?? 15;
  const capMin = SESSION_LIMIT_MS / 60_000;
  const configured = user?.company?.sessionTimeoutMin ?? platform?.sessionTimeoutMin ?? capMin;
  const timeout = Math.min(capMin, configured > 0 ? configured : capMin);
  if (!user || user.status !== "ACTIVE") throw new Error("The email or password is not correct.");
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new Error("This account is temporarily locked after failed sign-in attempts.");
  const ok = await verifyPassword(password, user.passwordHash);
  if (ok && user.mustChangePassword && user.tempPasswordUntil && user.tempPasswordUntil.getTime() < Date.now()) {
    throw new Error("This temporary password has expired. Ask an administrator to reset it again.");
  }
  if (!ok) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: failed, lockedUntil: failed >= maxFailed ? new Date(Date.now() + lockoutMin * 60 * 1000) : null },
    });
    await prisma.auditLog.create({ data: { companyId: user.companyId, actorId: user.id, action: "login.failed", entity: "User", entityId: user.id, detail: email } });
    throw new Error("The email or password is not correct.");
  }
  const jar = await cookies();
  const picked = jar.get("dora_lang")?.value;
  const locale = picked === "id" || picked === "en" ? picked : user.locale === "id" ? "id" : "en";
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), locale } });
  jar.set("dora_lang", locale, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  await startSession(user.id, timeout);
  await audit({ companyId: user.companyId, userId: user.id }, "login", "User", user.id, "");
}

export async function logout() {
  const ctx = await getCtx();
  if (ctx) await audit(ctx, "logout", "User", ctx.userId, "");
  await clearSession();
}
