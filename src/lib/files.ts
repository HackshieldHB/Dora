import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { prisma } from "./db";

const root = path.join(process.cwd(), "storage", "uploads");

export async function saveEmployeeFile(input: { companyId: string; employeeId: string; file: File }) {
  if (!input.file || input.file.size === 0) throw new Error("The file is empty.");
  if (input.file.size > 2_000_000) throw new Error("The file must be 2 MB or smaller.");
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(input.file.type)) throw new Error("Upload a JPG, PNG, WEBP, or PDF file.");
  const ext = input.file.type === "application/pdf" ? ".pdf" : input.file.type === "image/png" ? ".png" : input.file.type === "image/webp" ? ".webp" : ".jpg";
  await mkdir(root, { recursive: true });
  const record = await prisma.storedFile.create({
    data: { companyId: input.companyId, employeeId: input.employeeId, path: "pending", name: input.file.name || `upload${ext}` },
  });
  const filename = `${record.id}${ext}`;
  await writeFile(path.join(root, filename), Buffer.from(await input.file.arrayBuffer()));
  await prisma.storedFile.update({ where: { id: record.id }, data: { path: filename } });
  return record.id;
}

export async function readStoredFile(id: string) {
  const record = await prisma.storedFile.findUnique({ where: { id } });
  if (!record || record.path === "pending") return null;
  const bytes = await readFile(path.join(root, record.path));
  return { record, bytes };
}
