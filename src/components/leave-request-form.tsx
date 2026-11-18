"use client";
import { TInput, TTextarea } from "@/components/locale";

import Link from "next/link";
import { useState } from "react";

export function LeaveRequestForm({ types, mates, labels, action, draft }: {
  types: { id: string; name: string; allowHalfDay: boolean }[];
  mates: { id: string; fullName: string }[];
  labels: Record<string, string>;
  action: (formData: FormData) => void | Promise<void>;
  draft?: { id: string; leaveTypeId: string; startDate: string; endDate: string; halfDay: boolean; halfStart: string; halfEnd: string; reason: string; coverId: string; attachmentName?: string; attachmentHref?: string };
}) {
  const [typeId, setTypeId] = useState(draft?.leaveTypeId ?? types[0]?.id ?? "");
  const [halfDay, setHalfDay] = useState(Boolean(draft?.halfDay));
  const [cover, setCover] = useState(draft ? (draft.coverId ? "yes" : "no") : "");
  const selected = types.find((type) => type.id === typeId) ?? types[0];
  const allowHalfDay = Boolean(selected?.allowHalfDay);
  const showTimes = halfDay && allowHalfDay;
  return (
    <form action={action} className="card stack-form">
      {draft ? <TInput type="hidden" name="id" value={draft.id} /> : null}
      <strong>{draft ? labels.revise : labels.newRequest}</strong>
      <label className="field">{labels.type}
        <select name="leaveTypeId" required value={typeId} onChange={(event) => { setTypeId(event.target.value); setHalfDay(false); }}>
          {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
      </label>
      <label className="field">{labels.start}<TInput name="startDate" type="date" required defaultValue={draft?.startDate} /></label>
      <label className="field">{labels.end}<TInput name="endDate" type="date" required defaultValue={draft?.endDate} /></label>
      <label><TInput name="halfDay" type="checkbox" disabled={!allowHalfDay} checked={showTimes} onChange={(event) => setHalfDay(event.target.checked)} /> {labels.half}</label>
      {allowHalfDay ? null : <p className="hint">{labels.halfUnavailable}</p>}
      {showTimes ? (
        <>
          <label className="field">{labels.halfStart}<TInput name="halfStart" type="time" required defaultValue={draft?.halfStart} /></label>
          <label className="field">{labels.halfEnd}<TInput name="halfEnd" type="time" required defaultValue={draft?.halfEnd} /></label>
        </>
      ) : null}
      <label className="field">{labels.reason}<TTextarea name="reason" defaultValue={draft?.reason} /></label>
      {draft?.attachmentName ? <p className="hint">{labels.currentAttachment} <a href={draft.attachmentHref}>{draft.attachmentName}</a></p> : null}
      <label className="field">{labels.attachment}<TInput name="attachment" type="file" /></label>
      <p className="section-label">{labels.coverQuestion}</p>
      <TInput type="hidden" name="cover" value={cover} />
      <div className="form-actions">
        <button className={cover === "yes" ? "btn" : "btn secondary"} type="button" onClick={() => setCover("yes")}>{labels.coverYes}</button>
        <button className={cover === "no" ? "btn" : "btn secondary"} type="button" onClick={() => setCover("no")}>{labels.coverNo}</button>
      </div>
      {cover === "yes" ? (
        mates.length === 0 ? <p className="hint">{labels.noMate}</p> : (
          <label className="field">{labels.teammate}
            <select name="coverId" required defaultValue={draft?.coverId || ""}>
              <option value="" disabled>{labels.teammate}</option>
              {mates.map((mate) => <option key={mate.id} value={mate.id}>{mate.fullName}</option>)}
            </select>
          </label>
        )
      ) : null}
      <div className="form-actions">
        <button className="btn" type="submit">{labels.submit}</button>
        {draft ? <Link className="btn secondary" href="/me/leave">{labels.back}</Link> : null}
      </div>
    </form>
  );
}
