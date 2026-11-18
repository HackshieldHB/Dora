"use client";

import Link from "next/link";
import { CalendarCheck, Clock, MapPin, ShieldCheck, Users, Wallet } from "lucide-react";
import { Logo } from "./logo";
import { translate } from "@/lib/i18n";
import { useAutoLocale } from "./use-auto-locale";

const features = [
  {
    title: "Location-based Check-ins",
    body: "Secure attendance logging with verified geolocation and photo capture.",
    icon: MapPin,
    tint: "bg-indigo-50 text-[#0f766e]",
  },
  {
    title: "Automated Approval Workflows",
    body: "Instant routing for leave and overtime requests directly to line managers.",
    icon: CalendarCheck,
    tint: "bg-teal-50 text-teal-700",
  },
  {
    title: "On-Demand Financial Overview",
    body: "Clear insight into your net pay, allowances, and tax deductions with single-tap access.",
    icon: Wallet,
    tint: "bg-amber-50 text-amber-700",
  },
  {
    title: "Employee Records & Directory",
    body: "Unified database for onboarding, team structures, and employment history.",
    icon: Users,
    tint: "bg-sky-50 text-sky-700",
  },
] as const;

export function Landing({ locale, locked }: { locale: "en" | "id"; locked: boolean }) {
  const language = useAutoLocale(locale, locked);
  const text = (value: string) => translate(language, value);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <Logo size={32} />
          <span className="text-sm font-semibold tracking-wide">DORA</span>
          <span className="hidden rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#0f766e] sm:inline">{text("Enterprise Ready")}</span>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-[#0f766e]">{text("WORKFORCE OPERATIONS PLATFORM")}</p>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">{text("Work, attendance, and payroll. Unified.")}</h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">{text("Streamline daily check-ins, leave requests, and payroll access in a single workspace.")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0f766e] px-5 text-sm font-semibold !text-white shadow-[0_12px_24px_-14px_#0f766e] transition hover:bg-[#115e59] active:scale-[0.98]">{text("Sign in to Workspace")}</Link>
            <Link href="/features" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">{text("Explore features")}</Link>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute -left-8 top-8 h-40 w-40 rounded-full bg-[#0f766e]/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-6 bottom-4 h-40 w-40 rounded-full bg-teal-300/30 blur-3xl" />
          <div className="relative rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_30px_70px_-36px_rgba(15,23,42,0.55)] backdrop-blur-md sm:p-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-[#0f766e]"><Clock size={18} /></span>
                  <div>
                    <div className="text-sm font-semibold">{text("Ready to clock in")}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{text("GPS verified")}</div>
                  </div>
                </div>
                <ShieldCheck size={18} className="text-emerald-600" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{text("Pending approvals")}</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span>{text("Leave")}</span><span className="text-slate-400">2</span></div>
                  <div className="flex items-center justify-between"><span>{text("Overtime")}</span><span className="text-slate-400">{text("Today")}</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{text("Payslip")}</div>
                <div className="mt-3 text-sm font-semibold">{text("PIN required")}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-[#0f766e]" /></div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">{text("Next shift")}</span>
              <span className="font-semibold">08:00–17:00</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-28px_rgba(15,23,42,0.45)]">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${feature.tint}`}><Icon size={18} /></span>
                <h2 className="mt-4 text-base font-semibold tracking-[-0.02em]">{text(feature.title)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text(feature.body)}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
