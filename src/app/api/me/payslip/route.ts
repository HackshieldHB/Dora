import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/db";
import { buildPayslipPdf } from "@/server/payslip-pdf";

export async function GET(request: Request) {
  const ctx = await getCtx();
  if (!ctx?.employeeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const periodId = new URL(request.url).searchParams.get("period") || "";
  const token = (await cookies()).get("dora_payslip")?.value;
  const grant = token ? await prisma.payslipGrant.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } }) : null;
  if (!grant || grant.userId !== ctx.userId || grant.periodId !== periodId || grant.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Open the payslip with your PIN first." }, { status: 403 });
  }
  const item = await prisma.payrollItem.findFirst({
    where: { periodId, employeeId: ctx.employeeId, period: { payslipPublished: true } },
    include: { period: true, employee: { include: { company: true } } },
  });
  if (!item) return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  const bytes = await buildPayslipPdf(item);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payslip-${item.period.payDate}.pdf"`,
    },
  });
}
