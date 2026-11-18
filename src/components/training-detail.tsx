import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPerm, requireUser } from "@/lib/context";
import { todayJakarta } from "@/lib/format";
import { canReadTraining, companyEmployees, getTraining, trainingPhase } from "@/server/training";
import { trainingAssignAction, trainingAttendanceAction, trainingCancelAction, trainingCertificateAction, trainingEvaluationAction, trainingRegisterAction, trainingRemoveAction, trainingUpdateAction } from "@/app/actions";
import { Tx, TInput, TTextarea } from "./locale";
import { Banner, PageTitle, Status } from "./ui";
import { TrainingFields } from "./training-fields";

function Stars({ name, label }: { name: string; label: string }) {
  return (
    <fieldset className="stars">
      <legend><Tx text={label} /></legend>
      {[1, 2, 3, 4, 5].map((score) => <label key={score}><input type="radio" name={name} value={score} required /> {score}</label>)}
    </fieldset>
  );
}

export async function TrainingDetail({ id, tab, ok, error }: { id: string; tab?: string; ok?: string; error?: string }) {
  const ctx = await requireUser();
  if (!canReadTraining(ctx)) redirect("/forbidden?need=training.self");
  const training = await getTraining(ctx, id).catch(() => null);
  if (!training) return <div><PageTitle title="Training" /><div className="card"><Tx text={"Training was not found."} /></div></div>;
  const active = tab === "people" || tab === "material" || tab === "evaluation" ? tab : "info";
  const phase = trainingPhase(training);
  const manage = hasPerm(ctx, "training.manage");
  const seeScores = manage;
  const mine = training.participants.find((person) => person.employeeId === ctx.employeeId);
  const seats = training.participants.filter((person) => person.status !== "CANCELLED").length;
  const employees = manage ? await companyEmployees(ctx) : [];
  const taken = new Set(training.participants.filter((person) => person.status !== "CANCELLED").map((person) => person.employeeId));
  const tabs = [["info", "Information"], ["people", "Schedule & participants"], ["material", "Material"], ["evaluation", "Evaluation"]] as const;
  return (
    <div>
      <PageTitle title={training.name} subtitle={`${training.category} · ${training.sessionDate}`}>
        <Status value={phase} />
      </PageTitle>
      <Banner ok={ok} error={error} />
      <div className="tabs">
        {tabs.map(([key, label]) => <Link key={key} className={active === key ? "active" : ""} href={`?tab=${key}`}><Tx text={label} /></Link>)}
      </div>
      {active === "info" ? (
        <div className="card stack-form">
          <p><strong>{training.startTime}–{training.endTime}</strong> · <Status value={training.method} /> · {training.place}</p>
          <p><Tx text={"Trainer"} />: {training.trainer}</p>
          <p>{seats}/{training.capacity} · <Tx text={training.enrollment === "OPEN" ? "Open registration" : "Assigned only"} /></p>
          {training.target ? <p><Tx text={"Target"} />: {training.target}</p> : null}
          {training.description ? <p>{training.description}</p> : null}
          {training.objective ? <p>{training.objective}</p> : null}
          {mine ? <p><Status value={mine.status} /></p> : null}
          {!mine && training.enrollment === "OPEN" && training.status !== "CANCELLED" && training.sessionDate >= todayJakarta() && ctx.employeeId ? (
            <form action={trainingRegisterAction}><TInput type="hidden" name="id" value={training.id} /><button className="btn" type="submit"><Tx text={"Register for training"} /></button></form>
          ) : null}
          {manage && training.status !== "CANCELLED" ? (
            <details>
              <summary><Tx text={"Edit training"} /></summary>
              <form action={trainingUpdateAction} className="stack-form">
                <TInput type="hidden" name="id" value={training.id} />
                <TrainingFields value={training} />
                <button className="btn" type="submit"><Tx text={"Save"} /></button>
              </form>
              <form action={trainingCancelAction}><TInput type="hidden" name="id" value={training.id} /><button className="btn secondary" type="submit"><Tx text={"Cancel training"} /></button></form>
            </details>
          ) : null}
        </div>
      ) : null}
      {active === "people" ? (
        <div className="card table-wrap">
          {manage && training.status !== "CANCELLED" ? (
            <form action={trainingAssignAction} className="inline-form">
              <TInput type="hidden" name="id" value={training.id} />
              <select name="employeeId" required>
                <option value=""><Tx text={"Assign an employee"} /></option>
                {employees.filter((person) => !taken.has(person.id)).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
              <button className="btn" type="submit"><Tx text={"Add"} /></button>
            </form>
          ) : null}
          <table>
            <thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Department"} /></th><th><Tx text={"Attendance status"} /></th><th><Tx text={"Status"} /></th><th></th></tr></thead>
            <tbody>
              {training.participants.length === 0 ? <tr><td colSpan={5}><Tx text={"No participants yet."} /></td></tr> : training.participants.map((person) => (
                <tr key={person.id}>
                  <td>{person.employee.fullName}</td>
                  <td>{person.employee.department?.name || "—"}</td>
                  <td>{person.attendance ? <Status value={person.attendance} /> : "—"}</td>
                  <td><Status value={person.status} /></td>
                  <td>
                    {manage ? (
                      <div className="inline-form">
                        <form action={trainingAttendanceAction} className="inline-form">
                          <TInput type="hidden" name="trainingId" value={training.id} />
                          <TInput type="hidden" name="participantId" value={person.id} />
                          <select name="attendance" defaultValue={person.attendance || "PRESENT"}><option value="PRESENT"><Tx text={"Present"} /></option><option value="ABSENT"><Tx text={"Absent"} /></option></select>
                          <select name="completion" defaultValue={person.status === "COMPLETED" ? "COMPLETED" : "ATTENDED"}><option value="ATTENDED"><Tx text={"Attended"} /></option><option value="COMPLETED"><Tx text={"Completed"} /></option></select>
                          <button className="btn secondary" type="submit"><Tx text={"Save"} /></button>
                        </form>
                        {["ASSIGNED", "REGISTERED"].includes(person.status) && !person.attendance ? (
                          <form action={trainingRemoveAction}><TInput type="hidden" name="trainingId" value={training.id} /><TInput type="hidden" name="participantId" value={person.id} /><button className="text-action" type="submit"><Tx text={"Remove"} /></button></form>
                        ) : null}
                        {["ATTENDED", "COMPLETED"].includes(person.status) ? (
                          <form action={trainingCertificateAction} className="inline-form">
                            <TInput type="hidden" name="trainingId" value={training.id} />
                            <TInput type="hidden" name="participantId" value={person.id} />
                            <TInput name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" required />
                            <button className="btn secondary" type="submit"><Tx text={"Certificate"} /></button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                    {person.certificateId && person.employeeId === ctx.employeeId ? <a href={`/api/files/${person.certificateId}`}><Tx text={"Download certificate"} /></a> : null}
                    {person.certificateId && manage ? <a href={`/api/files/${person.certificateId}`}><Tx text={"Download certificate"} /></a> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {active === "material" ? (
        <div className="card">
          {training.materialUrl ? <a href={training.materialUrl}><Tx text={"Open material"} /></a> : <p className="empty"><Tx text={"No material yet."} /></p>}
        </div>
      ) : null}
      {active === "evaluation" ? (
        <div className="stack-form">
          {mine && !mine.evaluation && (mine.attendance === "PRESENT" || ["ATTENDED", "COMPLETED"].includes(mine.status)) && training.sessionDate <= todayJakarta() ? (
            <form action={trainingEvaluationAction} className="card stack-form">
              <TInput type="hidden" name="trainingId" value={training.id} />
              <TInput type="hidden" name="participantId" value={mine.id} />
              <Stars name="overall" label="Overall rating" />
              <Stars name="material" label="Material quality" />
              <Stars name="delivery" label="Trainer delivery" />
              <Stars name="facility" label="Facility or media" />
              <Stars name="relevance" label="Job relevance" />
              <label className="field"><Tx text={"Comments"} /><TTextarea name="comment" /></label>
              <button className="btn" type="submit"><Tx text={"Send evaluation"} /></button>
            </form>
          ) : null}
          {mine?.evaluation ? <p className="card"><Status value="COMPLETED" label="Evaluation sent" /></p> : null}
          {seeScores ? (
            <div className="card table-wrap">
              <table>
                <thead><tr><th><Tx text={"Employee"} /></th><th><Tx text={"Overall rating"} /></th><th><Tx text={"Comments"} /></th></tr></thead>
                <tbody>
                  {training.participants.filter((person) => person.evaluation).length === 0 ? <tr><td colSpan={3}><Tx text={"No evaluations yet."} /></td></tr> : training.participants.filter((person) => person.evaluation).map((person) => (
                    <tr key={person.id}><td>{person.employee.fullName}</td><td>{person.evaluation?.overall}/5</td><td>{person.evaluation?.comment || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
