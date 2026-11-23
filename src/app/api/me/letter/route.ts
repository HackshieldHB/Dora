import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/db";
import { todayJakarta } from "@/lib/format";
import { contentDisposition } from "@/lib/http";

export async function GET() {
  const ctx = await getCtx();
  if (!ctx?.employeeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employee = await prisma.employee.findUnique({
    where: { id: ctx.employeeId },
    include: { company: true, position: true, department: true },
  });
  if (!employee || employee.status === "DRAFT") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 760;
  const draw = (text: string, size = 12, use = font) => {
    page.drawText(text.slice(0, 90), { x: 64, y, size, font: use, color: rgb(0.09, 0.13, 0.2) });
    y -= size + 10;
  };
  draw(employee.company.name, 12, bold);
  y -= 12;
  draw("Surat keterangan kerja", 18, bold);
  y -= 8;
  draw(`${employee.company.name} confirms that the person named below is employed as stated.`, 12);
  y -= 8;
  draw(`Name: ${employee.fullName}`, 12, bold);
  draw(`Employee ID: ${employee.employeeCode}`);
  draw(`Position: ${employee.position?.name || "—"}`);
  draw(`Division: ${employee.department?.name || "—"}`);
  draw(`Join date: ${employee.joinDate || "—"}`);
  draw(`Employment: ${employee.employmentType}`);
  y -= 8;
  draw("This letter does not state salary, bank details, or tax numbers.", 11);
  y -= 16;
  draw(todayJakarta(), 11);
  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition("attachment", `surat-keterangan-${employee.employeeCode}.pdf`),
    },
  });
}
