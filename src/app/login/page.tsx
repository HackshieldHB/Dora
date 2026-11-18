import { cookies, headers } from "next/headers";
import { KNOWN_LOGIN_MESSAGES, LOGIN_MESSAGES, login } from "@/server/auth";
import { isNextRedirect } from "@/lib/context";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { LICENSE_ENFORCED, licenseStatus } from "@/lib/license";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  try {
    await login(email, password);
    redirect("/overview");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error && KNOWN_LOGIN_MESSAGES.has(error.message) ? error.message : LOGIN_MESSAGES.failed;
    if (message === LOGIN_MESSAGES.failed) console.error("[DORA sign-in]", error);
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const saved = (await cookies()).get("dora_lang")?.value;
  const detected = (await headers()).get("x-dora-locale");
  const locale = saved === "id" || saved === "en" ? saved : detected === "id" || detected === "en" ? detected : "en";
  // Only messages DORA itself produces are shown, so the link cannot be used to display arbitrary text.
  const shown = params.error && KNOWN_LOGIN_MESSAGES.has(params.error) ? params.error : undefined;
  const license = LICENSE_ENFORCED ? await licenseStatus() : null;
  const error = license && !license.ok ? `${LOGIN_MESSAGES.license} ${license.reason}` : shown;
  return <LoginScreen action={signIn} locale={locale} locked={Boolean(saved || detected)} error={error} />;
}
