"use client";

import { useState } from "react";

export function LeaveInfo({ title, hint, types }: { title: string; hint: string; types: { id: string; name: string; quota: string; note: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="leave-info">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>{title}</strong>
          <span className="hint">{hint}</span>
        </span>
        <svg className={open ? "chev open" : "chev"} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="leave-catalog">
          {types.map((type) => (
            <article className="leave-card" key={type.id}>
              <strong>{type.name}</strong>
              <span>{type.quota}</span>
              {type.note ? <p>{type.note}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
