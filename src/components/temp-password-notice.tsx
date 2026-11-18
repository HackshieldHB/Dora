"use client";

import { useState } from "react";
import Link from "next/link";
import { Tx } from "@/components/locale";

export function TempPasswordNotice({ account, password }: { account: string; password: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="card stack-form">
      <strong><Tx text="A temporary password was created." /></strong>
      <p><Tx text="User account" />: {account}</p>
      <p><Tx text="Temporary password" />: <code>{shown ? password : "••••••••••••"}</code></p>
      <div className="form-actions">
        <button className="btn secondary" type="button" onClick={() => setShown((value) => !value)}><Tx text={shown ? "Hide" : "Show"} /></button>
        <button className="btn secondary" type="button" onClick={() => { void navigator.clipboard.writeText(password).then(() => setCopied(true)); }}><Tx text={copied ? "Copied" : "Copy password"} /></button>
        <Link className="btn" href="/settings/users"><Tx text="Close" /></Link>
      </div>
      <p className="hint"><Tx text="Give this temporary password to the user. It is shown only now. The user must replace it after signing in." /></p>
    </div>
  );
}
