"use client";

import { useState } from "react";
import { TInput, useT } from "./locale";

export function PasswordField({
  name,
  label,
  autoComplete,
  required = true,
  showLabel = "Show",
  hideLabel = "Hide",
}: {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  showLabel?: string;
  hideLabel?: string;
}) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      {t(label)}
      <span className="password-wrap">
        <TInput name={name} type={visible ? "text" : "password"} required={required} autoComplete={autoComplete} />
        <button className="ghost-toggle" type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? t(hideLabel) : t(showLabel)}>
          {visible ? t(hideLabel) : t(showLabel)}
        </button>
      </span>
    </label>
  );
}
