import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { buildReport } from "@/server/reports";
import { currentMonth, monthBounds } from "@/lib/format";

export async function GET(request: NextRequest, context: { params: Promise<{ category: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.permissions.has("reports.export") && !ctx.permissions.has("tax.export")) {
    return NextResponse.json({ error: "Export permission is required." }, { status: 403 });
  }
  const { category } = await context.params;
  const params = request.nextUrl.searchParams;
  const bounds = monthBounds(params.get("month") || currentMonth());
  try {
    const table = await buildReport(ctx, category, {
      from: params.get("from") || bounds.start,
      to: params.get("to") || bounds.end,
      branchId: params.get("branchId") || "",
      departmentId: params.get("departmentId") || "",
      locationId: params.get("locationId") || "",
    });
    await audit(ctx, "report.export", "Report", category, `${table.rows.length} rows`);
    if (params.get("format") === "pdf") {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      let page = pdf.addPage([842, 595]);
      let y = 560;
      page.drawText(table.title, { x: 40, y, size: 16, font });
      y -= 28;
      const lines = [table.columns.join(" | "), ...table.rows.map((row) => row.join(" | "))];
      for (const line of lines) {
        if (y < 40) {
          page = pdf.addPage([842, 595]);
          y = 560;
        }
        page.drawText(line.slice(0, 140), { x: 40, y, size: 9, font, color: rgb(0.1, 0.15, 0.2) });
        y -= 14;
      }
      const bytes = await pdf.save();
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${category}.pdf"` } });
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(table.title.slice(0, 31));
    sheet.addRow(table.columns);
    for (const row of table.rows) sheet.addRow(row);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${category}.xlsx"` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 400 });
  }
}
