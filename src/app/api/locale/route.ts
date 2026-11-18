import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { localeFromIp } from "@/lib/locale-detect";

export async function GET(request: Request) {
  const saved = (await cookies()).get("dora_lang")?.value;
  if (saved === "id" || saved === "en") return NextResponse.json({ locale: saved, source: "saved" });
  const locale = await localeFromIp(request.headers);
  if (!locale) return NextResponse.json({ locale: null, source: "unknown" });
  const response = NextResponse.json({ locale, source: "ip" });
  response.cookies.set("dora_lang", locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
