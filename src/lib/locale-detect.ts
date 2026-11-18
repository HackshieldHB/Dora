export function localeFromCountry(code: string | null | undefined): "en" | "id" | null {
  if (!code) return null;
  return code.toUpperCase() === "ID" ? "id" : "en";
}

export function localeFromLanguage(language: string | null | undefined): "en" | "id" {
  return language?.toLowerCase().startsWith("id") ? "id" : "en";
}

export async function localeFromIp(headers: Headers): Promise<"en" | "id" | null> {
  const country = headers.get("cf-ipcountry") || headers.get("x-vercel-ip-country");
  if (country) return localeFromCountry(country);
  try {
    const response = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(1200), cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { success?: boolean; country_code?: string };
    if (!data.success) return null;
    return localeFromCountry(data.country_code);
  } catch {
    return null;
  }
}
