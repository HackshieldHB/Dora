import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { loadPph21Rows } from "@/server/pph21-table";

const COLUMNS = ["Tax period", "Employee ID", "Employee name", "PTKP", "TER category / method", "Gross income", "PPh 21", "Calculation status"];

export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.permissions.has("reports.export") && !ctx.permissions.has("tax.export") && !ctx.permissions.has("tax.view")) {
    return NextResponse.json({ error: "Export permission is required." }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const rows = await loadPph21Rows(ctx.companyId, { period: params.get("period") || "", employee: params.get("employee") || "", status: params.get("status") || "" });
  const body = rows.map((row) => [row.period, row.employeeCode, row.name, row.ptkp, row.method, String(row.gross), String(row.pph21), row.status]);
  await audit(ctx, "report.export", "Report", "pph21", `${rows.length} rows`);
  if (params.get("format") === "pdf") {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([842, 595]);
    let y = 560;
    page.drawText("PPh 21 withholding", { x: 40, y, size: 16, font });
    y -= 28;
    for (const line of [COLUMNS.join(" | "), ...body.map((row) => row.join(" | "))]) {
      if (y < 40) {
        page = pdf.addPage([842, 595]);
        y = 560;
      }
      page.drawText(line.slice(0, 160), { x: 40, y, size: 8, font, color: rgb(0.1, 0.15, 0.2) });
      y -= 14;
    }
    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"pph21.pdf\"" } });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("PPh 21");
  sheet.addRow(COLUMNS);
  for (const row of body) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=\"pph21.xlsx\"" } });
}
