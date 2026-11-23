import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { readStoredFile } from "@/lib/files";
import { prisma } from "@/lib/db";
import { employeeWhere } from "@/server/scope";
import { contentDisposition } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const stored = await readStoredFile(id);
  if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = await prisma.employee.findFirst({ where: { AND: [{ id: stored.record.employeeId }, employeeWhere(ctx)] } });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = stored.record.path.endsWith(".pdf");
  return new NextResponse(new Uint8Array(stored.bytes), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : stored.record.path.endsWith(".png") ? "image/png" : stored.record.path.endsWith(".webp") ? "image/webp" : "image/jpeg",
      "Content-Disposition": contentDisposition("inline", stored.record.name),
      "X-Content-Type-Options": "nosniff",
      // Uploaded files are user-supplied. Images get a fully sandboxed policy. Browsers refuse to
      // render a PDF under `sandbox` or `object-src 'none'`, so PDFs get a policy that still allows
      // the built-in viewer but nothing else.
      "Content-Security-Policy": pdf
        ? "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'"
        : "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
