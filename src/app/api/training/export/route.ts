import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCtx, hasPerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import { historyRows } from "@/server/training";

export async function GET() {
  const ctx = await getCtx();
  if (!ctx || (!hasPerm(ctx, "training.export") && !(hasPerm(ctx, "training.view") && hasPerm(ctx, "reports.export")) && !hasPerm(ctx, "training.manage"))) {
    return NextResponse.json({ error: "Export permission is required." }, { status: 403 });
  }
  const rows = await historyRows(ctx);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Training");
  sheet.addRow(["training", "date", "category", "employee", "department", "attendance", "status", "overall", "comment"]);
  for (const row of rows) {
    sheet.addRow([
      row.training.name,
      row.training.sessionDate,
      row.training.category,
      row.employee.fullName,
      row.employee.department?.name || "",
      row.attendance,
      row.status,
      row.evaluation?.overall ?? "",
      row.evaluation?.comment || "",
    ]);
  }
  await audit(ctx, "training.export", "Training", "", `${rows.length} rows`);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=training.xlsx",
    },
  });
}
