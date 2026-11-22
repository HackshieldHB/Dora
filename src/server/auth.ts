import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { cookies, headers } from "next/headers";
import { startSession, clearSession, getCtx } from "@/lib/context";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_LIMIT_MS } from "@/lib/session-limit";
import { clientIp } from "@/lib/http";
import { blockedFor, clearFailures, recordFailure } from "@/lib/rate-limit";
import { licenseAllowsUse } from "@/lib/license";

/** Every message sign-in can show. The login page displays nothing outside this list. */
export const LOGIN_MESSAGES = {
  wrong: "The email or password is not correct.",
  locked: "This account is temporarily locked after failed sign-in attempts.",
  network: "Too many failed sign-in attempts from this network. Try again in 15 minutes.",
  tempExpired: "This temporary password has expired. Ask an administrator to reset it again.",
  license: "DORA cannot be used until its license problem is fixed.",
  expired: "Session expired. Please sign in again.",
  failed: "Sign-in failed.",
} as const;

export const KNOWN_LOGIN_MESSAGES: ReadonlySet<string> = new Set(Object.values(LOGIN_MESSAGES));

// Per client IP, independent of the account: slows down password spraying across many accounts.
const NETWORK_POLICY = { limit: 20, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };
// Behind a reverse proxy every request carries the real client IP, so this bucket is per visitor.
// In a dev setup with no proxy, all requests look like one IP and would share a single bucket,
// locking everyone out together; set DORA_DISABLE_IP_RATELIMIT=1 there to skip the per-IP block.
// The per-account lockout below still applies. Never set this on a real installation.
const ipRateLimitOff = () => process.env.DORA_DISABLE_IP_RATELIMIT === "1";

let dummyHash: Promise<string> | null = null;

/** Unknown accounts still pay for one bcrypt comparison, so response time does not reveal which emails exist. */
async function spendComparison(password: string) {
  dummyHash ??= hashPassword("dora-timing-equalizer");
  await verifyPassword(password, await dummyHash);
}

export async function login(email: string, password: string) {
  if (!(await licenseAllowsUse())) throw new Error(LOGIN_MESSAGES.license);
  const normalized = email.trim().toLowerCase();
  const ipKey = `ip:${clientIp(await headers())}`;
  const ipLimitOff = ipRateLimitOff();
  if (!ipLimitOff && blockedFor(ipKey) > 0) throw new Error(LOGIN_MESSAGES.network);
  const user = await prisma.user.findUnique({ where: { email: normalized }, include: { company: true } });
  const platform = await prisma.platformSetting.findUnique({ where: { id: 1 } });
  const maxFailed = user?.company?.maxFailedLogins ?? platform?.maxFailedLogins ?? 5;
  const lockoutMin = user?.company?.lockoutMin ?? platform?.lockoutMin ?? 15;
  const capMin = SESSION_LIMIT_MS / 60_000;
  const configured = user?.company?.sessionTimeoutMin ?? platform?.sessionTimeoutMin ?? capMin;
  const timeout = Math.min(capMin, configured > 0 ? configured : capMin);
  if (!user || user.status !== "ACTIVE") {
    // Behave exactly like a real account: same message, same lockout point, same cost.
    const emailKey = `email:${normalized}`;
    if (blockedFor(emailKey) > 0) throw new Error(LOGIN_MESSAGES.locked);
    await spendComparison(password);
    const networkBlocked = ipLimitOff ? false : recordFailure(ipKey, NETWORK_POLICY);
    const accountBlocked = recordFailure(emailKey, { limit: Math.max(1, maxFailed), windowMs: lockoutMin * 60 * 1000, blockMs: lockoutMin * 60 * 1000 });
    throw new Error(networkBlocked ? LOGIN_MESSAGES.network : accountBlocked ? LOGIN_MESSAGES.locked : LOGIN_MESSAGES.wrong);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new Error(LOGIN_MESSAGES.locked);
  const ok = await verifyPassword(password, user.passwordHash);
  if (ok && user.mustChangePassword && user.tempPasswordUntil && user.tempPasswordUntil.getTime() < Date.now()) {
    throw new Error(LOGIN_MESSAGES.tempExpired);
  }
  if (!ok) {
    const failed = user.failedLogins + 1;
    const locking = failed >= maxFailed;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: failed, lockedUntil: locking ? new Date(Date.now() + lockoutMin * 60 * 1000) : null },
    });
    await prisma.auditLog.create({ data: { companyId: user.companyId, actorId: user.id, action: "login.failed", entity: "User", entityId: user.id, detail: `${normalized} from ${ipKey.slice(3)}` } });
    const networkBlocked = ipLimitOff ? false : recordFailure(ipKey, NETWORK_POLICY);
    throw new Error(networkBlocked ? LOGIN_MESSAGES.network : locking ? LOGIN_MESSAGES.locked : LOGIN_MESSAGES.wrong);
  }
  clearFailures(`email:${normalized}`);
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
