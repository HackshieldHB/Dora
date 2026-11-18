"use client";

import { useState } from "react";
import { translate } from "@/lib/i18n";
import { parseLevels, workflowModuleLabel, WORKFLOW_MODULES, type ApprovalLevel } from "@/lib/workflow";
import { workflowAction } from "@/app/actions";

type RoleChoice = { id: string; name: string; active: boolean };
type UserChoice = { id: string; name: string };
type WorkflowRow = { id: string; name: string; module: string; active: boolean; allowReturn: boolean; levelsJson: string };

const blank: ApprovalLevel = { kind: "DIRECT", roleId: "", userId: "" };

export function WorkflowEditor({ locale, roles, users, workflows }: { locale: string; roles: RoleChoice[]; users: UserChoice[]; workflows: WorkflowRow[] }) {
  const t = (value: string) => translate(locale, value);
  const [picked, setPicked] = useState("");
  const [levels, setLevels] = useState<ApprovalLevel[]>([{ ...blank }]);
  const [name, setName] = useState("");
  const [module, setModule] = useState<string>(WORKFLOW_MODULES[0].key);
  const [active, setActive] = useState(true);
  const [allowReturn, setAllowReturn] = useState(false);
  const current = workflows.find((row) => row.id === picked);
  const approverRoles = roles.filter((role) => role.active);

  function load(id: string) {
    setPicked(id);
    const row = workflows.find((item) => item.id === id);
    if (!row) {
      setName("");
      setModule(WORKFLOW_MODULES[0].key);
      setActive(true);
      setAllowReturn(false);
      setLevels([{ ...blank }]);
      return;
    }
    const parsed = parseLevels(row.levelsJson);
    setName(row.name);
    setModule(row.module);
    setActive(row.active);
    setAllowReturn(row.allowReturn);
    setLevels(parsed.length ? parsed : [{ ...blank }]);
  }

  function update(index: number, patch: Partial<ApprovalLevel>) {
    setLevels((rows) => rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  const preview = ["Employee", ...levels.map((level) => {
    if (level.kind === "ROLE") return approverRoles.find((role) => role.id === level.roleId)?.name || t("Role");
    if (level.kind === "USER") return users.find((user) => user.id === level.userId)?.name || t("Specific user");
    return t("Direct supervisor");
  }), "Approved"].map((step) => t(step)).join(" → ");

  return (
    <form action={workflowAction} className="card stack-form">
      <input type="hidden" name="id" value={current?.id || ""} />
      <input type="hidden" name="levels" value={JSON.stringify(levels)} />
      <label className="field">{t("Existing workflow")}
        <select value={picked} onChange={(event) => load(event.target.value)}>
          <option value="">{t("New workflow")}</option>
          {workflows.map((row) => <option key={row.id} value={row.id}>{row.name} · {t(workflowModuleLabel(row.module))}</option>)}
        </select>
      </label>
      <label className="field">{t("Workflow name")}<input name="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label className="field">{t("Request type")}
        <select name="module" value={module} onChange={(event) => setModule(event.target.value)}>
          {WORKFLOW_MODULES.map((item) => <option key={item.key} value={item.key}>{t(item.label)}</option>)}
        </select>
      </label>
      <div className="workflow-head"><strong>{t("Approval levels")}</strong><span>{levels.length} {t("levels")}</span></div>
      {levels.map((level, index) => (
        <div className="workflow-level" key={`${index}-${level.kind}`}>
          <div className="workflow-level-top">
            <strong>{t("Level")} {index + 1}</strong>
            <span>
              <button className="btn secondary" type="button" disabled={index === 0} onClick={() => setLevels((rows) => move(rows, index, -1))}>{t("Move up")}</button>
              <button className="btn secondary" type="button" disabled={index === levels.length - 1} onClick={() => setLevels((rows) => move(rows, index, 1))}>{t("Move down")}</button>
              <button className="btn secondary" type="button" disabled={levels.length === 1} onClick={() => setLevels((rows) => rows.filter((_, at) => at !== index))}>{t("Remove")}</button>
            </span>
          </div>
          <label className="field">{t("Approver")}
            <select value={level.kind === "ROLE" ? `role:${level.roleId}` : level.kind === "USER" ? "user" : "direct"} onChange={(event) => {
              const value = event.target.value;
              if (value === "direct") update(index, { kind: "DIRECT", roleId: "", userId: "" });
              else if (value === "user") update(index, { kind: "USER", roleId: "", userId: users[0]?.id || "" });
              else update(index, { kind: "ROLE", roleId: value.slice(5), userId: "" });
            }}>
              <option value="direct">{t("Direct supervisor")}</option>
              {approverRoles.map((role) => <option key={role.id} value={`role:${role.id}`}>{role.name}</option>)}
              <option value="user">{t("Specific user")}</option>
            </select>
          </label>
          {level.kind === "USER" ? (
            <label className="field">{t("User")}
              <select value={level.userId} onChange={(event) => update(index, { userId: event.target.value })}>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ))}
      <button className="btn secondary" type="button" onClick={() => setLevels((rows) => [...rows, { ...blank }])}>{t("Add approval level")}</button>
      <fieldset className="workflow-choice">
        <legend>{t("If the request is rejected")}</legend>
        <label><input type="radio" name="allowReturn" value="REJECT" checked={!allowReturn} onChange={() => setAllowReturn(false)} /> {t("Reject the request immediately")}</label>
        <label><input type="radio" name="allowReturn" value="RETURN" checked={allowReturn} onChange={() => setAllowReturn(true)} /> {t("Return for revision")}</label>
      </fieldset>
      <label className="field">{t("Workflow status")}
        <select name="active" value={active ? "true" : "false"} onChange={(event) => setActive(event.target.value === "true")}>
          <option value="true">{t("Active")}</option>
          <option value="false">{t("Inactive")}</option>
        </select>
      </label>
      <p className="workflow-preview"><strong>{t("Approval preview")}</strong><br />{preview}</p>
      <button className="btn" type="submit">{t("Save workflow")}</button>
    </form>
  );
}

function move(rows: ApprovalLevel[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= rows.length) return rows;
  const copy = [...rows];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}
