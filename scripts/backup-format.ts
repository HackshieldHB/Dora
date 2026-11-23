import { scryptSync } from "node:crypto";
import path from "node:path";

/** Shared by backup.ts and restore.ts. File layout: MAGIC | salt (16) | IV (12) | ciphertext | tag (16). */
export const BACKUP_MAGIC = Buffer.from("DORABAK1", "ascii");
export const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function backupKey(passphrase: string, salt: Buffer): Buffer {
  if (passphrase.length < 16) throw new Error("DORA_BACKUP_PASSPHRASE must be set and at least 16 characters long.");
  return scryptSync(passphrase, salt, 32, SCRYPT);
}

/**
 * The system tar. On Windows, use the built-in bsdtar explicitly: a GNU tar from Git/MSYS earlier on
 * PATH reads "C:\..." as a remote host and fails.
 */
export function tarCommand(): string {
  return process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
}
