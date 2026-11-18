import { Tx, TInput, TTextarea } from "@/components/locale";
import { lookups } from "@/server/lookups";
import { PlacementFields } from "@/components/placement-fields";

export function EmployeeForm({ action, data, employee, showSalary = false }: { action: (formData: FormData) => Promise<void>; data: Awaited<ReturnType<typeof lookups>>; employee?: Record<string, string | number | boolean | null>; showSalary?: boolean }) {
  const value = (key: string) => String(employee?.[key] ?? "");
  const yes = (key: string) => employee?.[key] === true || employee?.[key] === "Ya" ? "Ya" : "Tidak";
  return (
    <form action={action} className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
      {employee?.id ? <TInput type="hidden" name="id" value={String(employee.id)} /> : null}
      <label className="field"><Tx text={"Employee ID"} /><TInput name="employeeCode" defaultValue={value("employeeCode")} required /></label>
      <label className="field"><Tx text={"Full name"} /><TInput name="fullName" defaultValue={value("fullName")} required /></label>
      <label className="field"><Tx text={"Work email"} /><TInput name="email" type="email" defaultValue={value("email")} /></label>
      <label className="field"><Tx text={"Phone"} /><TInput name="phone" defaultValue={value("phone")} /></label>
      <label className="field"><Tx text={"Department"} /><select name="departmentId" defaultValue={value("departmentId")}><option value=""><Tx text={"Select"} /></option>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="field"><Tx text={"Position"} /><select name="positionId" defaultValue={value("positionId")}><option value=""><Tx text={"Select"} /></option>{data.positions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="field"><Tx text={"System access role"} /><select name="accessRoleId" defaultValue={value("accessRoleId") || data.roles.find((role) => role.key === "employee")?.id || ""}>{data.roles.filter((role) => role.key !== "company_admin" && role.key !== "platform" && (role.active || role.id === value("accessRoleId"))).map((role) => <option key={role.id} value={role.id}>{role.name}{role.active ? "" : " (inactive)"}</option>)}</select></label>
      <PlacementFields branches={data.branches} locations={data.locations} branchId={value("branchId")} locationId={value("locationId")} />
      <label className="field"><Tx text={"Direct supervisor"} /><select name="managerId" defaultValue={value("managerId")}><option value=""><Tx text={"None"} /></option>{data.employees.filter((row) => row.id !== employee?.id).map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label>
      <label className="field"><Tx text={"Join date"} /><TInput name="joinDate" type="date" defaultValue={value("joinDate")} /></label>
      <label className="field"><Tx text={"Birth date"} /><TInput name="birthDate" type="date" defaultValue={value("birthDate")} /></label>
      <label className="field"><Tx text={"Employment type"} /><select name="employmentType" defaultValue={value("employmentType") || "PERMANENT"}><option value="PERMANENT"><Tx text="Permanent" /></option><option value="CONTRACT"><Tx text="Contract" /></option><option value="PROBATION"><Tx text="Probation" /></option></select></label>
      <label className="field"><Tx text={"Contract end"} /><TInput name="contractEnd" type="date" defaultValue={value("contractEnd")} /></label>
      <label className="field"><Tx text={"PTKP"} /><TInput name="ptkp" defaultValue={value("ptkp") || "TK/0"} /></label>
      <label className="field"><Tx text={"NIK"} /><TInput name="nik" defaultValue={value("nik")} /></label>
      <label className="field"><Tx text={"NPWP"} /><TInput name="npwp" defaultValue={value("npwp")} /></label>
      <label className="field"><Tx text={"Tax status"} /><TInput name="taxStatus" defaultValue={value("taxStatus")} /></label>
      <label className="field"><Tx text={"PTKP effective date"} /><TInput name="ptkpStart" type="date" defaultValue={value("ptkpStart")} /></label>
      <p className="section-label" style={{ gridColumn: "1 / -1" }}><Tx text={"BPJS Kesehatan"} /></p>
      <label className="field"><Tx text={"Enrolled in BPJS Kesehatan"} /><select name="bpjsHealthOn" defaultValue={yes("bpjsHealthOn")}><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></label>
      <label className="field"><Tx text={"BPJS Kesehatan number"} /><TInput name="bpjsHealthNo" defaultValue={value("bpjsHealthNo")} /></label>
      <label className="field"><Tx text={"Care class"} /><select name="bpjsHealthClass" defaultValue={value("bpjsHealthClass")}><option value=""></option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
      <label className="field"><Tx text={"BPJS Kesehatan start"} /><TInput name="bpjsHealthStart" type="date" defaultValue={value("bpjsHealthStart")} /></label>
      <p className="section-label" style={{ gridColumn: "1 / -1" }}><Tx text={"BPJS Ketenagakerjaan"} /></p>
      <label className="field"><Tx text={"Enrolled in BPJS Ketenagakerjaan"} /><select name="bpjsTkOn" defaultValue={yes("bpjsTkOn")}><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></label>
      <label className="field"><Tx text={"BPJS Ketenagakerjaan number"} /><TInput name="bpjsTkNo" defaultValue={value("bpjsTkNo")} /></label>
      <label className="field"><Tx text={"JHT"} /><select name="bpjsJht" defaultValue={yes("bpjsJht")}><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></label>
      <label className="field"><Tx text={"JKK"} /><select name="bpjsJkk" defaultValue={yes("bpjsJkk")}><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></label>
      <label className="field"><Tx text={"JKM"} /><select name="bpjsJkm" defaultValue={yes("bpjsJkm")}><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></label>
      <label className="field"><Tx text={"JP"} /><select name="bpjsJp" defaultValue={yes("bpjsJp")}><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></label>
      <label className="field"><Tx text={"BPJS Ketenagakerjaan start"} /><TInput name="bpjsTkStart" type="date" defaultValue={value("bpjsTkStart")} /></label>
      <label className="field"><Tx text={"Bank"} /><TInput name="bankName" defaultValue={value("bankName")} /></label>
      <label className="field"><Tx text={"Account"} /><TInput name="bankAccount" defaultValue={value("bankAccount")} /></label>
      {showSalary ? <label className="field"><Tx text={"Basic salary"} /><TInput name="basicSalary" type="number" defaultValue={value("basicSalary")} /></label> : null}
      <label className="field" style={{ gridColumn: "1 / -1" }}><Tx text={"Address"} /><TTextarea name="address" defaultValue={value("address")} /></label>
      <button className="btn" type="submit"><Tx text={employee ? "Save" : "Save draft"} /></button>
    </form>
  );
}
