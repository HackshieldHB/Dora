/**
 * First-time setup of a real (non-demo) DORA installation.
 *
 *   npm run setup:production -- --platform-email it@client.co.id
 *   npm run setup:production -- --platform-email it@client.co.id --company "PT Client" --company-admin hr@client.co.id
 *
 * Creates the platform settings, the platform administrator and, optionally, the first company
 * with its administrator. Every account gets a random one-time password that must be changed at
 * first sign-in and expires after --hours (default 72). Passwords are printed once and never stored.
 * Refuses to run when any user already exists, so it can never overwrite a live installation.
 */
import { prisma } from "../src/lib/db";
import { SAMPLE_RULE } from "../src/lib/domain";
import { hashPassword, temporaryPassword } from "../src/lib/password";
import { DEFAULT_ROLE_TEMPLATES, PLATFORM_PERMISSIONS } from "../src/lib/permissions";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (Docker).
}

function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return "";
  const value = process.argv[index + 1] || "";
  return value.startsWith("--") ? "" : value.trim();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const platformEmail = option("platform-email").toLowerCase();
  const companyName = option("company");
  const companyAdmin = option("company-admin").toLowerCase();
  const hours = Number(option("hours") || 72);
  if (!EMAIL.test(platformEmail)) throw new Error("Pass --platform-email with a valid address.");
  if (Boolean(companyName) !== Boolean(companyAdmin)) throw new Error("Pass --company and --company-admin together, or neither.");
  if (companyAdmin && !EMAIL.test(companyAdmin)) throw new Error("--company-admin must be a valid address.");
  if (companyAdmin && companyAdmin === platformEmail) throw new Error("The company admin needs a different email from the platform admin.");
  if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 14) throw new Error("--hours must be between 1 and 336.");
  if ((await prisma.user.count()) > 0) throw new Error("Users already exist. This script only sets up an empty database; it will not touch a live installation.");

  const expires = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.platformSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  let rule = await prisma.statutoryRule.findFirst({ where: { active: true } });
  if (!rule) {
    rule = await prisma.statutoryRule.create({
      data: {
        code: "SAMPLE-STATUTORY-1",
        name: "Sample platform statutory rule",
        effectiveFrom: "2024-01-01",
        active: true,
        status: "VALIDATED",
        approvalStatus: "SAMPLE",
        source: "Installed sample. Not an official government feed.",
        definition: JSON.stringify(SAMPLE_RULE),
        note: "Illustrative platform rule for PPh 21 and BPJS. Replace it from Platform Statutory Rules before treating the figures as statutory filing numbers.",
      },
    });
  }

  const platformRole = await prisma.role.create({
    data: { key: "platform_admin", name: "Platform Admin", isDefault: true, dataScope: "PLATFORM", layout: "platform", permissions: JSON.stringify(PLATFORM_PERMISSIONS) },
  });
  const platformPassword = temporaryPassword();
  const platformUser = await prisma.user.create({
    data: { email: platformEmail, passwordHash: await hashPassword(platformPassword), roleId: platformRole.id, mustChangePassword: true, tempPasswordUntil: expires },
  });
  await prisma.auditLog.create({ data: { companyId: null, actorId: platformUser.id, action: "setup.production", entity: "User", entityId: platformUser.id, detail: "Initial platform administrator" } });

  let companyPassword = "";
  if (companyName) {
    // Mirrors createTenant() in src/server/admin.ts.
    const company = await prisma.company.create({ data: { name: companyName, email: companyAdmin } });
    let adminRoleId = "";
    for (const [key, template] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
      const role = await prisma.role.create({
        data: { companyId: company.id, key, name: template.name, isDefault: true, dataScope: template.scope, layout: template.layout, permissions: JSON.stringify(template.permissions) },
      });
      if (key === "company_admin") adminRoleId = role.id;
    }
    if (!adminRoleId) throw new Error("The company_admin role template is missing.");
    companyPassword = temporaryPassword();
    await prisma.user.create({
      data: { companyId: company.id, email: companyAdmin, passwordHash: await hashPassword(companyPassword), roleId: adminRoleId, mustChangePassword: true, tempPasswordUntil: expires },
    });
    await prisma.attendancePolicy.create({ data: { companyId: company.id } });
    await prisma.overtimePolicy.create({ data: { companyId: company.id } });
    await prisma.companyStatutorySetting.create({ data: { companyId: company.id, ruleId: rule.id } });
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: platformUser.id, action: "platform.tenant", entity: "Company", entityId: company.id, detail: companyName } });
  }

  console.log("");
  console.log("DORA is set up. These one-time passwords are shown only now:");
  console.log(`  Platform admin  ${platformEmail}  ${platformPassword}`);
  if (companyName) console.log(`  Company admin   ${companyAdmin}  ${companyPassword}  (${companyName})`);
  console.log(`Each must be changed at first sign-in and expires ${expires.toISOString()}.`);
  console.log("Hand them over through a separate channel (not the same email as the login address).");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
