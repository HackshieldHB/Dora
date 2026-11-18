import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Landing } from "@/components/landing";

export default async function Home() {
  const ctx = await getCtx();
  if (ctx) redirect("/overview");
  const saved = (await cookies()).get("dora_lang")?.value;
  const detected = (await headers()).get("x-dora-locale");
  const locale = saved === "id" || saved === "en" ? saved : detected === "id" || detected === "en" ? detected : "en";
  return <Landing locale={locale} locked={Boolean(saved || detected)} />;
}
