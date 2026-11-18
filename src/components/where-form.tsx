"use client";

import { useState } from "react";
import { offsiteAction } from "@/app/actions";
import { Tx, TInput, TTextarea } from "./locale";

export function WhereForm({
  today,
  returned,
  locked = false,
}: {
  today: string;
  returned: { id: string; start: string; end: string; place: string; note: string } | null;
  locked?: boolean;
}) {
  const [kind, setKind] = useState(locked || returned ? "TRAVEL" : "CLIENT");
  const travel = locked || kind === "TRAVEL";
  return (
    <form action={offsiteAction} className="card tone-card teal stack-form">
      <p className="section-label"><Tx text={"Where you worked"} /></p>
      {returned && travel ? <input type="hidden" name="requestId" value={returned.id} /> : null}
      {locked ? <input type="hidden" name="kind" value="TRAVEL" /> : null}
      {locked ? null : <label className="field"><Tx text={"Where"} />
        <select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="CLIENT"><Tx text={"Client site"} /></option>
          <option value="FIELD"><Tx text={"Outside the office"} /></option>
          <option value="TRAVEL"><Tx text={"Business travel"} /></option>
        </select>
      </label>}
      {travel ? (
        <>
          <label className="field"><Tx text={"Departure date"} /><TInput name="start" type="date" required defaultValue={returned?.start || today} /></label>
          <label className="field"><Tx text={"Return date"} /><TInput name="end" type="date" required defaultValue={returned?.end || today} /></label>
        </>
      ) : (
        <label className="field"><Tx text={"Date"} /><TInput name="workDate" type="date" required defaultValue={today} max={today} /></label>
      )}
      <label className="field"><Tx text={travel ? "Destination" : "Place"} /><TInput name="place" required defaultValue={travel ? returned?.place || "" : ""} placeholder={travel ? "City or site" : "Client or area"} /></label>
      {travel ? null : (
        <>
          <label className="field"><Tx text={"Clock-in time"} /><TInput name="clockIn" type="time" required /></label>
          <label className="field"><Tx text={"Clock-out time"} /><TInput name="clockOut" type="time" /></label>
        </>
      )}
      <label className="field"><Tx text={"Note"} /><TTextarea name="note" defaultValue={travel ? returned?.note || "" : ""} placeholder={travel ? "Purpose of the trip" : "What you were doing there"} /></label>
      <button className="btn" type="submit"><Tx text={travel ? (returned ? "Send revision" : "Submit business travel") : "Submit attendance request"} /></button>
    </form>
  );
}
