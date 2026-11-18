import { cookies, headers } from "next/headers";
import { login } from "@/server/auth";
import { isNextRedirect } from "@/lib/context";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  try {
    await login(email, password);
    redirect("/overview");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : "Sign-in failed.")}`);
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const saved = (await cookies()).get("dora_lang")?.value;
  const detected = (await headers()).get("x-dora-locale");
  const locale = saved === "id" || saved === "en" ? saved : detected === "id" || detected === "en" ? detected : "en";
  return <LoginScreen action={signIn} locale={locale} locked={Boolean(saved || detected)} error={params.error} />;
}
