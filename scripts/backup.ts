/**
 * Encrypted backup of the database and uploaded files.
 *
 *   npm run backup -- --out ./backups [--keep 14]
 *   (Docker) docker compose exec dora node tools/backup.js --out /backups
 *
 * Produces one file, dora-backup-<UTC timestamp>.dorabak:
 *   "DORABAK1" | salt (16) | IV (12) | AES-256-GCM( tar.gz of dora.db snapshot + storage/ ) | tag (16)
 * The key is derived with scrypt from DORA_BACKUP_PASSPHRASE (at least 16 characters).
 *
 * Restoring also needs DORA_DATA_KEY, because the fields and files inside are encrypted with it.
 * Store the passphrase and the data key apart from the backups, e.g. in a password manager / safe.
 */
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { PrismaClient } from "@prisma/client";
import { BACKUP_MAGIC, backupKey, tarCommand } from "./backup-format";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (Docker).
}

function option(name: string, fallback = ""): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1] || "";
  return value.startsWith("--") ? fallback : value;
}

async function main() {
  const outDir = path.resolve(option("out", "backups"));
  const keep = Number(option("keep", "14"));
  if (!Number.isInteger(keep) || keep < 1) throw new Error("--keep must be a whole number of at least 1.");
  const salt = randomBytes(16);
  const key = backupKey(process.env.DORA_BACKUP_PASSPHRASE || "", salt);
  await mkdir(outDir, { recursive: true });

  const staging = await mkdtemp(path.join(os.tmpdir(), "dora-backup-"));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const target = path.join(outDir, `dora-backup-${stamp}.dorabak`);
  const partial = `${target}.partial`;
  try {
    // VACUUM INTO writes a consistent copy of the live database, even while DORA keeps running.
    const snapshot = path.join(staging, "dora.db");
    const prisma = new PrismaClient();
    try {
      await prisma.$executeRawUnsafe(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    } finally {
      await prisma.$disconnect();
    }

    const tarArgs = ["-czf", "-", "-C", staging, "dora.db"];
    if (existsSync(path.join(process.cwd(), "storage"))) tarArgs.push("-C", process.cwd(), "storage");
    const tar = spawn(tarCommand(), tarArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let tarError = "";
    tar.stderr.on("data", (chunk) => (tarError += chunk.toString()));
    const tarDone = new Promise<void>((resolve, reject) => {
      tar.on("error", reject);
      tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}: ${tarError.trim()}`))));
    });

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const out = createWriteStream(partial, { mode: 0o600 });
    out.write(Buffer.concat([BACKUP_MAGIC, salt, iv]));
    await Promise.all([
      pipeline(tar.stdout, cipher, async function* (encrypted: AsyncIterable<Buffer>) {
        for await (const chunk of encrypted) yield chunk;
        // The cipher has flushed once its output ends, so the authentication tag is final here.
        yield cipher.getAuthTag();
      }, out),
      tarDone,
    ]);
    await rename(partial, target);
  } catch (error) {
    await unlink(partial).catch(() => undefined);
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  const size = (await stat(target)).size;
  console.log(`Backup written: ${target} (${(size / 1024 / 1024).toFixed(2)} MB)`);

  const old = (await readdir(outDir)).filter((name) => /^dora-backup-\d{8}T\d{6}Z\.dorabak$/.test(name)).sort();
  for (const name of old.slice(0, Math.max(0, old.length - keep))) {
    await unlink(path.join(outDir, name));
    console.log(`Removed old backup ${name}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
