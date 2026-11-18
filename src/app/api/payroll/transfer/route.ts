import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/db";

function cell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

export async function GET(request: Request) {
  const ctx = await getCtx();
  if (!ctx?.companyId || (!ctx.permissions.has("payroll.prepare") && !ctx.permissions.has("payroll.publish"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const periodId = new URL(request.url).searchParams.get("period") || "";
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId: ctx.companyId, status: "LOCKED" } });
  if (!period) return NextResponse.json({ error: "A bank file is available only for a locked payroll." }, { status: 404 });
  const items = await prisma.payrollItem.findMany({ where: { periodId: period.id }, include: { employee: true }, orderBy: { employee: { fullName: "asc" } } });
  const format = new URL(request.url).searchParams.get("format") || "csv";
  const lines = format === "bca"
    ? ["No Rekening,Nama Penerima,Jumlah,Berita"]
    : format === "mandiri"
      ? ["Rekening,Nama,Amount,Remark,Bank"]
      : ["employee_code,name,bank,account,amount"];
  for (const item of items) {
    const remark = period.name;
    lines.push(format === "bca"
      ? [cell(item.employee.bankAccount), cell(item.employee.fullName), String(item.net), cell(remark)].join(",")
      : format === "mandiri"
        ? [cell(item.employee.bankAccount), cell(item.employee.fullName), String(item.net), cell(remark), "008"].join(",")
        : [cell(item.employee.employeeCode), cell(item.employee.fullName), cell(item.employee.bankName), cell(item.employee.bankAccount), String(item.net)].join(","));
  }
  const safe = period.name.replace(/[^\w.-]+/g, "-").slice(0, 40);
  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transfer-${safe}.csv"`,
    },
  });
}
