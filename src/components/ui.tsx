"use client";

import { SubmitButton } from "./submit";
import { statusLabel } from "@/lib/status";
import { TInput, useT } from "./locale";

const TONE: Record<string, string> = {
  ACTIVE: "ok",
  APPROVED: "ok",
  LOCKED: "ok",
  PRESENT: "ok",
  REVIEWED: "ok",
  SENT: "ok",
  LOGGED: "neutral",
  FAILED: "bad",
  EARLY: "info",
  APPROVED_LEAVE: "info",
  PROCESSED: "info",
  LEAVE: "info",
  OVERTIME: "warn",
  PROFILE: "info",
  PAYROLL: "info",
  LEAVE_CANCEL: "warn",
  DRAFT: "warn",
  OPEN: "info",
  SUBMITTED: "warn",
  ATTENDANCE: "info",
  LOAN: "warn",
  REIMBURSEMENT: "info",
  SHIFT: "info",
  TIMESHEET: "info",
  POSTED: "ok",
  PENDING: "warn",
  PENDING_REVIEW: "warn",
  "PENDING OFFBOARDING": "warn",
  RETURNED: "returned",
  NEEDS_REVISION: "returned",
  NEEDS_CHECK: "warn",
  REJECTED: "bad",
  LATE: "bad",
  ABSENT: "bad",
  INACTIVE: "bad",
  DISABLED: "bad",
  MISSING_CLOCK_OUT: "bad",
  CANCELLED: "neutral",
  CANCELED: "neutral",
};

export function Status({ value, label }: { value?: string | null; label?: string }) {
  const t = useT();
  const raw = value || "";
  if (!raw) return <span className="badge neutral">—</span>;
  const tone = TONE[raw] || "neutral";
  return <span className={`badge ${tone}`}>{t(label || statusLabel(raw))}</span>;
}

const PAYROLL_STEPS = ["DRAFT", "PROCESSED", "SUBMITTED", "APPROVED", "LOCKED"] as const;

export function Pipeline({ status }: { status: string }) {
  const t = useT();
  const visual = status === "NEEDS_REVISION" ? "PROCESSED" : status;
  const index = PAYROLL_STEPS.indexOf(visual as (typeof PAYROLL_STEPS)[number]);
  return (
    <ol className="pipeline" aria-label={t("Payroll progress")}>
      {PAYROLL_STEPS.map((step, stepIndex) => (
        <li key={step} className={stepIndex < index ? "done" : stepIndex === index ? "current" : ""}>{t(status === "NEEDS_REVISION" && step === "PROCESSED" ? "Needs revision" : statusLabel(step))}</li>
      ))}
    </ol>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0] || "").join("").toUpperCase() || "?";
}

export function Avatar({ name, large, small, src }: { name: string; large?: boolean; small?: boolean; src?: string }) {
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  const size = large ? "lg" : small ? "sm" : "";
  if (src) return <img className={`avatar photo ${size}`} src={src} alt="" />;
  return <span className={`avatar h${hash % 6} ${size}`} aria-hidden="true">{initials(name)}</span>;
}

export function Banner({ ok, error }: { ok?: string; error?: string }) {
  const t = useT();
  if (!ok && !error) return null;
  return <div className={ok ? "banner ok" : "banner error"}>{t(ok || error || "")}</div>;
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="page-head">
      <div>
        <h1>{t(title)}</h1>
        {subtitle ? <p>{t(subtitle)}</p> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useT();
  return <label className="field">{t(label)}{children}</label>;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <TInput {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}

export function Submit({ children }: { children: React.ReactNode }) {
  return <SubmitButton>{children}</SubmitButton>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  const t = useT();
  return <div className="card empty">{typeof children === "string" ? t(children) : children}</div>;
}

export function Options({ rows, labelKey = "name" }: { rows: { id: string; name?: string; fullName?: string; code?: string }[]; labelKey?: "name" | "fullName" }) {
  return rows.map((row) => <option key={row.id} value={row.id}>{row[labelKey] || row.name}{row.code ? ` (${row.code})` : ""}</option>);
}
