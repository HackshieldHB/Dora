import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { listEmployees } from "@/server/people";

export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx?.permissions.has("employees.export")) return NextResponse.json({ error: "Export permission is required." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const rows = await listEmployees(ctx, {
    q: params.get("q") || "",
    status: params.get("status") || "",
    branchId: params.get("branchId") || "",
    departmentId: params.get("departmentId") || "",
    locationId: params.get("locationId") || "",
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow(["employeeCode", "fullName", "email", "status", "department", "position", "branch", "location"]);
  for (const row of rows) sheet.addRow([row.employeeCode, row.fullName, row.email, row.status, row.department?.name || "", row.position?.name || "", row.branch?.name || "", row.location?.name || ""]);
  await audit(ctx, "employee.export", "Employee", "", `${rows.length} rows`);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=employees.xlsx",
    },
  });
}
