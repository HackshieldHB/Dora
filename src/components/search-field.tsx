"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "./locale";

export function SearchField({
  name = "q",
  defaultValue = "",
  placeholder,
  value,
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const t = useT();
  const controlled = onChange != null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(defaultValue);
  const input = useRef<HTMLInputElement>(null);
  const current = controlled ? value || "" : text;

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function set(next: string) {
    if (controlled) onChange?.(next);
    else setText(next);
  }

  return (
    <div className={`search-field${open ? " open" : ""}${current ? " active" : ""}`}>
      <button className="search-icon" type="button" aria-label={t(placeholder)} aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg>
      </button>
      <input
        ref={input}
        name={controlled ? undefined : name}
        type={open ? "search" : "hidden"}
        value={current}
        placeholder={t(placeholder)}
        aria-label={t(placeholder)}
        onChange={(event) => set(event.target.value)}
      />
      {!open && current ? (
        <button className="search-clear" type="button" aria-label={t("Clear search")} onClick={(event) => { set(""); if (!controlled) event.currentTarget.form?.requestSubmit(); }}>×</button>
      ) : null}
    </div>
  );
}
