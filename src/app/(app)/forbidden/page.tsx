import { requireUser } from "@/lib/context";
import { translate } from "@/lib/i18n";

export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const t = (value: string) => translate(ctx.locale, value);
  return <div className="card callout-bad"><h1>{t("Access denied")}</h1><p>{t("Your role does not include this action. Hiding a menu is not the only check; the server refused this page.")}{params.need ? ` (${params.need})` : ""}</p></div>;
}
