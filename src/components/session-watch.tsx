"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { translate } from "@/lib/i18n";

const OPEN = new Set(["/", "/login", "/features", "/session-expired"]);

export function SessionWatch() {
  const pathname = usePathname();
  const [warn, setWarn] = useState(false);
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    setLocale(document.documentElement.lang === "id" ? "id" : "en");
    let timer = 0;
    let gone = false;
    let cancelled = false;
    const arm = (expiresAt: number) => {
      window.clearInterval(timer);
      const tick = () => {
        const left = expiresAt - Date.now();
        if (left <= 60_000 && left > 0) setWarn(true);
        if (left <= 0 && !gone) {
          gone = true;
          window.location.assign("/session-expired");
        }
      };
      tick();
      timer = window.setInterval(tick, 1000);
    };
    fetch("/api/session", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          if (!OPEN.has(pathname)) window.location.assign("/session-expired");
          return;
        }
        const body = (await res.json()) as { expiresAt?: number };
        if (typeof body.expiresAt === "number") arm(body.expiresAt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  if (!warn) return null;
  return (
    <div role="status" className="session-toast max-w-xs rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.6)]">
      {translate(locale, "Your session is about to expire")}
    </div>
  );
}
