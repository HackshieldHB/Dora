"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardBoard } from "@/server/dashboard";
import { translate } from "@/lib/i18n";

type Card = { id: string; title: string; value: string; hint: string; href?: string };
type Action = { label: string; href: string };
type Activity = { id: string; title: string; createdAt: string; read: boolean; href?: string };

const TONE: Record<string, string> = {
  employee_summary: "indigo",
  team_summary: "indigo",
  my_attendance: "teal",
  leave_balance: "coral",
  my_requests: "amber",
  latest_payslip: "lime",
  attendance_overview: "teal",
  team_attendance: "teal",
  pending_approvals: "violet",
  approval_center: "violet",
  action_center: "violet",
  leave_summary: "coral",
  overtime_summary: "amber",
  payroll_period: "indigo",
  payroll_summary: "teal",
  payroll_status: "indigo",
  processing_tasks: "amber",
  pending_payroll: "coral",
  workforce: "cyan",
  platform_summary: "indigo",
};

const ICON: Record<string, string> = {
  employee_summary: "users",
  team_summary: "users",
  my_attendance: "clock",
  attendance_overview: "clock",
  team_attendance: "clock",
  leave_balance: "calendar",
  leave_summary: "calendar",
  my_requests: "calendar",
  overtime_summary: "timer",
  pending_approvals: "check",
  approval_center: "check",
  action_center: "check",
  pending_payroll: "check",
  processing_tasks: "check",
  latest_payslip: "receipt",
  payroll_period: "receipt",
  payroll_summary: "receipt",
  payroll_status: "receipt",
  workforce: "building",
  platform_summary: "building",
};

function Glyph({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, string> = {
    users: "M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2.2-2.9",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
    calendar: "M5 6h14v13H5zM8 4v4M16 4v4M5 10h14",
    timer: "M12 8v5l3 2M9 3h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
    check: "M8 12l3 3 5-6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
    receipt: "M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2z",
    building: "M4 20h16M6 20V5h8v15M14 9h4v11M9 8h2M9 12h2",
    plus: "M12 6v12M6 12h12",
    eye: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    "eye-off": "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.1 3.8M6.1 6.1C3.6 7.8 2 12 2 12s4 7 10 7a10 10 0 0 0 4-.8",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d={paths[name] || paths.users} />
    </svg>
  );
}

function actionIcon(href: string) {
  if (href.includes("attendance")) return "clock";
  if (href.includes("leave")) return "calendar";
  if (href.includes("approval")) return "check";
  if (href.includes("payroll")) return "receipt";
  if (href.includes("organization")) return "building";
  return "plus";
}

export function DashboardShortcuts({ actions, locale }: { actions: Action[]; locale: string }) {
  if (!actions.length) return null;
  const t = (value: string) => translate(locale, value);
  return (
    <section className="card dash-shortcuts">
      <p className="section-label">{t("Shortcuts")}</p>
      <h3>{t("Quick actions")}</h3>
      <div className="shortcut-grid">
        {actions.map((action) => (
          <Link key={action.href} className="shortcut" href={action.href}>
            <span className="kpi-icon"><Glyph name={actionIcon(action.href)} /></span>
            <span>{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DashboardLive({
  initial,
  board: initialBoard,
  activity,
  query,
  locale,
}: {
  initial: Card[];
  board: DashboardBoard;
  activity: Activity[];
  query: string;
  locale: string;
}) {
  const t = (value: string) => translate(locale, value);
  const [cards, setCards] = useState(initial);
  const [showNet, setShowNet] = useState(false);
  const [board, setBoard] = useState(initialBoard);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Refresh failed");
        const body = await response.json() as { cards: Card[]; board: DashboardBoard };
        setCards(body.cards);
        setBoard(body.board);
        setError(null);
      } catch {
        setError("Refresh failed. The filter and the last figures are unchanged.");
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [query]);

  const attendance = board.attendance;
  const segments = attendance
    ? [
        [t("On time"), attendance.onTime, "#14b8a6"],
        [t("Late"), attendance.late, "#f59e0b"],
        [t("Approved leave"), attendance.onLeave, "#3b82f6"],
        [t("Left early"), attendance.early, "#06b6d4"],
        [t("Missing clock-out"), attendance.missingOut, "#f27b73"],
        [t("Other record"), attendance.other, "#94a3b8"],
        [t("No attendance record"), attendance.withoutRecord, "#cbd5e1"],
      ].filter((part) => Number(part[1]) > 0)
    : [];
  const segmentTotal = segments.reduce((sum, part) => sum + Number(part[1]), 0);
  const pending = [
    board.leavePending == null ? null : [t("Leave requests"), board.leavePending, "/leave/requests?status=PENDING"],
    board.overtimePending == null ? null : [t("Overtime requests"), board.overtimePending, "/overtime/requests?status=PENDING"],
    board.approvalsPending == null ? null : [t("Assigned to you"), board.approvalsPending, "/approvals/pending"],
  ].filter((row): row is [string, number, string] => Boolean(row));
  const deptMax = Math.max(1, ...board.departments.map((row) => row.count));
  const showOps = Boolean(attendance || board.departments.length || pending.length || activity.length);

  return (
    <div className="dash-stack">
      {error ? <div className="banner error">{locale === "id" ? "Pembaharuan gagal. Filter dan angka terakhir tidak berubah." : error} <button className="btn secondary" type="button" onClick={() => window.location.reload()}>{t("Retry")}</button></div> : null}
      {cards.length === 0 ? <div className="card empty">{locale === "id" ? "Tidak ada angka tenaga kerja untuk peran ini. Pintasan di atas membuka halaman yang bisa dipakai." : "No workforce metrics are available for this role. Shortcuts above open the pages you can use."}</div> : (
        <div className="kpi-grid">
          {cards.map((card) => {
            const pay = card.id === "payroll_summary";
            const hiddenPay = pay && !showNet;
            const long = hiddenPay || card.value.length > 12;
            const body = (
              <>
                <div>
                  <div className="kpi-label">{card.title}</div>
                  <div className={long ? "kpi-value long kpi-money" : "kpi-value kpi-money"}>
                    <span>{hiddenPay ? "Rp **********" : card.value}</span>
                    {pay ? (
                      <button className="kpi-eye" type="button" aria-pressed={showNet} aria-label={t(showNet ? "Hide net pay" : "Show net pay")} onClick={() => setShowNet((value) => !value)}>
                        <Glyph name={showNet ? "eye" : "eye-off"} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <span className="kpi-icon"><Glyph name={ICON[card.id] || "users"} /></span>
                <p className="kpi-hint">{card.hint}</p>
              </>
            );
            return pay ? (
              <div key={card.id + card.title} className={`kpi tone-${TONE[card.id] || "indigo"}`}>{body}</div>
            ) : (
              <Link key={card.id + card.title} href={card.href || "/overview"} className={`kpi tone-${TONE[card.id] || "indigo"}`}>{body}</Link>
            );
          })}
        </div>
      )}
      {showOps ? (
        <div className="ops">
          <div className="ops-stack">
            {attendance ? (
              <section className="card">
                <p className="section-label">{t("Attendance today")}</p>
                <h3>{locale === "id" ? `Hadir atau terlambat: ${attendance.clockedIn}` : `Present or late is ${attendance.clockedIn}`}</h3>
                <p className="hint">{locale === "id"
                  ? `Angka itu adalah absen masuk tepat waktu ditambah terlambat. Cuti yang disetujui tetap tercatat, bukan absen. ${attendance.active} karyawan ada dalam cakupan ini, dan ${attendance.recorded} sudah punya baris absensi.`
                  : `That number is on-time plus late clock-ins. Approved leave is a record, not a missing clock-in. ${attendance.active} current employees are in this scope, and ${attendance.recorded} have an attendance row.`}</p>
                {segmentTotal > 0 ? (
                  <>
                    <div className="seg" aria-hidden="true">
                      {segments.map(([label, value, color]) => <i key={label} style={{ width: `${(Number(value) / segmentTotal) * 100}%`, background: String(color) }} />)}
                    </div>
                    <ul className="legend">
                      {segments.map(([label, value, color]) => (
                        <li key={label}><i style={{ background: String(color) }} />{label}<strong>{value}</strong></li>
                      ))}
                    </ul>
                  </>
                ) : <p className="empty">{locale === "id" ? "Tidak ada karyawan saat ini dalam cakupan ini." : "No current employees in this scope."}</p>}
              </section>
            ) : null}
            {board.departments.length ? (
              <section className="card">
                <p className="section-label">{t("Departments")}</p>
                <h3>{t("Where current employees sit")}</h3>
                <div className="dept-list">
                  {board.departments.map((row) => (
                    <div className="dept-row" key={row.name}>
                      <span>{row.name}</span>
                      <strong>{row.count}</strong>
                      <div className="dept-bar" aria-hidden="true"><span style={{ width: `${(row.count / deptMax) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          <div className="ops-stack">
            {pending.length ? (
              <section className="card">
                <p className="section-label">{t("Waiting")}</p>
                <h3>{t("Open work")}</h3>
                <div className="wait-list">
                  {pending.map(([label, value, href]) => (
                    <Link key={label} href={href}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            {activity.length ? (
              <section className="card" aria-label="Recent activity">
                <p className="section-label">{t("Activity")}</p>
                <h3>{t("Recent notices")}</h3>
                <div className="activity">
                  {activity.map((item) => (
                    <Link key={item.id} href={item.href || "/notifications"}>
                      <span className={item.read ? "badge neutral" : "badge info"}>{item.read ? t("Read") : t("New")}</span>
                      <span><strong>{t(item.title)}</strong><span className="hint">{item.createdAt}</span></span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
