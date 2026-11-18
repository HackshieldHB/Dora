import { requireUser } from "@/lib/context";
import { passwordAction } from "@/app/actions";
import { Banner } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { Logo } from "@/components/logo";
import { LocaleProvider, Tx } from "@/components/locale";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireUser({ allowPasswordChange: true });
  const params = await searchParams;
  const forced = ctx.mustChangePassword;
  return (
    <LocaleProvider locale={ctx.locale}>
      <main className="auth-screen">
        <form action={passwordAction} className="card auth-card">
          <Logo />
          <h1 style={{ margin: 0 }}><Tx text="Change password" /></h1>
          {forced ? <p className="hint"><Tx text="For account security, create a new password before continuing to use DORA." /></p> : null}
          <Banner error={params.error} />
          {forced ? null : <PasswordField name="current" label="Current password" autoComplete="current-password" />}
          <PasswordField name="next" label="New password" autoComplete="new-password" />
          {forced ? <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" /> : null}
          <button className="btn" type="submit"><Tx text={forced ? "Save new password" : "Update password"} /></button>
        </form>
      </main>
    </LocaleProvider>
  );
}
