import { requireUser } from "@/lib/context";
import { visibleNav } from "@/lib/permissions";
import { moduleSections } from "@/lib/workspace";
import { ModuleBoard } from "@/components/module-board";
import { Banner } from "@/components/ui";
import { timeJakarta, todayJakarta } from "@/lib/format";
import { translate } from "@/lib/i18n";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const text = (value: string) => translate(ctx.locale, value);
  const hour = Number(timeJakarta().slice(0, 2));
  const greeting = text(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  const who = ctx.fullName.includes("@") ? ctx.fullName.split("@")[0] : (ctx.fullName.split(" ")[0] || ctx.fullName);
  const sections = moduleSections(visibleNav(ctx.permissions, Boolean(ctx.employeeId)));
  return (
    <div className="launcher">
      <Banner error={params.error} ok={params.ok} />
      <section className="launcher-hello">
        <p className="eyebrow">{todayJakarta()} · {ctx.companyName}</p>
        <h1>{greeting}, {who}</h1>
        <p>{text("Access your workspace and employee services.")}</p>
      </section>
      <ModuleBoard sections={sections} locale={ctx.locale} />
    </div>
  );
}
