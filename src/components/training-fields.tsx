import { Tx, TInput, TTextarea } from "./locale";

const CATEGORIES = ["Technical Skill", "Soft Skill", "Leadership", "Compliance", "Other"];

export function TrainingFields({
  value,
  employees,
}: {
  value?: {
    name: string;
    category: string;
    description: string;
    objective: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    method: string;
    place: string;
    trainer: string;
    capacity: number;
    target: string;
    materialUrl: string;
    enrollment: string;
  };
  employees?: { id: string; fullName: string }[];
}) {
  return (
    <>
      <div className="form-grid">
        <label className="field"><Tx text={"Training name"} /><TInput name="name" required defaultValue={value?.name || ""} /></label>
        <label className="field"><Tx text={"Category"} />
          <select name="category" defaultValue={value?.category || "Technical Skill"}>{CATEGORIES.map((item) => <option key={item} value={item}><Tx text={item} /></option>)}</select>
        </label>
        <label className="field"><Tx text={"Date"} /><TInput name="sessionDate" type="date" required defaultValue={value?.sessionDate || ""} /></label>
        <label className="field"><Tx text={"Start"} /><TInput name="startTime" type="time" required defaultValue={value?.startTime || ""} /></label>
        <label className="field"><Tx text={"End"} /><TInput name="endTime" type="time" required defaultValue={value?.endTime || ""} /></label>
        <label className="field"><Tx text={"Method"} />
          <select name="method" defaultValue={value?.method || "ONSITE"}>
            <option value="ONLINE"><Tx text={"Online"} /></option>
            <option value="ONSITE"><Tx text={"Onsite"} /></option>
            <option value="HYBRID"><Tx text={"Hybrid"} /></option>
          </select>
        </label>
        <label className="field"><Tx text={"Location or meeting link"} /><TInput name="place" required defaultValue={value?.place || ""} /></label>
        <label className="field"><Tx text={"Trainer"} /><TInput name="trainer" required defaultValue={value?.trainer || ""} /></label>
        <label className="field"><Tx text={"Participant quota"} /><TInput name="capacity" type="number" min={1} required defaultValue={value?.capacity || 20} /></label>
        <label className="field"><Tx text={"Enrollment"} />
          <select name="enrollment" defaultValue={value?.enrollment || "OPEN"}>
            <option value="OPEN"><Tx text={"Open registration"} /></option>
            <option value="ASSIGNED"><Tx text={"Assigned only"} /></option>
          </select>
        </label>
        <label className="field"><Tx text={"Target"} /><TInput name="target" defaultValue={value?.target || ""} placeholder="Department, position, or employee" /></label>
        <label className="field"><Tx text={"Material link"} /><TInput name="materialUrl" defaultValue={value?.materialUrl || ""} placeholder="https://" /></label>
        {employees ? (
          <label className="field"><Tx text={"Assign an employee"} />
            <select name="employeeId" defaultValue=""><option value="">—</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
          </label>
        ) : null}
      </div>
      <label className="field"><Tx text={"Training description"} /><TTextarea name="description" defaultValue={value?.description || ""} /></label>
      <label className="field"><Tx text={"Training objective"} /><TTextarea name="objective" defaultValue={value?.objective || ""} /></label>
    </>
  );
}
