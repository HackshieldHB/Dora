import { Tx } from "@/components/locale";
import Link from "next/link";
import { publicHolidays } from "@/lib/holidays";

function HolidayColumns({ days }: { days: { date: string; name: string }[] }) {
  if (days.length === 0) return null;
  const mid = Math.ceil(days.length / 2);
  const columns = [days.slice(0, mid), days.slice(mid)];
  return (
    <div className="holiday-columns">
      {columns.map((column, index) => (
        <div className="record-list" key={index}>
          {column.map((day) => <p className="record" key={day.date}><strong>{day.date}</strong><span>{day.name}</span></p>)}
        </div>
      ))}
    </div>
  );
}

const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function YearCalendar({
  year,
  holidays,
  leaves,
  companyDates,
}: {
  year: number;
  holidays: { date: string; name: string }[];
  leaves: { name: string; start: string; end: string; status: string; type: string }[];
  companyDates: { date: string; name: string }[];
}) {
  const decree = publicHolidays(year);
  const off = new Map<string, string>();
  for (const day of decree.days) off.set(day.date, day.name);
  for (const day of holidays) off.set(day.date, day.name);
  const awayOn = (iso: string) => leaves.filter((leave) => leave.start <= iso && iso <= leave.end);
  return (
    <div>
      <div className="year-nav">
        <Link className="btn secondary" href={`/attendance/holidays?year=${year - 1}`}>{year - 1}</Link>
        <strong>{year}</strong>
        <Link className="btn secondary" href={`/attendance/holidays?year=${year + 1}`}>{year + 1}</Link>
      </div>
      <div className="year-grid">
        {MONTHS.map((label, month) => {
          const first = new Date(Date.UTC(year, month, 1));
          const lead = (first.getUTCDay() + 6) % 7;
          const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
          const cells: ({ iso: string; day: number } | null)[] = [...Array(lead).fill(null)];
          for (let day = 1; day <= count; day += 1) cells.push({ day, iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
          return (
            <section className="month-card" key={label}>
              <h2>{label}</h2>
              <div className="month-week">{WEEK.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="month-days">
                {cells.map((cell, index) => {
                  if (!cell) return <span key={`${label}-${index}`} />;
                  const holiday = off.get(cell.iso);
                  const away = awayOn(cell.iso);
                  const weekend = new Date(`${cell.iso}T00:00:00Z`).getUTCDay() % 6 === 0;
                  const tip = holiday ? `Libur · ${holiday}` : away.length ? away.map((leave) => `${leave.name} · ${leave.type}`).join(", ") : weekend ? "Akhir pekan" : "Hari kerja";
                  return <span key={cell.iso} className={holiday ? "day off" : away.length ? "day leave" : weekend ? "day weekend" : "day"} title={tip}>{cell.day}{away.length ? <i /> : null}<em className="day-tip">{tip}</em></span>;
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <p className="section-label">National holidays {year}</p>
        {decree.decree ? null : <p className="hint"><Tx text={"Religious holidays and joint leave follow the three-minister decree. Until that decree is published, this year shows the fixed national holidays."} /></p>}
        <HolidayColumns days={decree.days.filter((day) => day.kind === "NATIONAL")} />
        {decree.days.some((day) => day.kind === "JOINT") ? <p className="section-label"><Tx text={"Joint leave (cuti bersama)"} /></p> : null}
        <HolidayColumns days={decree.days.filter((day) => day.kind === "JOINT")} />
      </div>
      <div className="profile-board" style={{ marginTop: 14 }}>
        <div className="card">
          <p className="section-label"><Tx text={"Team leave in this division"} /></p>
          {leaves.length === 0 ? <p className="empty">Nobody in this division has a leave request in {year}.</p> : (
            <div className="record-list">
              {leaves.map((leave) => <p className="record" key={`${leave.name}-${leave.start}-${leave.type}`}><strong>{leave.name}</strong><span>{leave.type} · {leave.start} – {leave.end} · {leave.status}</span></p>)}
            </div>
          )}
          {companyDates.length ? <p className="section-label"><Tx text={"Company dates"} /></p> : null}
          <div className="record-list">
            {companyDates.map((day) => <p className="record" key={day.date}><strong>{day.date}</strong><span>{day.name}</span></p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
