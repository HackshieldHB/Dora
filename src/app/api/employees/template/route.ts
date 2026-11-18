import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/db";

const HEADERS = [
  "ID Karyawan*", "Nama Lengkap*", "Email Kerja*", "Nomor Telepon", "Status Karyawan", "Departemen", "Jabatan",
  "Role / Hak Akses Sistem", "Cabang", "Lokasi Kerja", "Atasan Langsung (ID Karyawan)", "Tanggal Bergabung", "Tanggal Lahir",
  "Jenis Kepegawaian", "Akhir Kontrak", "NIK", "NPWP", "Status PTKP", "Bank", "Nomor Rekening", "Gaji Pokok",
  "Terdaftar BPJS Kesehatan", "Nomor Peserta BPJS Kesehatan", "Kelas Perawatan", "Tanggal Mulai BPJS Kesehatan",
  "Terdaftar BPJS Ketenagakerjaan", "Nomor Peserta BPJS TK", "JHT", "JKK", "JKM", "JP", "Tanggal Mulai BPJS TK",
  "Status Pajak", "Mulai Berlaku PTKP",
];

function list(sheet: string, column: string, length: number) {
  const end = Math.max(2, length + 1);
  return [`${sheet}!$${column}$2:$${column}$${end}`];
}

export async function GET() {
  const ctx = await getCtx();
  if (!ctx?.companyId || !ctx.permissions.has("employees.manage")) return NextResponse.json({ error: "Import permission is required." }, { status: 403 });
  const [departments, positions, branches, locations, roles] = await Promise.all([
    prisma.department.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    prisma.workLocation.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ where: { companyId: ctx.companyId, active: true, key: { notIn: ["company_admin", "platform"] } }, orderBy: { name: "asc" } }),
  ]);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const column of [1, 4, 16, 17, 20, 23, 27]) sheet.getColumn(column).numFmt = "@";
  for (const column of [12, 13, 15, 25, 32, 34]) sheet.getColumn(column).numFmt = "yyyy-mm-dd";
  HEADERS.forEach((_, index) => { sheet.getColumn(index + 1).width = 28; });
  const reference = workbook.addWorksheet("Reference");
  reference.addRow(["Status Karyawan", "Departemen", "Jabatan", "Role", "Cabang", "Lokasi Kerja", "Jenis Kepegawaian", "Status PTKP", "Ya/Tidak", "Status Pajak", "Kelas Perawatan"]);
  const statuses = ["Aktif", "Nonaktif"];
  const types = ["Tetap", "Kontrak", "Percobaan"];
  const ptkp = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];
  const yes = ["Ya", "Tidak"];
  const tax = ["Pegawai Tetap", "Pegawai Tidak Tetap"];
  const classes = ["1", "2", "3"];
  const length = Math.max(departments.length, positions.length, branches.length, locations.length, roles.length, ptkp.length);
  for (let index = 0; index < length; index += 1) {
    reference.addRow([
      statuses[index] || "",
      departments[index]?.name || "",
      positions[index]?.name || "",
      roles[index]?.name || "",
      branches[index]?.name || "",
      locations[index]?.name || "",
      types[index] || "",
      ptkp[index] || "",
      yes[index] || "",
      tax[index] || "",
      classes[index] || "",
    ]);
  }
  const last = 500;
  const lists = sheet as ExcelJS.Worksheet & { dataValidations: { add: (range: string, rule: { type: "list"; allowBlank: boolean; formulae: string[] }) => void } };
  const validation = (column: string, formula: string[]) => {
    lists.dataValidations.add(`${column}2:${column}${last}`, { type: "list", allowBlank: true, formulae: formula });
  };
  validation("E", list("Reference", "A", statuses.length));
  validation("F", list("Reference", "B", departments.length));
  validation("G", list("Reference", "C", positions.length));
  validation("H", list("Reference", "D", roles.length));
  validation("I", list("Reference", "E", branches.length));
  validation("J", list("Reference", "F", locations.length));
  validation("N", list("Reference", "G", types.length));
  validation("R", list("Reference", "H", ptkp.length));
  for (const column of ["V", "Z", "AB", "AC", "AD", "AE"]) validation(column, list("Reference", "I", yes.length));
  validation("AG", list("Reference", "J", tax.length));
  validation("X", list("Reference", "K", classes.length));
  const guide = workbook.addWorksheet("Panduan Import");
  guide.getColumn(1).width = 120;
  for (const line of [
    "Satu baris adalah satu karyawan baru. Kolom bertanda * wajib diisi.",
    "Import hanya menambah karyawan baru. ID atau email yang sudah ada ditolak dan tidak menimpa data lama.",
    "Karyawan baru tetap berstatus Draft. Import tidak membuat akun login dan tidak mengubah hak akses yang sudah tersimpan.",
    "Role harus sama dengan nama role yang sudah ada di DORA. Role yang tidak aktif tidak dapat dipilih.",
    "Atasan Langsung diisi dengan ID Karyawan, bukan nama.",
    "Tanggal memakai format yyyy-mm-dd atau dd-mm-yyyy.",
    "ID Karyawan, Nomor Telepon, NIK, NPWP, nomor rekening, dan nomor BPJS harus tetap teks agar angka nol di depan tidak hilang.",
    "Nomor peserta BPJS wajib diisi hanya jika kolom terdaftar berisi Ya.",
    "Gaji Pokok hanya tersimpan jika pengguna yang mengimpor punya izin melihat gaji.",
  ]) guide.addRow([line]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"Template List Employee DORA Enhanced.xlsx\"",
    },
  });
}
