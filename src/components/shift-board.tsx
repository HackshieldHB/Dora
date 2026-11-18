"use client";
import { Tx, TInput, TTextarea } from "@/components/locale";

import Link from "next/link";
import { useMemo, useState } from "react";
import { shiftLengthLabel } from "@/lib/domain";

type ShiftRow = { id: string; name: string; startTime: string; endTime: string; crossesMidnight: boolean; description: string };
type Employee = { id: string; fullName: string };
type ScheduleRow = { id: string; employeeId: string; employeeName: string; dayOfWeek: number; shiftId: string; shiftName: string; startTime: string; endTime: string; effectiveStart: string; effectiveEnd: string };
type Action = (formData: FormData) => void | Promise<void>;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ShiftBoard({ tab, shifts, schedules, employees, canManage, shiftAction, deleteShiftAction, scheduleAction, deleteScheduleAction }: {
  tab: string;
  shifts: ShiftRow[];
  schedules: ScheduleRow[];
  employees: Employee[];
  canManage: boolean;
  shiftAction: Action;
  deleteShiftAction: Action;
  scheduleAction: Action;
  deleteScheduleAction: Action;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [shiftForm, setShiftForm] = useState<ShiftRow | null | "new">(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentGroup | "new" | null>(null);
  const visibleShifts = shifts.filter((shift) => {
    if (query && !shift.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (kind === "midnight") return shift.crossesMidnight;
    if (kind === "same") return !shift.crossesMidnight;
    return true;
  });
  const groups = useMemo(() => groupSchedules(schedules), [schedules]);
  return (
    <div>
      <div className="tabs">
        <Link className={tab === "schedule" ? "active" : ""} href="/attendance/schedules"><Tx text={"Work Schedule"} /></Link>
        <Link className={tab === "shift" ? "active" : ""} href="/attendance/schedules?tab=shift"><Tx text={"Shift"} /></Link>
      </div>
      {tab === "shift" ? (
        <div className="stack">
          <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label className="field"><Tx text={"Search shift"} /><TInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Shift name" /></label>
            <label className="field"><Tx text={"Shift type"} />
              <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all"><Tx text={"All"} /></option><option value="same"><Tx text={"Same day"} /></option><option value="midnight"><Tx text={"Crosses midnight"} /></option></select>
            </label>
            {canManage ? <button className="btn" type="button" onClick={() => setShiftForm("new")}><Tx text={"+ Add Shift"} /></button> : null}
          </div>
          {shiftForm && canManage ? <ShiftForm shift={shiftForm === "new" ? undefined : shiftForm} action={shiftAction} onCancel={() => setShiftForm(null)} /> : null}
          <div className="card table-wrap">
            <table>
              <thead><tr><th><Tx text={"Shift name"} /></th><th><Tx text={"Start time"} /></th><th><Tx text={"End time"} /></th><th><Tx text={"Shift duration"} /></th><th><Tx text={"Crosses midnight?"} /></th><th><Tx text={"Description"} /></th>{canManage ? <th><Tx text={"Actions"} /></th> : null}</tr></thead>
              <tbody>
                {visibleShifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>{shift.name}</td>
                    <td>{shift.startTime}</td>
                    <td>{shift.endTime}{shift.crossesMidnight ? " (Next Day)" : ""}</td>
                    <td>{shiftLengthLabel(shift.startTime, shift.endTime)}</td>
                    <td>{shift.crossesMidnight ? "Yes" : "No"}</td>
                    <td>{shift.description}</td>
                    {canManage ? <td>
                      <button className="text-action" type="button" onClick={() => setShiftForm(shift)}><Tx text={"Edit"} /></button>
                      {" · "}
                      <form action={deleteShiftAction} style={{ display: "inline" }} onSubmit={(event) => { if (!window.confirm("Delete this shift?")) event.preventDefault(); }}>
                        <TInput type="hidden" name="id" value={shift.id} />
                        <button className="text-action" type="submit"><Tx text={"Delete"} /></button>
                      </form>
                    </td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="stack">
          {canManage ? <div><button className="btn" type="button" onClick={() => setAssignmentForm("new")}><Tx text={"+ New Assignment"} /></button></div> : null}
          {assignmentForm && canManage ? (
            <AssignmentForm group={assignmentForm === "new" ? undefined : assignmentForm} employees={employees} shifts={shifts} action={scheduleAction} onCancel={() => setAssignmentForm(null)} />
          ) : null}
          <div className="card table-wrap">
            <p className="hint"><Tx text={"Days that are not selected on an assignment are day off. Day off is not a shift."} /></p>
            <table>
              <thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Workdays"} /></th><th><Tx text={"Shift"} /></th><th><Tx text={"Effective period"} /></th>{canManage ? <th><Tx text={"Actions"} /></th> : null}</tr></thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.key}>
                    <td>{group.employeeName}</td>
                    <td>{formatDays(group.days)}</td>
                    <td>{group.shiftName} ({group.startTime}–{group.endTime}{group.crossesMidnight ? " next day" : ""})</td>
                    <td>{formatDate(group.effectiveStart)} – {group.effectiveEnd ? formatDate(group.effectiveEnd) : "No end date"}</td>
                    {canManage ? <td>
                      <button className="text-action" type="button" onClick={() => setAssignmentForm(group)}><Tx text={"Edit"} /></button>
                      {" · "}
                      <form action={deleteScheduleAction} style={{ display: "inline" }} onSubmit={(event) => { if (!window.confirm("Delete this assignment?")) event.preventDefault(); }}>
                        <TInput type="hidden" name="employeeId" value={group.employeeId} />
                        <TInput type="hidden" name="shiftId" value={group.shiftId} />
                        <TInput type="hidden" name="effectiveStart" value={group.effectiveStart} />
                        <TInput type="hidden" name="effectiveEnd" value={group.effectiveEnd} />
                        <button className="text-action" type="submit"><Tx text={"Delete"} /></button>
                      </form>
                    </td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftForm({ shift, action, onCancel }: { shift?: ShiftRow; action: Action; onCancel: () => void }) {
  const [start, setStart] = useState(shift?.startTime ?? "");
  const [end, setEnd] = useState(shift?.endTime ?? "");
  const crosses = Boolean(start && end && end < start);
  return (
    <form action={action} className="card" style={{ display: "grid", gap: 10 }}>
      {shift ? <TInput type="hidden" name="id" value={shift.id} /> : null}
      <label className="field"><Tx text={"Shift name"} /><TInput name="name" defaultValue={shift?.name ?? ""} required /></label>
      <label className="field"><Tx text={"Start time"} /><TInput name="startTime" type="time" value={start} required onChange={(event) => setStart(event.target.value)} /></label>
      <label className="field"><Tx text={"End time"} /><TInput name="endTime" type="time" value={end} required onChange={(event) => setEnd(event.target.value)} /></label>
      <p className="hint">{start && end ? `Duration ${shiftLengthLabel(start, end)}.${crosses ? " End time is next day." : ""}` : "Duration is calculated from the start and end time."}</p>
      <label className="field"><Tx text={"Description"} /><TTextarea name="description" defaultValue={shift?.description ?? ""} /></label>
      <div className="form-actions">
        <button className="btn" type="submit">{shift ? "Save Changes" : "Save"}</button>
        <button className="btn secondary" type="button" onClick={onCancel}><Tx text={"Cancel"} /></button>
      </div>
    </form>
  );
}

type AssignmentGroup = { key: string; employeeId: string; employeeName: string; shiftId: string; shiftName: string; startTime: string; endTime: string; crossesMidnight: boolean; days: number[]; effectiveStart: string; effectiveEnd: string };

function AssignmentForm({ group, employees, shifts, action, onCancel }: { group?: AssignmentGroup; employees: Employee[]; shifts: ShiftRow[]; action: Action; onCancel: () => void }) {
  return (
    <form action={action} className="card" style={{ display: "grid", gap: 10 }}>
      {group ? (
        <>
          <TInput type="hidden" name="previousShiftId" value={group.shiftId} />
          <TInput type="hidden" name="previousStart" value={group.effectiveStart} />
          <TInput type="hidden" name="previousEnd" value={group.effectiveEnd} />
        </>
      ) : null}
      <label className="field"><Tx text={"Employee"} />
        <select name="employeeId" defaultValue={group?.employeeId ?? employees[0]?.id} required>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
        </select>
      </label>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="hint"><Tx text={"Workdays. Days left unselected are day off."} /></legend>
        <div className="choice" style={{ flexWrap: "wrap" }}>
          {DAY_NAMES.map((name, day) => <label key={name}><TInput type="checkbox" name="days" value={day} defaultChecked={group ? group.days.includes(day) : day >= 1 && day <= 5} /> {name}</label>)}
        </div>
      </fieldset>
      <label className="field"><Tx text={"Shift"} />
        <select name="shiftId" defaultValue={group?.shiftId ?? shifts[0]?.id} required>
          {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} ({shift.startTime}–{shift.endTime})</option>)}
        </select>
      </label>
      <label className="field"><Tx text={"Effective start date"} /><TInput name="effectiveStart" type="date" defaultValue={group?.effectiveStart ?? ""} required /></label>
      <label className="field"><Tx text={"Effective end date"} /><TInput name="effectiveEnd" type="date" defaultValue={group?.effectiveEnd ?? ""} /></label>
      <div className="form-actions">
        <button className="btn" type="submit"><Tx text={"Save"} /></button>
        <button className="btn secondary" type="button" onClick={onCancel}><Tx text={"Cancel"} /></button>
      </div>
    </form>
  );
}

function groupSchedules(rows: ScheduleRow[]): AssignmentGroup[] {
  const groups = new Map<string, AssignmentGroup>();
  for (const row of rows) {
    if (!row.shiftId) continue;
    const key = `${row.employeeId}|${row.shiftId}|${row.effectiveStart}|${row.effectiveEnd}`;
    const current = groups.get(key);
    if (current) current.days.push(row.dayOfWeek);
    else groups.set(key, { key, employeeId: row.employeeId, employeeName: row.employeeName, shiftId: row.shiftId, shiftName: row.shiftName, startTime: row.startTime, endTime: row.endTime, crossesMidnight: row.endTime < row.startTime, days: [row.dayOfWeek], effectiveStart: row.effectiveStart, effectiveEnd: row.effectiveEnd });
  }
  return [...groups.values()];
}

function formatDays(days: number[]): string {
  const sorted = [...days].sort((left, right) => left - right);
  if (sorted.join(",") === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.join(",") === "1,2,3,4,5,6") return "Mon–Sat";
  return sorted.map((day) => DAY_NAMES[day]).join(", ");
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${names[Number(month) - 1]} ${year}`;
}
