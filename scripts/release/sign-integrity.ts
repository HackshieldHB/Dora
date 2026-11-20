/**
 * RELEASE BUILD STEP (runs inside the Docker builder, after obfuscation).
 * Hashes every server-side JavaScript file of the standalone build and signs the list with the
 * vendor key. At runtime the app re-hashes the files and refuses to run if any was changed,
 * added or removed (see checkIntegrity in src/lib/license.ts).
 *
 *   tsx scripts/release/sign-integrity.ts --root .next/standalone --key /run/secrets/dora_signing_key
 *
 * DORA_CLIENT_ID and DORA_BUILD_ID must be the same values the build was compiled with.
 */
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, verifySignature, type IntegrityManifest } from "../../src/lib/license-format";
import { LICENSE_PUBLIC_KEY } from "../../src/lib/license-public-key";

function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const root = path.resolve(option("root") || ".next/standalone");
const keyPath = option("key");
const clientId = process.env.DORA_CLIENT_ID || "";
const buildId = process.env.DORA_BUILD_ID || "";
if (!keyPath) throw new Error("--key is required");
if (!clientId || !buildId) throw new Error("DORA_CLIENT_ID and DORA_BUILD_ID must be set");

let toolFiles: string[] = [];
try {
  toolFiles = walk(path.join(root, "tools")).filter((file) => file.endsWith(".js"));
} catch {
  // No tools folder in this build.
}
const targets = [path.join(root, "server.js"), ...walk(path.join(root, ".next", "server")).filter((file) => file.endsWith(".js")), ...toolFiles];
const files: Record<string, string> = {};
for (const file of targets) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  files[relative] = createHash("sha256").update(readFileSync(file)).digest("hex");
}

const manifest: IntegrityManifest = { v: 1, clientId, buildId, createdAt: new Date().toISOString(), files };
const signature = sign(null, Buffer.from(canonicalJson(manifest), "utf8"), createPrivateKey(readFileSync(keyPath, "utf8"))).toString("base64url");
if (!verifySignature(LICENSE_PUBLIC_KEY, canonicalJson(manifest), Buffer.from(signature, "base64url"))) {
  throw new Error("The signing key does not match src/lib/license-public-key.ts");
}
writeFileSync(path.join(root, ".next", "dora-integrity.json"), JSON.stringify({ ...manifest, signature }));
console.log(`Integrity manifest signed: ${Object.keys(files).length} files, client ${clientId}, build ${buildId}.`);
