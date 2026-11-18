import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { localeFromIp } from "@/lib/locale-detect";

const open = ["/", "/login", "/features", "/session-expired", "/api/health", "/api/locale", "/api/session"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if ((pathname === "/" || pathname === "/login" || pathname === "/features") && !request.cookies.get("dora_lang")) {
    const locale = await localeFromIp(request.headers);
    if (locale) {
      const headers = new Headers(request.headers);
      headers.set("x-dora-locale", locale);
      const response = NextResponse.next({ request: { headers } });
      response.cookies.set("dora_lang", locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
      return response;
    }
  }
  if (open.some((path) => pathname === path) || pathname.startsWith("/_next")) return NextResponse.next();
  if (!request.cookies.get("dora_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
