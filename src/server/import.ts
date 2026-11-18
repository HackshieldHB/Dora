import { randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Ctx } from "@/lib/context";
import { importHeaderKey, planEmployeeImport } from "@/lib/domain";
import { placementError } from "@/lib/placement";
import { todayJakarta } from "@/lib/format";
import { normalizeNpwp } from "@/lib/domain";
import { hasPerm } from "@/lib/context";
import { decryptText, encryptText } from "@/lib/crypto";

const root = path.join(process.cwd(), "storage", "imports");

export type StagedEmployee = {
  row: number;
  code: string;
  name: string;
  status: string;
  department: string;
  branch: string;
  location: string;
  email: string;
  position: string;
  joinDate: string;
  phone: string;
  role: string;
  manager: string;
  birthDate: string;
  employmentType: string;
  contractEnd: string;
  nik: string;
  npwp: string;
  ptkp: string;
  bank: string;
  account: string;
  salary: string;
  healthOn: string;
  healthNo: string;
  healthClass: string;
  healthStart: string;
  tkOn: string;
  tkNo: string;
  jht: string;
  jkk: string;
  jkm: string;
  jp: string;
  tkStart: string;
  taxStatus: string;
  ptkpStart: string;
};

type StageFile = { companyId: string; userId: string; rows: StagedEmployee[] };

function stagePath(ctx: Ctx, batch: string) {
  if (!/^[a-f0-9]{24}$/.test(batch)) return "";
  return path.join(root, `${ctx.userId}-${batch}.json`);
}

async function readSheet(file: File): Promise<StagedEmployee[]> {
  const name = file.name || "";
  if (!name.toLowerCase().endsWith(".xlsx")) throw new Error("This file format is not supported. Use an .xlsx file.");
  const workbook = new ExcelJS.Workbook();
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("This file format is not supported. Use an .xlsx file.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheet.");
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = importHeaderKey(String(cell.text || ""));
    if (key) columns.set(key, column);
  });
  if (!columns.has("code")) throw new Error("The ID column is required.");
  const rows: StagedEmployee[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cell = (key: string) => {
      const column = columns.get(key);
      return column ? String(row.getCell(column).text || "").trim() : "";
    };
    const staged = {
      row: rowNumber,
      code: cell("code"),
      name: cell("name"),
      status: cell("status"),
      department: cell("department"),
      branch: cell("branch"),
      location: cell("location"),
      email: cell("email"),
      position: cell("position"),
      joinDate: cell("joinDate"),
      phone: cell("phone"),
      role: cell("role"),
      manager: cell("manager"),
      birthDate: cell("birthDate"),
      employmentType: cell("employmentType"),
      contractEnd: cell("contractEnd"),
      nik: cell("nik"),
      npwp: cell("npwp"),
      ptkp: cell("ptkp"),
      bank: cell("bank"),
      account: cell("account"),
      salary: cell("salary"),
      healthOn: cell("healthOn"),
      healthNo: cell("healthNo"),
      healthClass: cell("healthClass"),
      healthStart: cell("healthStart"),
      tkOn: cell("tkOn"),
      tkNo: cell("tkNo"),
      jht: cell("jht"),
      jkk: cell("jkk"),
      jkm: cell("jkm"),
      jp: cell("jp"),
      tkStart: cell("tkStart"),
      taxStatus: cell("taxStatus"),
      ptkpStart: cell("ptkpStart"),
    };
    if (!Object.values(staged).some((value, index) => index > 0 && value)) continue;
    rows.push(staged);
  }
  return rows;
}

export async function stageEmployeeImport(ctx: Ctx, file: File) {
  if (!ctx.companyId) throw new Error("Import belongs to a company.");
  if (!file || file.size === 0) throw new Error("Choose an Excel file.");
  const rows = await readSheet(file);
  if (rows.length === 0) throw new Error("The file has no employee rows.");
  const batch = randomBytes(12).toString("hex");
  await mkdir(root, { recursive: true });
  const payload: StageFile = { companyId: ctx.companyId, userId: ctx.userId, rows };
  // The staged rows hold NIK, NPWP and bank accounts, so the temporary file is encrypted too.
  await writeFile(stagePath(ctx, batch), encryptText(JSON.stringify(payload)), { mode: 0o600 });
  return batch;
}

export async function readEmployeeImport(ctx: Ctx, batch: string) {
  const file = stagePath(ctx, batch);
  if (!file) return null;
  try {
    const payload = JSON.parse(decryptText(await readFile(file, "utf8"))) as StageFile;
    if (payload.companyId !== ctx.companyId || payload.userId !== ctx.userId) return null;
    return payload.rows;
  } catch {
    return null;
  }
}

async function references(companyId: string) {
  const [departments, positions, branches, locations, employees, roles] = await Promise.all([
    prisma.department.findMany({ where: { companyId } }),
    prisma.position.findMany({ where: { companyId } }),
    prisma.branch.findMany({ where: { companyId } }),
    prisma.workLocation.findMany({ where: { companyId } }),
    prisma.employee.findMany({ where: { companyId }, select: { id: true, employeeCode: true, fullName: true, email: true, departmentId: true, positionId: true, branchId: true, locationId: true, joinDate: true, status: true } }),
    prisma.role.findMany({ where: { companyId } }),
  ]);
  return { departments, positions, branches, locations, employees, roles };
}

function isoDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  const parts = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const candidate = iso || (parts ? `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}` : "");
  if (!candidate) return null;
  const date = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate) return null;
  return candidate;
}

function yesNo(value: string): boolean | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return false;
  if (["ya", "yes", "y", "1", "true"].includes(raw)) return true;
  if (["tidak", "no", "n", "0", "false"].includes(raw)) return false;
  return null;
}

function employmentType(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return "PERMANENT";
  if (["permanent", "tetap", "karyawan tetap"].includes(raw)) return "PERMANENT";
  if (["contract", "kontrak"].includes(raw)) return "CONTRACT";
  if (["probation", "percobaan"].includes(raw)) return "PROBATION";
  return null;
}

function matchId(rows: { id: string; name: string }[], name: string) {
  return rows.find((row) => row.name.toLowerCase() === name.trim().toLowerCase())?.id || "";
}

export async function previewEmployeeImport(ctx: Ctx, batch: string) {
  const companyId = ctx.companyId;
  const rows = companyId ? await readEmployeeImport(ctx, batch) : null;
  if (!companyId || !rows) return null;
  const refs = await references(companyId);
  const plan = planEmployeeImport(rows, {
    departments: refs.departments.map((row) => row.name),
    branches: refs.branches.map((row) => row.name),
    locations: refs.locations.map((row) => row.name),
    positions: refs.positions.map((row) => row.name),
    existing: refs.employees.map((row) => row.employeeCode),
  });
  const emails = new Map<string, number>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (email) emails.set(email, (emails.get(email) || 0) + 1);
  }
  const knownCodes = new Set(refs.employees.map((row) => row.employeeCode.toLowerCase()));
  const draft = rows.map((row) => {
    const planned = plan.find((item) => item.row === row.row)!;
    if (planned.kind === "invalid") return { ...row, ...planned };
    const reasons: string[] = [];
    const email = row.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Email is required.");
    else if ((emails.get(email) || 0) > 1 || refs.employees.some((item) => item.email.toLowerCase() === email)) reasons.push("That email is already used.");
    for (const [label, value] of [["Join date", row.joinDate], ["Birth date", row.birthDate], ["Contract end", row.contractEnd], ["BPJS Kesehatan start", row.healthStart], ["BPJS Ketenagakerjaan start", row.tkStart], ["PTKP effective date", row.ptkpStart]] as const) {
      if (isoDate(value) == null) reasons.push(`${label} is not a valid date.`);
    }
    const health = yesNo(row.healthOn);
    const tk = yesNo(row.tkOn);
    if (health == null) reasons.push("Choose Ya or Tidak for BPJS Kesehatan.");
    if (tk == null) reasons.push("Choose Ya or Tidak for BPJS Ketenagakerjaan.");
    if (health && !row.healthNo.trim()) reasons.push("A BPJS Kesehatan number is required when the employee is enrolled.");
    if (tk && !row.tkNo.trim()) reasons.push("A BPJS Ketenagakerjaan number is required when the employee is enrolled.");
    for (const [label, value] of [["JHT", row.jht], ["JKK", row.jkk], ["JKM", row.jkm], ["JP", row.jp]] as const) {
      if (yesNo(value) == null) reasons.push(`Choose Ya or Tidak for ${label}.`);
    }
    if (row.npwp.trim()) {
      const parsed = normalizeNpwp(row.npwp);
      if (parsed.error) reasons.push(parsed.error);
    }
    if (row.salary.trim() && !/^\d+$/.test(row.salary.trim())) reasons.push("Basic salary must be a whole number.");
    if (employmentType(row.employmentType) == null) reasons.push("Employment type was not recognized.");
    if (row.location.trim()) {
      const location = refs.locations.find((item) => item.name.toLowerCase() === row.location.trim().toLowerCase());
      const branch = refs.branches.find((item) => item.name.toLowerCase() === row.branch.trim().toLowerCase());
      const placement = location ? placementError(branch?.id || "", location.branchId, false) : "";
      if (placement) reasons.push(placement);
    }
    if (row.status.trim() && !["aktif", "active", "nonaktif", "inactive", "draft", "probation", "contract", "permanent", "tetap", "kontrak", "percobaan"].includes(row.status.trim().toLowerCase())) reasons.push("Employee status was not recognized.");
    if (row.role.trim()) {
      const role = refs.roles.find((item) => item.name.toLowerCase() === row.role.trim().toLowerCase());
      if (!role) reasons.push("That role was not found.");
      else if (!role.active) reasons.push("That role is inactive.");
      else if (role.key === "company_admin" || role.key === "platform") reasons.push("That access role cannot be assigned from employee management.");
    }
    if (reasons.length) return { ...row, ...planned, kind: "invalid" as const, reason: reasons.join(" ") };
    return { ...row, ...planned };
  });
  return draft.map((row) => {
    if (row.kind === "invalid" || !row.manager.trim()) return row;
    const manager = row.manager.trim().toLowerCase();
    const exists = knownCodes.has(manager) || draft.some((item) => item.kind === "new" && item.code.toLowerCase() === manager && item.row !== row.row);
    if (!exists) return { ...row, kind: "invalid" as const, reason: "That supervisor ID was not found." };
    return row;
  });
}

export async function applyEmployeeImport(ctx: Ctx, batch: string) {
  const companyId = ctx.companyId;
  if (!companyId) throw new Error("Import belongs to a company.");
  const preview = await previewEmployeeImport(ctx, batch);
  if (!preview) throw new Error("This import preview has expired. Upload the file again.");
  const refs = await references(companyId);
  let added = 0;
  let failed = 0;
  const created = new Map<string, string>();
  for (const row of preview) {
    if (row.kind !== "new") {
      failed += 1;
      continue;
    }
    const departmentId = row.department ? matchId(refs.departments, row.department) : "";
    const branchId = row.branch ? matchId(refs.branches, row.branch) : "";
    const locationId = row.location ? matchId(refs.locations, row.location) : "";
    const positionId = row.position ? matchId(refs.positions, row.position) : "";
    const location = refs.locations.find((item) => item.id === locationId);
    if (location && placementError(branchId, location.branchId, false)) {
      failed += 1;
      continue;
    }
    const role = row.role.trim() ? refs.roles.find((item) => item.name.toLowerCase() === row.role.trim().toLowerCase()) : null;
    const manager = row.manager.trim() ? refs.employees.find((item) => item.employeeCode.toLowerCase() === row.manager.trim().toLowerCase()) : null;
    const health = yesNo(row.healthOn) === true;
    const tk = yesNo(row.tkOn) === true;
    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeCode: row.code,
        fullName: row.name,
        status: "DRAFT",
        email: row.email.trim().toLowerCase(),
        phone: row.phone,
        departmentId: departmentId || null,
        branchId: branchId || null,
        locationId: locationId || null,
        positionId: positionId || null,
        managerId: manager?.id || null,
        joinDate: isoDate(row.joinDate) || "",
        birthDate: isoDate(row.birthDate) || "",
        employmentType: employmentType(row.employmentType) || "PERMANENT",
        contractEnd: isoDate(row.contractEnd) || "",
        nik: row.nik,
        npwp: row.npwp.trim() ? normalizeNpwp(row.npwp).value : "",
        ptkp: row.ptkp || "TK/0",
        bankName: row.bank,
        bankAccount: row.account,
        ...(hasPerm(ctx, "employees.salary") && row.salary.trim() ? { basicSalary: Number(row.salary) } : {}),
        accessRoleId: role?.id || "",
        bpjsHealthNo: row.healthNo,
        bpjsHealthOn: health,
        bpjsHealthClass: row.healthClass,
        bpjsHealthStart: isoDate(row.healthStart) || "",
        bpjsTkNo: row.tkNo,
        bpjsTkOn: tk,
        bpjsJht: yesNo(row.jht) === true,
        bpjsJkk: yesNo(row.jkk) === true,
        bpjsJkm: yesNo(row.jkm) === true,
        bpjsJp: yesNo(row.jp) === true,
        bpjsTkStart: isoDate(row.tkStart) || "",
        taxStatus: row.taxStatus,
        ptkpStart: isoDate(row.ptkpStart) || "",
      },
    });
    created.set(row.code.toLowerCase(), employee.id);
    await prisma.employmentEvent.create({
      data: {
        employeeId: employee.id,
        changeType: "IMPORT",
        effectiveDate: todayJakarta(),
        beforeJson: "{}",
        afterJson: JSON.stringify({ employeeCode: row.code, fullName: row.name, status: "DRAFT" }),
        actorId: ctx.userId,
      },
    });
    added += 1;
  }
  for (const row of preview) {
    if (row.kind !== "new" || !row.manager.trim() || !created.has(row.code.toLowerCase())) continue;
    const managerId = created.get(row.manager.trim().toLowerCase());
    if (!managerId) continue;
    await prisma.employee.update({ where: { id: created.get(row.code.toLowerCase()) }, data: { managerId } });
  }
  await unlink(stagePath(ctx, batch)).catch(() => undefined);
  await audit(ctx, "employee.import", "Employee", "", `${added} added, ${failed} rejected`);
  return `${added} added, ${failed} rejected. Existing employees were not changed. New employees stay Draft until activation.`;
}

export async function cancelEmployeeImport(ctx: Ctx, batch: string) {
  const file = stagePath(ctx, batch);
  if (file) await unlink(file).catch(() => undefined);
  return "Import cancelled. No employee data was changed.";
}
