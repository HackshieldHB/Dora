import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { prisma } from "./db";
import { decryptBytes, encryptBytes } from "./crypto";

const root = path.join(process.cwd(), "storage", "uploads");

/** Uploads are identified by their first bytes, not by the MIME type the browser claims. */
export function sniffUpload(bytes: Buffer): ".pdf" | ".png" | ".webp" | ".jpg" | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return ".pdf";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return ".webp";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  return null;
}

export async function saveEmployeeFile(input: { companyId: string; employeeId: string; file: File }) {
  if (!input.file || input.file.size === 0) throw new Error("The file is empty.");
  if (input.file.size > 2_000_000) throw new Error("The file must be 2 MB or smaller.");
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(input.file.type)) throw new Error("Upload a JPG, PNG, WEBP, or PDF file.");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const ext = sniffUpload(bytes);
  if (!ext) throw new Error("Upload a JPG, PNG, WEBP, or PDF file.");
  await mkdir(root, { recursive: true });
  const record = await prisma.storedFile.create({
    data: { companyId: input.companyId, employeeId: input.employeeId, path: "pending", name: input.file.name || `upload${ext}` },
  });
  const filename = `${record.id}${ext}`;
  // Stored encrypted (AES-256-GCM): copying the storage folder does not expose ID cards, payslips or photos.
  await writeFile(path.join(root, filename), encryptBytes(bytes), { mode: 0o600 });
  await prisma.storedFile.update({ where: { id: record.id }, data: { path: filename } });
  return record.id;
}

export async function readStoredFile(id: string) {
  const record = await prisma.storedFile.findUnique({ where: { id } });
  if (!record || record.path === "pending") return null;
  if (path.basename(record.path) !== record.path) return null;
  const bytes = decryptBytes(await readFile(path.join(root, record.path)));
  return { record, bytes };
}

/** Folder holding uploaded files (used by the encryption migration and backups). */
export const UPLOAD_ROOT = root;
