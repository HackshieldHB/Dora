/**
 * VENDOR ONLY. Issues a signed license file for one client installation.
 *
 *   npm run license:issue -- --client-id ptmaju-01 --customer "PT Maju Jaya" --expires 2027-12-31 --max-employees 250
 *
 * Options:
 *   --client-id      must match DORA_CLIENT_ID used when building that client's Docker image
 *   --customer       legal name shown in the license
 *   --expires        last valid day, YYYY-MM-DD (Asia/Jakarta)
 *   --max-employees  employees that may be active at once (0 = unlimited, default 0)
 *   --key            private key (default ~/.dora-license/dora-license-private.pem)
 *   --out            output file (default licenses/<client-id>.lic, ignored by git and Docker)
 */
import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LICENSE_PREFIX, parseLicense, type LicenseClaims } from "../../src/lib/license-format";
import { LICENSE_PUBLIC_KEY } from "../../src/lib/license-public-key";

function option(name: string, fallback = ""): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1] || "";
  return value.startsWith("--") ? fallback : value.trim();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const clientId = option("client-id");
const customer = option("customer");
const expiresOn = option("expires");
const maxEmployees = Number(option("max-employees", "0"));
const keyPath = path.resolve(option("key", path.join(os.homedir(), ".dora-license", "dora-license-private.pem")));
const out = path.resolve(option("out", path.join("licenses", `${clientId}.lic`)));

if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId)) fail("--client-id must be 2-63 characters: lowercase letters, digits and dashes.");
if (!customer) fail("--customer is required.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`))) fail("--expires must be a date as YYYY-MM-DD.");
if (!Number.isInteger(maxEmployees) || maxEmployees < 0) fail("--max-employees must be a whole number (0 = unlimited).");
if (!LICENSE_PUBLIC_KEY) fail("No public key in src/lib/license-public-key.ts. Run `npm run license:keygen` first.");

const claims: LicenseClaims = {
  v: 1,
  licenseId: randomUUID(),
  clientId,
  customer,
  maxEmployees,
  issuedAt: new Date().toISOString(),
  expiresOn,
};
const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
const privateKey = createPrivateKey(readFileSync(keyPath, "utf8"));
const signature = sign(null, Buffer.from(body, "utf8"), privateKey).toString("base64url");
const license = `${LICENSE_PREFIX}.${body}.${signature}`;

// Sanity check against the public key compiled into builds: catches a key mismatch before shipping.
const check = parseLicense(license, LICENSE_PUBLIC_KEY);
if (!check.ok) fail(`The issued license does not verify against src/lib/license-public-key.ts: ${check.reason}`);

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${license}\n`);
console.log(`License ${claims.licenseId} for ${customer} (${clientId}), valid through ${expiresOn}, ${maxEmployees || "unlimited"} active employees.`);
console.log(`Written to ${out}. Install it on the client's server as license/dora.lic.`);
