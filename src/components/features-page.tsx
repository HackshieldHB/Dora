"use client";

import Link from "next/link";
import { CalendarCheck, Clock, MapPin, ShieldCheck, Users, Wallet } from "lucide-react";
import { Logo } from "./logo";
import { translate } from "@/lib/i18n";
import { useAutoLocale } from "./use-auto-locale";

const modules = [
  {
    title: "Smart Attendance",
    body: "Clock in once a day from the office, a client site, or outside the office. Live clock-in checks the location and keeps a photo with the record.",
    use: "Use it when the day starts. A second clock-in on the same day is refused, and a future date cannot be selected.",
    icon: MapPin,
    tint: "bg-indigo-50 text-[#0f766e]",
  },
  {
    title: "Automated Approval Workflows",
    body: "Leave and overtime requests go straight to the line manager. The manager approves or rejects them in the same queue.",
    use: "Use it when someone asks for leave or overtime. The requester can say whether a teammate will cover the leave.",
    icon: CalendarCheck,
    tint: "bg-teal-50 text-teal-700",
  },
  {
    title: "On-Demand Financial Overview",
    body: "Open a published payslip with a 6-digit PIN. Net pay, allowances, and tax deductions stay on the slip.",
    use: "Use it on payday. Without a PIN, the payslip page points to the profile where the PIN is set.",
    icon: Wallet,
    tint: "bg-amber-50 text-amber-700",
  },
  {
    title: "Employee Records & Directory",
    body: "One record for onboarding, the team, and employment history. Profile documents, the directory, and the org structure read from it.",
    use: "Use it when someone joins, moves team, or leaves. The directory shows the people you are allowed to see.",
    icon: Users,
    tint: "bg-sky-50 text-sky-700",
  },
] as const;

function Mock({ title, text }: { title: (typeof modules)[number]["title"]; text: (value: string) => string }) {
  if (title === "Smart Attendance") {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-[#0f766e]"><Clock size={18} /></span>
            <div>
              <div className="text-sm font-semibold">08:02</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{text("GPS verified")}</div>
            </div>
          </div>
          <ShieldCheck size={18} className="text-emerald-600" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
          <span className="rounded-xl bg-indigo-50 px-3 py-2 text-[#0f766e]">{text("Office")}</span>
          <span className="rounded-xl bg-slate-50 px-3 py-2">{text("Client site")}</span>
          <span className="rounded-xl bg-slate-50 px-3 py-2">{text("Outside the office")}</span>
        </div>
      </div>
    );
  }
  if (title === "Automated Approval Workflows") {
    return (
      <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4">
        {[["Leave", "2"], ["Overtime", "90"]].map(([label, meta]) => (
          <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <span className="font-medium">{text(label)}</span>
            <span className="text-slate-400">{meta}</span>
          </div>
        ))}
      </div>
    );
  }
  if (title === "On-Demand Financial Overview") {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{text("Payslip")}</div>
        <div className="mt-3 text-sm font-semibold">{text("PIN required")}</div>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <div className="flex justify-between"><span>{text("Net pay")}</span><span className="font-medium text-slate-900">••••</span></div>
          <div className="flex justify-between"><span>{text("Tax")}</span><span className="font-medium text-slate-900">••••</span></div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4">
      {["HR", "Field", "Payroll"].map((team) => (
        <div key={team} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">{team.slice(0, 1)}</span>
          <span className="text-sm font-medium">{team}</span>
        </div>
      ))}
    </div>
  );
}

export function FeaturesPage({ locale, locked }: { locale: "en" | "id"; locked: boolean }) {
  const language = useAutoLocale(locale, locked);
  const text = (value: string) => translate(language, value);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Logo size={32} />
            <span className="text-sm font-semibold tracking-wide">DORA</span>
            <span className="hidden rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#0f766e] sm:inline">{text("Enterprise Ready")}</span>
          </Link>
          <Link href="/login" className="inline-flex h-10 shrink-0 items-center rounded-xl bg-[#0f766e] px-4 text-sm font-semibold !text-white transition hover:bg-[#115e59] active:scale-[0.98]">{text("Sign in")}</Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#0f766e]">{text("WORKFORCE OPERATIONS PLATFORM")}</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">{text("Platform features")}</h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">{text("Four parts of the workday, in one place.")}</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-20">
        {modules.map((module, index) => {
          const Icon = module.icon;
          return (
            <article key={module.title} className="grid min-w-0 items-center gap-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.55)] lg:grid-cols-2 lg:p-8">
              <div className={`min-w-0 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${module.tint}`}><Icon size={20} /></span>
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">{text(module.title)}</h2>
                <p className="mt-3 text-base leading-relaxed text-slate-600">{text(module.body)}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{text(module.use)}</p>
              </div>
              <div className={`min-w-0 rounded-3xl bg-[#f4f5fb] p-4 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
                <Mock title={module.title} text={text} />
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
