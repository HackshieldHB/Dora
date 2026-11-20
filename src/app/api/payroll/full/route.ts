import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/db";
import { fullPayrollColumn } from "@/lib/domain";

const HEADERS = [
  "Nomor Induk Karyawan", "Nama Karyawan", "Perusahaan", "Departement", "divisi", "Pangkat", "Nama Jabatan", "Lokasi", "Pusat Biaya",
  "Tipe Status Karyawan", "Tanggal Mulai", "Tanggal Terakhir Bekerja", "NPWP", "PTKP", "Jenis Kelamin", "Tahun", "Bulan",
  "A01 - Gaji Pokok", "A03 - Tunjangan Transport dan Makan", "A06 - Tunjangan Sewa Motor", "A08 - Insentif Marketing", "A21 - Tunjangan Jabatan Individu",
  "B03 - Tunj. Pajak", "L01 - Lembur", "TUL - Tunjangan Lainnya", "Total Penghasilan THP",
  "D01 - Alpha", "D02 - Potongan Keterlambatan", "D03 - Jaminan Hari Tua - Pekerja", "D05 - Iuran Pensiun - Pekerja", "D07 - BPJS Kesehatan - Pekerja",
  "D09 - Pajak", "PG - Potongan Ganti Rugi", "PP - Potongan Pinjaman", "PTL1 - Potongan Lain - Lain", "Total Potongan THP",
  "B05 - Jaminan Kecelakaan Kerja", "B07 - Jaminan Kematian", "B09 - Jaminan Hari Tua - Pemberi Kerja", "B11 - Iuran Pensiun - Pemberi Kerja", "B13 - BPJS Kesehatan - Pemberi Kerja",
  "Total Penghasilan Non THP", "Total Potongan Non THP", "Total Potongan THP", "THP", "Nama Pemilik", "Nomor rekening", "Bank",
];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function dateText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function csv(value: string | number | null) {
  if (value == null || value === "") return "";
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

export async function GET(request: Request) {
  const ctx = await getCtx();
  if (!ctx?.companyId || (!ctx.permissions.has("payroll.prepare") && !ctx.permissions.has("payroll.publish") && !ctx.permissions.has("reports.payroll"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: url.searchParams.get("period") || "", companyId: ctx.companyId, status: "LOCKED" } });
  if (!period) return NextResponse.json({ error: "A full payroll report is available only for a locked payroll." }, { status: 404 });
  const items = await prisma.payrollItem.findMany({
    where: { periodId: period.id },
    include: { employee: { include: { department: { include: { parent: true } }, position: true, location: true, branch: true, company: true } } },
    orderBy: { employee: { fullName: "asc" } },
  });
  const month = Number(period.startDate.slice(5, 7));
  const rows = items.map((item) => {
    const amounts = new Map<string, number>();
    const lines = JSON.parse(item.breakdown || "[]") as { name: string; kind: string; amount: number }[];
    for (const line of lines) {
      const code = fullPayrollColumn(line);
      if (!code) continue;
      amounts.set(code, (amounts.get(code) || 0) + line.amount);
    }
    const value = (code: string) => amounts.has(code) ? amounts.get(code)! : null;
    const employee = item.employee;
    return [
      employee.employeeCode,
      employee.fullName,
      employee.company.name,
      employee.department?.name || "",
      employee.department?.parent?.name || "",
      "",
      employee.position?.name || "",
      employee.location?.name || employee.branch?.name || "",
      "",
      employee.employmentType,
      dateText(employee.joinDate),
      dateText(employee.lastWorkingDay),
      employee.npwp ? "Ya" : "Tidak",
      employee.ptkp,
      "",
      period.startDate.slice(0, 4),
      MONTHS[month - 1] || "",
      value("A01"), value("A03"), value("A06"), value("A08"), value("A21"), value("B03"), value("L01"), value("TUL"), item.gross,
      value("D01"), value("D02"), value("D03"), value("D05"), value("D07"), value("D09"), value("PG"), value("PP"), value("PTL1"), item.deduction,
      null, null, null, null, null, null, null,
      item.deduction,
      item.net,
      employee.fullName,
      employee.bankAccount,
      employee.bankName,
    ];
  });
  if (url.searchParams.get("format") === "csv") {
    const body = [HEADERS.map(csv).join(","), ...rows.map((row) => row.map(csv).join(","))].join("\r\n");
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${period.id}.csv"` } });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payroll");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payroll-${period.id}.xlsx"`,
    },
  });
}
