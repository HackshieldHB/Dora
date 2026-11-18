export function localeFromCountry(code: string | null | undefined): "en" | "id" | null {
  if (!code) return null;
  return code.toUpperCase() === "ID" ? "id" : "en";
}

export function localeFromLanguage(language: string | null | undefined): "en" | "id" {
  return language?.toLowerCase().startsWith("id") ? "id" : "en";
}

/**
 * Picks the first-visit language without contacting any outside service:
 * a country header set by a CDN in front of the app, otherwise the browser's Accept-Language.
 * (An earlier version called ipwho.is, which leaked every visitor's IP to a third party.)
 */
export async function localeFromIp(headers: Headers): Promise<"en" | "id" | null> {
  const country = headers.get("cf-ipcountry") || headers.get("x-vercel-ip-country");
  if (country) return localeFromCountry(country);
  const language = headers.get("accept-language");
  if (language) return localeFromLanguage(language);
  return null;
}
