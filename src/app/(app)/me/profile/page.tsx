import { Tx, TInput, TTextarea } from "@/components/locale";
import Link from "next/link";
import { requirePerm } from "@/lib/context";
import { prisma } from "@/lib/db";
import { avatarAction, ownDocumentAction, payslipPinAction, profileAction, profilePasswordAction } from "@/app/actions";
import { statusLabel } from "@/lib/status";
import { Banner, PageTitle, Status } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { translate } from "@/lib/i18n";
import { formatLongDate } from "@/lib/format";

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePerm("employees.self");
  const params = await searchParams;
  const employee = ctx.employeeId ? await prisma.employee.findUnique({
    where: { id: ctx.employeeId },
    include: { position: true, department: true, branch: true, location: true, manager: true, documents: { orderBy: { createdAt: "desc" } } },
  }) : null;
  const changes = employee ? await prisma.profileChange.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } }) : [];
  const text = (value: string) => translate(ctx.locale, value);
  if (!employee) return <div className="card">{text("Your account is not linked to an employee.")}</div>;
  const photo = employee.documents.find((document) => document.name === "Profile photo");
  return (
    <div>
      <PageTitle title={text("My Profile")} subtitle={text("Contact details save immediately. Name, identity, tax, and bank changes wait for HR. Job title is maintained by HR.")} />
      <Banner ok={params.ok} error={params.error} />
      <section className="identity profile-hero">
        <div className="who">
          {photo ? <img className="avatar photo lg" src={`/api/files/${photo.fileId}`} alt="" /> : <span className="avatar lg h0" aria-hidden="true">{employee.fullName.slice(0, 1)}</span>}
          <div>
            <h1>{employee.fullName}</h1>
            <p>{employee.position?.name || text("No position")} · {employee.department?.name || text("No department")}</p>
            <span className={`badge ${employee.status === "ACTIVE" ? "ok" : employee.status === "INACTIVE" ? "bad" : "warn"}`}>{text(statusLabel(employee.status))}</span>
          </div>
        </div>
        <dl className="facts hero-facts">
          <div><dt>{text("Employee ID")}</dt><dd>{employee.employeeCode}</dd></div>
          <div><dt>{text("Branch")}</dt><dd>{employee.branch?.name || "—"}</dd></div>
          <div><dt>{text("Employment")}</dt><dd>{text(statusLabel(employee.employmentType))}</dd></div>
          <div><dt>{text("Manager")}</dt><dd>{employee.manager?.fullName || "—"}</dd></div>
          <div><dt>{text("Location")}</dt><dd>{employee.location?.name || "—"}</dd></div>
          <div><dt>{text("Joined")}</dt><dd>{employee.joinDate ? formatLongDate(employee.joinDate, ctx.locale) : "—"}</dd></div>
        </dl>
      </section>
      <div className="profile-board">
        <form action={avatarAction} className="tone-card violet">
          <p className="section-label">{text("Photo")}</p>
          <label className="field">{text("Profile photo")}<TInput name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
          <p className="hint">{text("JPG, PNG, or WEBP. 2 MB maximum. This is your profile picture, not the attendance photo.")}</p>
          <button className="btn" type="submit">{text("Upload photo")}</button>
        </form>
        <form action={profilePasswordAction} className="tone-card pink">
          <p className="section-label">{text("Password")}</p>
          <PasswordField name="current" label={text("Current password")} autoComplete="current-password" showLabel={text("Show")} hideLabel={text("Hide")} />
          <PasswordField name="next" label={text("New password")} autoComplete="new-password" showLabel={text("Show")} hideLabel={text("Hide")} />
          <button className="btn" type="submit">{text("Change password")}</button>
          <p className="hint">{text("Same rules as the password page. This does not sign you out.")} <Link href="/change-password">{text("Change password")}</Link></p>
        </form>
      </div>
      <form action={profileAction} className="profile-board" style={{ marginTop: 14 }}>
        <div className="tone-card teal">
          <p className="section-label">{text("Saves immediately")}</p>
          <div className="form-grid">
            <label className="field">{text("Phone")}<TInput name="phone" defaultValue={employee.phone} /></label>
            <label className="field">{text("Emergency phone")}<TInput name="emergencyPhone" defaultValue={employee.emergencyPhone} /></label>
            <label className="field wide">{text("Address")}<TTextarea name="address" defaultValue={employee.address} /></label>
            <label className="field wide">{text("Emergency name")}<TInput name="emergencyName" defaultValue={employee.emergencyName} /></label>
            <label className="field">{text("Birth date")}<TInput name="birthDate" type="date" defaultValue={employee.birthDate} /></label>
          </div>
        </div>
        <div className="tone-card amber">
          <p className="section-label">{text("Waits for HR")}</p>
          <div className="form-grid">
            <label className="field">{text("Full name")}<TInput name="fullName" defaultValue={employee.fullName} /></label>
            <label className="field">{text("Email")}<TInput name="email" defaultValue={employee.email} /></label>
            <label className="field">{text("NIK")}<TInput name="nik" defaultValue={employee.nik} /></label>
            <label className="field">{text("NPWP")}<TInput name="npwp" defaultValue={employee.npwp} /></label>
            <label className="field">{text("PTKP")}<TInput name="ptkp" defaultValue={employee.ptkp} /></label>
            <label className="field">{text("Bank")}<TInput name="bankName" defaultValue={employee.bankName} /></label>
            <label className="field wide">{text("Account")}<TInput name="bankAccount" defaultValue={employee.bankAccount} /></label>
          </div>
        </div>
        <div className="profile-save">
          <button className="btn" type="submit">{text("Save profile")}</button>
          <p className="hint">{text("Position and department stay with HR. BPJS numbers and loans are on Benefits. A published payslip asks for your PIN.")}</p>
        </div>
      </form>
      <div className="profile-board" style={{ marginTop: 14 }}>
        <form action={payslipPinAction} className="tone-card blue">
          <p className="section-label">{text("Payslip PIN")}</p>
          <p className="hint">{text("Six digits. Your account password confirms the reset. The PIN is what opens a published payslip.")}</p>
          <PasswordField name="current" label={text("Current password")} autoComplete="current-password" showLabel={text("Show")} hideLabel={text("Hide")} />
          <label className="field">{text("New PIN")}<TInput name="pin" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="\d{6}" required /></label>
          <label className="field">{text("Confirm PIN")}<TInput name="confirm" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="\d{6}" required /></label>
          <button className="btn" type="submit">{text("Save PIN")}</button>
        </form>
        <div className="card">
          <p className="section-label">{text("Documents")}</p>
          <form action={ownDocumentAction} className="form-grid">
            <label className="field">{text("Type")}
              <select name="kind" defaultValue="KTP">
                <option>KTP</option>
                <option><Tx text={"NPWP"} /></option>
                <option>SIM</option>
                <option>Ijazah</option>
                <option value="Certificate">{text("Certificate")}</option>
                <option value="Other">{text("Other")}</option>
              </select>
            </label>
            <label className="field">{text("Detail")}<TInput name="label" placeholder={text("For example B1 or the school name")} /></label>
            <label className="field">{text("Valid until")}<TInput name="expiresOn" type="date" /></label>
            <label className="field">{text("Training name")}<TInput name="trainingName" placeholder={text("For a certificate")} /></label>
            <label className="field">{text("Provider")}<TInput name="trainingProvider" /></label>
            <label className="field">{text("Training date")}<TInput name="trainingDate" type="date" /></label>
            <label className="field wide">{text("File")}<TInput name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <button className="btn" type="submit">{text("Upload document")}</button>
          </form>
          <div className="hint"><form method="get" action="/api/me/letter"><button className="text-action" type="submit">{text("Download an employment letter")}</button></form> {text("It lists your name, role, division, and join date. Salary is not included.")}</div>
          {employee.lastWorkingDay || employee.status === "PENDING OFFBOARDING" || employee.status === "INACTIVE" ? <div className="hint"><form method="get" action={`/api/employees/${employee.id}/experience`}><button className="text-action" type="submit">{text("Download a work experience letter")}</button></form> {text("It lists your role and dates. Salary is not included.")}</div> : null}
          {employee.documents.length === 0 ? <p className="empty">{text("No documents yet.")}</p> : (
            <div className="record-list">
              {employee.documents.map((document) => (
                <p className="record" key={document.id}><strong>{document.name}</strong><span>{[document.trainingName, document.trainingProvider, document.trainingDate].filter(Boolean).join(" · ") || (document.expiresOn ? `${text("Valid until")} ${document.expiresOn}` : "—")}</span><a href={`/api/files/${document.fileId}`}>{text("Open")}</a></p>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <p className="section-label">{text("Change history")}</p>
          {changes.length === 0 ? <p className="empty">{text("No sensitive requests.")}</p> : changes.map((change) => <p className="record" key={change.id}><span>{change.field}</span><Status value={change.status} /></p>)}
        </div>
      </div>
    </div>
  );
}