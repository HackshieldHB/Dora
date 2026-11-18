"use client";

import { resetAction } from "@/app/actions";
import { Tx } from "@/components/locale";

export function ResetPasswordButton({ userId, confirmText }: { userId: string; confirmText: string }) {
  return (
    <form action={resetAction} onSubmit={(event) => { if (!window.confirm(confirmText)) event.preventDefault(); }}>
      <input type="hidden" name="id" value={userId} />
      <button className="btn secondary" type="submit"><Tx text="Reset password" /></button>
    </form>
  );
}
