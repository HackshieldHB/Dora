import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { todayJakarta } from "./format";
import { canonicalJson, parseLicense, verifySignature, type IntegrityManifest, type LicenseClaims } from "./license-format";
import { LICENSE_PUBLIC_KEY } from "./license-public-key";

/**
 * License and integrity enforcement.
 *
 * The three constants below are inlined by Next.js at build time (next.config.ts `env`), so on the
 * client's server they are literals inside the compiled bundle, not environment variables that can
 * be switched off. Only release builds (DORA_RELEASE=1, set by the Dockerfile) enforce anything;
 * `next dev` and local builds run without a license.
 */
export const LICENSE_ENFORCED = process.env.DORA_LICENSE_ENFORCED === "1";
const BUILD_CLIENT_ID = process.env.DORA_BUILD_CLIENT_ID || "";
const BUILD_ID = process.env.DORA_BUILD_ID || "";

/** Build watermark: identifies which client a leaked bundle came from. */
export const BUILD_WATERMARK = `dora-build:${BUILD_CLIENT_ID || "dev"}:${BUILD_ID || "local"}`;

const RECHECK_MS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 48 * 60 * 60 * 1000;
const SEEN_WRITE_EVERY_MS = 60 * 60 * 1000;
const COUNTED_STATUSES = ["ACTIVE", "PENDING OFFBOARDING"];

export type LicenseStatus = {
  ok: boolean;
  enforced: boolean;
  reason: string;
  claims: LicenseClaims | null;
  /** Days left including today (0 = expires today). Null without a valid license. */
  daysLeft: number | null;
};

let cached: { at: number; status: LicenseStatus } | null = null;
let integrity: Promise<string | null> | null = null;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listFiles(dir: string, base: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Verifies the signed manifest of server files written at build time. Null means intact. */
async function checkIntegrity(): Promise<string | null> {
  const root = process.cwd();
  let parsed: IntegrityManifest & { signature?: string };
  try {
    parsed = JSON.parse(await readFile(path.join(root, ".next", "dora-integrity.json"), "utf8"));
  } catch {
    return "The application integrity manifest is missing or unreadable.";
  }
  const { signature, ...manifest } = parsed;
  if (!signature || !verifySignature(LICENSE_PUBLIC_KEY, canonicalJson(manifest), Buffer.from(signature, "base64url"))) {
    return "The application integrity manifest is not signed by the vendor.";
  }
  if (manifest.clientId !== BUILD_CLIENT_ID || manifest.buildId !== BUILD_ID) return "The integrity manifest belongs to a different build.";
  const files = Object.entries(manifest.files || {});
  if (files.length === 0) return "The integrity manifest lists no files.";
  for (const [relative, expected] of files) {
    // Reject path traversal by segment: route folders such as "[...slug]" legitimately contain dots.
    if (path.isAbsolute(relative) || relative.split("/").some((segment) => segment === ".." || segment === "")) return "The integrity manifest is malformed.";
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(root, relative));
    } catch {
      return `Application file missing: ${relative}`;
    }
    if (sha256(bytes) !== expected) return `Application file was modified: ${relative}`;
  }
  const listed = new Set(files.map(([relative]) => relative));
  for (const relative of await listFiles(path.join(root, ".next", "server"), root)) {
    if (relative.endsWith(".js") && !listed.has(relative)) return `Unexpected application file: ${relative}`;
  }
  return null;
}

async function readLicenseText(): Promise<string> {
  const inline = process.env.DORA_LICENSE?.trim();
  if (inline) return inline;
  const file = process.env.DORA_LICENSE_FILE?.trim() || path.join(process.cwd(), "license", "dora.lic");
  try {
    return (await readFile(file, "utf8")).trim();
  } catch {
    return "";
  }
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** Compares the clock with the latest time seen before, and moves that mark forward. */
async function clockProblem(now: number): Promise<string | null> {
  try {
    const setting = await prisma.platformSetting.findUnique({ where: { id: 1 }, select: { licenseSeenAt: true } });
    if (!setting) return null;
    const seen = setting.licenseSeenAt?.getTime() ?? 0;
    if (seen && now < seen - CLOCK_TOLERANCE_MS) return "The server clock is set earlier than a time DORA has already recorded. Correct the system clock.";
    if (now > seen + SEEN_WRITE_EVERY_MS) await prisma.platformSetting.update({ where: { id: 1 }, data: { licenseSeenAt: new Date(now) } });
  } catch {
    // Database not ready yet (first start before setup). The other checks still apply.
  }
  return null;
}

async function computeStatus(): Promise<LicenseStatus> {
  const fail = (reason: string, claims: LicenseClaims | null = null): LicenseStatus => ({ ok: false, enforced: LICENSE_ENFORCED, reason, claims, daysLeft: null });
  if (LICENSE_ENFORCED) {
    if (!BUILD_CLIENT_ID || !BUILD_ID) return fail("This release build has no client watermark.");
    integrity ??= checkIntegrity();
    const broken = await integrity;
    if (broken) return fail(broken);
  }
  const text = await readLicenseText();
  if (!text) return fail("No DORA license is installed.");
  const parsed = parseLicense(text, LICENSE_PUBLIC_KEY);
  if (!parsed.ok) return fail(parsed.reason);
  const { claims } = parsed;
  if (BUILD_CLIENT_ID && claims.clientId !== BUILD_CLIENT_ID) return fail("This license was issued for a different installation.", claims);
  const now = Date.now();
  const daysLeft = daysBetween(todayJakarta(new Date(now)), claims.expiresOn);
  if (daysLeft < 0) return fail(`The DORA license expired on ${claims.expiresOn}.`, claims);
  const clock = await clockProblem(now);
  if (clock) return fail(clock, claims);
  return { ok: true, enforced: LICENSE_ENFORCED, reason: "", claims, daysLeft };
}

export async function licenseStatus(): Promise<LicenseStatus> {
  if (cached && Date.now() - cached.at < RECHECK_MS) return cached.status;
  const status = await computeStatus();
  if (!status.ok && LICENSE_ENFORCED && cached?.status.reason !== status.reason) console.error(`[DORA license] ${status.reason}`);
  cached = { at: Date.now(), status };
  return status;
}

/** True when the app may be used: a valid license, or a non-release build. */
export async function licenseAllowsUse(): Promise<boolean> {
  if (!LICENSE_ENFORCED) return true;
  return (await licenseStatus()).ok;
}

/** Throws when activating one more employee would exceed the licensed number. */
export async function assertEmployeeCapacity(): Promise<void> {
  if (!LICENSE_ENFORCED) return;
  const status = await licenseStatus();
  if (!status.ok || !status.claims) throw new Error(`DORA license problem: ${status.reason}`);
  const max = status.claims.maxEmployees;
  if (!max) return;
  const active = await prisma.employee.count({ where: { status: { in: COUNTED_STATUSES } } });
  if (active >= max) throw new Error(`The DORA license covers ${max} active employees and that limit is reached. Contact your vendor to extend it.`);
}
