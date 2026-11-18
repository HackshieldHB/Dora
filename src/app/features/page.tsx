import { cookies, headers } from "next/headers";
import { FeaturesPage } from "@/components/features-page";

export default async function Features() {
  const saved = (await cookies()).get("dora_lang")?.value;
  const detected = (await headers()).get("x-dora-locale");
  const locale = saved === "id" || saved === "en" ? saved : detected === "id" || detected === "en" ? detected : "en";
  return <FeaturesPage locale={locale} locked={Boolean(saved || detected)} />;
}
