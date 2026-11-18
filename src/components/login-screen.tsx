"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Logo } from "./logo";
import { translate } from "@/lib/i18n";
import { useAutoLocale } from "./use-auto-locale";

export function LoginScreen({
  action,
  locale,
  locked,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  locale: "en" | "id";
  locked: boolean;
  error?: string;
}) {
  const language = useAutoLocale(locale, locked);
  const [showPassword, setShowPassword] = useState(false);
  const text = (value: string) => translate(language, value);

  const features = [
    { title: text("Location-based Check-ins"), body: text("Secure attendance logging with verified geolocation and photo capture."), icon: <PinIcon /> },
    { title: text("Automated Approval Workflows"), body: text("Instant routing for leave and overtime requests directly to line managers."), icon: <CalendarIcon /> },
    { title: text("On-Demand Financial Overview"), body: text("Clear insight into your net pay, allowances, and tax deductions with single-tap access."), icon: <SlipIcon /> },
  ];

  return (
    <main className="min-h-screen bg-[#f3f7f6] lg:grid lg:grid-cols-2">
      <section className="relative overflow-hidden bg-[#1b2428] text-white lg:min-h-screen">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(15,118,110,0.55),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(125,222,200,0.28),transparent_46%),linear-gradient(#243036,#1b2428)]" />
        <div className="relative flex items-center gap-3 px-6 py-5 lg:px-12 lg:pt-10">
          <Logo size={36} />
          <div>
            <div className="text-sm font-semibold tracking-wide">DORA</div>
            <div className="text-xs text-white/60">{text("Digital Organization & Resource Assistant")}</div>
          </div>
        </div>
        <div className="relative hidden max-w-xl flex-col justify-center px-12 pb-16 lg:flex lg:min-h-[calc(100vh-88px)]">
          <h1 className="max-w-[14ch] text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">{accentLast(text("Work, attendance, and payroll. Unified."))}</h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">{text("Streamline daily check-ins, leave requests, and payroll access in a single workspace.")}</p>
          <ul className="mt-10 grid gap-3">
            {features.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#243036]/70 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0f766e]/25 text-[#7ddec8]">{feature.icon}</span>
                <span>
                  <strong className="block text-sm font-semibold">{feature.title}</strong>
                  <span className="mt-1 block text-sm leading-relaxed text-white/70">{feature.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <form action={action} className="w-full max-w-[420px] rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)] sm:p-8">
          <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-900">{text("Welcome back")}</h2>
          <p className="mt-1 text-sm text-slate-500">{text("Use the email and password for your DORA account.")}</p>
          {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{text(error)}</p> : null}

          <label className="mt-6 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{text("Email")}</span>
            <span className="relative block">
              <MailIcon />
              <input name="email" type="email" required autoComplete="username" placeholder="name@company.com" className="!h-12 w-full !rounded-xl !border !border-slate-200 bg-white !py-0 !pl-11 !pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:!border-[#0f766e] focus:!ring-4 focus:!ring-[#0f766e]/15" />
            </span>
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{text("Password")}</span>
            <span className="relative block">
              <LockIcon />
              <input name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" className="!h-12 w-full !rounded-xl !border !border-slate-200 bg-white !py-0 !pl-11 !pr-12 text-sm text-slate-900 outline-none transition focus:!border-[#0f766e] focus:!ring-4 focus:!ring-[#0f766e]/15" />
              <button type="button" className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label={text(showPassword ? "Hide password" : "Show password")} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
          </label>

          <SignInButton label={text("Sign in")} pendingLabel={text("Signing in…")} />
        </form>
      </section>
    </main>
  );
}

function accentLast(value: string) {
  const index = value.lastIndexOf(" ");
  if (index < 0) return value;
  return <>{value.slice(0, index + 1)}<span className="text-[#7ddec8]">{value.slice(index + 1)}</span></>;
}

function SignInButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="mt-5 h-12 w-full rounded-xl bg-[#0f766e] text-sm font-semibold text-white shadow-[0_10px_20px_-12px_#0f766e] transition hover:bg-[#115e59] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70" type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function MailIcon() {
  return <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
}
function LockIcon() {
  return <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}
function EyeIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOffIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.2M6.1 6.1C3.6 7.8 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.6-.7" /></svg>;
}
function PinIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
function CalendarIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
}
function SlipIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v5h5M9 13h6M9 17h6" /></svg>;
}
