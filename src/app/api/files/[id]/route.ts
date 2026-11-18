import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { readStoredFile } from "@/lib/files";
import { prisma } from "@/lib/db";
import { employeeWhere } from "@/server/scope";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const stored = await readStoredFile(id);
  if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = await prisma.employee.findFirst({ where: { AND: [{ id: stored.record.employeeId }, employeeWhere(ctx)] } });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(stored.bytes, {
    headers: {
      "Content-Type": stored.record.path.endsWith(".pdf") ? "application/pdf" : stored.record.path.endsWith(".png") ? "image/png" : stored.record.path.endsWith(".webp") ? "image/webp" : "image/jpeg",
      "Content-Disposition": `inline; filename="${stored.record.name}"`,
    },
  });
}
