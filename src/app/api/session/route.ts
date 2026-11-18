import { NextResponse } from "next/server";
import { sessionEndsAt } from "@/lib/context";

export async function GET() {
  const expiresAt = await sessionEndsAt();
  if (!expiresAt) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, expiresAt });
}
