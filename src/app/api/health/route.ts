import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Liveness probe for Docker / the reverse proxy. Reveals nothing beyond up or down. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
