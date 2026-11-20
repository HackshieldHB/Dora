/**
 * Decrypts and unpacks a backup made by backup.ts into a NEW folder. It never touches live data.
 *
 *   npm run restore -- --file backups/dora-backup-20270101T010000Z.dorabak --to restored
 *
 * The backup is authenticated: a wrong passphrase or a modified file is rejected and nothing is
 * left behind. Afterwards, stop DORA, put restored/dora.db and restored/storage in place, start DORA
 * with the same DORA_DATA_KEY that was in use when the backup was taken.
 */
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { BACKUP_MAGIC, backupKey, tarCommand } from "./backup-format";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (Docker).
}

function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

const HEADER = BACKUP_MAGIC.length + 16 + 12;
const TAG = 16;

async function main() {
  const file = path.resolve(option("file"));
  const to = path.resolve(option("to") || "restored");
  if (!option("file") || !existsSync(file)) throw new Error("Pass --file with an existing .dorabak backup.");
  if (existsSync(to)) throw new Error(`${to} already exists. Choose a new folder; restore never overwrites.`);

  const handle = await open(file, "r");
  let header: Buffer;
  let tag: Buffer;
  let size: number;
  try {
    size = (await handle.stat()).size;
    if (size < HEADER + TAG) throw new Error("This is not a DORA backup (file too small).");
    header = Buffer.alloc(HEADER);
    tag = Buffer.alloc(TAG);
    await handle.read(header, 0, HEADER, 0);
    await handle.read(tag, 0, TAG, size - TAG);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error("This is not a DORA backup (wrong header).");
  const salt = header.subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + 16);
  const iv = header.subarray(BACKUP_MAGIC.length + 16, HEADER);
  const key = backupKey(process.env.DORA_BACKUP_PASSPHRASE || "", salt);
  const body = () => createReadStream(file, { start: HEADER, end: size - TAG - 1 });

  // Pass 1: check the authentication tag over the whole file before extracting anything.
  const verifier = createDecipheriv("aes-256-gcm", key, iv);
  verifier.setAuthTag(tag);
  try {
    await pipeline(body(), verifier, async function (plain: AsyncIterable<Buffer>) {
      for await (const chunk of plain) void chunk;
    });
  } catch {
    throw new Error("The backup could not be verified: wrong DORA_BACKUP_PASSPHRASE or the file was modified.");
  }

  // Pass 2: the file is authentic; decrypt again and unpack.
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  // Unpack into a temporary sibling folder; it only becomes `to` after the tag has verified.
  const temp = await mkdtemp(path.join(path.dirname(to), ".dora-restore-"));
  try {
    const tar = spawn(tarCommand(), ["-xzf", "-", "-C", temp], { stdio: ["pipe", "ignore", "pipe"] });
    let tarError = "";
    tar.stderr.on("data", (chunk) => (tarError += chunk.toString()));
    const tarDone = new Promise<void>((resolve, reject) => {
      tar.on("error", reject);
      tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}: ${tarError.trim()}`))));
    });
    try {
      await Promise.all([pipeline(body(), decipher, tar.stdin), tarDone]);
    } catch (error) {
      tar.kill();
      const tarFailure = await tarDone.then(() => null, (failure: Error) => failure);
      const message = error instanceof Error ? error.message : String(error);
      if (/auth|unable to authenticate/i.test(message)) throw new Error("The backup could not be verified: wrong DORA_BACKUP_PASSPHRASE or the file was modified.");
      throw tarFailure && tarError.trim() ? tarFailure : error;
    }
    await rename(temp, to);
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
  console.log(`Backup verified and unpacked to ${to}`);
  console.log("Next: stop DORA, replace the database file and the storage folder with these, then start DORA with the same DORA_DATA_KEY.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
