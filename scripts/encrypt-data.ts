/**
 * Encrypts existing plaintext data and re-encrypts data written under an older key.
 *
 *   npm run encrypt-data              apply
 *   npm run encrypt-data -- --dry-run only report what would change
 *
 * Safe to run more than once: values already encrypted with the current key are skipped.
 * Key rotation: put the old key in DORA_DATA_KEYS_PREVIOUS, set the new DORA_DATA_KEY, run this,
 * then the old key can be removed once this reports nothing left to do.
 * Take a backup first (`npm run backup`).
 */
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDataKey, currentKeyId, decryptBytes, decryptText, encryptBytes, encryptText, keyIdOf } from "../src/lib/crypto";
import { ENCRYPTED_FIELDS } from "../src/lib/field-crypto";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (Docker).
}

const dryRun = process.argv.includes("--dry-run");

const TABLES: { model: string; fields: string[] }[] = [
  { model: "employee", fields: ["nik", "npwp", "bankAccount", "bpjsHealthNo", "bpjsTkNo", "insuranceNo"] },
  { model: "company", fields: ["npwp"] },
  { model: "profileChange", fields: ["oldValue", "newValue"] },
  { model: "employmentEvent", fields: ["beforeJson", "afterJson"] },
  { model: "orgChange", fields: ["beforeJson", "afterJson"] },
  { model: "attendanceCorrection", fields: ["beforeJson", "afterJson"] },
];

type Delegate = {
  findMany(args: unknown): Promise<Record<string, string>[]>;
  update(args: unknown): Promise<unknown>;
};

function needsWork(value: string, keyId: string) {
  if (value === "") return false;
  return keyIdOf(value) !== keyId;
}

async function main() {
  assertDataKey();
  const keyId = currentKeyId();
  for (const table of TABLES) for (const field of table.fields) if (!ENCRYPTED_FIELDS.has(field)) throw new Error(`${table.model}.${field} is not in ENCRYPTED_FIELDS`);
  // A raw client, so values are seen exactly as stored and written exactly as computed here.
  const raw = new PrismaClient();
  let rows = 0;
  let values = 0;
  try {
    for (const table of TABLES) {
      const delegate = (raw as unknown as Record<string, Delegate>)[table.model];
      const select = Object.fromEntries([["id", true], ...table.fields.map((field) => [field, true])]);
      const records = await delegate.findMany({ select });
      let changedRows = 0;
      for (const record of records) {
        const data: Record<string, string> = {};
        for (const field of table.fields) {
          const value = record[field] ?? "";
          if (needsWork(value, keyId)) data[field] = encryptText(decryptText(value));
        }
        if (Object.keys(data).length === 0) continue;
        changedRows += 1;
        values += Object.keys(data).length;
        if (!dryRun) await delegate.update({ where: { id: record.id }, data });
      }
      rows += changedRows;
      console.log(`${table.model}: ${changedRows} of ${records.length} rows ${dryRun ? "need encryption" : "encrypted"}`);
    }
  } finally {
    await raw.$disconnect();
  }

  let files = 0;
  for (const folder of ["uploads", "imports"]) {
    const dir = path.join(process.cwd(), "storage", folder);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.endsWith(".tmp")) continue;
      const file = path.join(dir, name);
      if (folder === "imports") {
        const text = await readFile(file, "utf8");
        if (!needsWork(text, keyId)) continue;
        files += 1;
        if (!dryRun) {
          await writeFile(`${file}.tmp`, encryptText(decryptText(text)), { mode: 0o600 });
          await rename(`${file}.tmp`, file);
        }
        continue;
      }
      const bytes = await readFile(file);
      if (keyIdOf(bytes) === keyId) continue;
      files += 1;
      if (!dryRun) {
        // Write to a temporary file first, so an interruption never leaves a half-written upload.
        await writeFile(`${file}.tmp`, encryptBytes(decryptBytes(bytes)), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      }
    }
  }
  console.log(`files: ${files} ${dryRun ? "need encryption" : "encrypted"}`);
  console.log(`${dryRun ? "Dry run" : "Done"}: ${rows} rows / ${values} values, ${files} files. Current key id ${keyId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
