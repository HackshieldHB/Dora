"use client";

import { useEffect, useState } from "react";
import { localeFromLanguage } from "@/lib/locale-detect";

function writeLocale(locale: "en" | "id") {
  document.cookie = `dora_lang=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function useAutoLocale(locale: "en" | "id", locked: boolean) {
  const [language, setLanguage] = useState<"en" | "id">(locale);

  useEffect(() => {
    if (locked) return;
    let cancel = false;
    (async () => {
      try {
        const response = await fetch("/api/locale");
        const data = (await response.json()) as { locale?: string | null };
        if (cancel) return;
        if (data.locale === "id" || data.locale === "en") {
          setLanguage(data.locale);
          return;
        }
      } catch {
        // The IP lookup did not answer. The browser language is the fallback.
      }
      if (cancel) return;
      const next = localeFromLanguage(navigator.language);
      writeLocale(next);
      setLanguage(next);
    })();
    return () => {
      cancel = true;
    };
  }, [locked]);

  return language;
}
