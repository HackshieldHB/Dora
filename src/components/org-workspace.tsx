"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Tx, TInput } from "@/components/locale";
import { SearchField } from "@/components/search-field";
import { departmentAction, positionAction } from "@/app/actions";
import { translate } from "@/lib/i18n";

type Department = { id: string; name: string; parentId: string | null; maxOnLeave: number };
type Position = { id: string; name: string };
type Person = { id: string; fullName: string; managerId: string | null; department: string; position: string };

export function OrgWorkspace({
  tab,
  locale,
  canManage,
  departments,
  positions,
  people,
}: {
  tab: "divisions" | "positions" | "structure";
  locale: string;
  canManage: boolean;
  departments: Department[];
  positions: Position[];
  people: Person[];
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visibleDepartments = departments.filter((row) => !needle || row.name.toLowerCase().includes(needle));
  const visiblePositions = positions.filter((row) => !needle || row.name.toLowerCase().includes(needle));
  return (
    <div>
      <div className="tabs">
        <Link className={tab === "divisions" ? "active" : ""} href="/organization/manage?tab=divisions"><Tx text="Divisions" /></Link>
        <Link className={tab === "positions" ? "active" : ""} href="/organization/manage?tab=positions"><Tx text="Positions" /></Link>
        <Link className={tab === "structure" ? "active" : ""} href="/organization/manage?tab=structure"><Tx text="Organization structure" /></Link>
      </div>
      <SearchField placeholder="Search" value={query} onChange={setQuery} />
      {tab === "divisions" ? (
        <section className="card">
          <div className="record-list">
            {visibleDepartments.map((row) => (
              <p className="record" key={row.id}>
                <strong>{row.name}</strong>
                <span>{row.maxOnLeave > 0 ? `${translate(locale, "Max")} ${row.maxOnLeave}` : translate(locale, "No leave cap")}{row.parentId ? ` · ${departments.find((item) => item.id === row.parentId)?.name || ""}` : ""}</span>
              </p>
            ))}
          </div>
          {canManage ? (
            <details className="drawer">
              <summary><Tx text="Save department" /></summary>
              <form action={departmentAction} className="inset">
                <label className="field"><Tx text="Name" /><TInput name="name" placeholder="Department name" required /></label>
                <label className="field"><Tx text="Max people on leave at once" /><TInput name="maxOnLeave" type="number" min={0} defaultValue={0} /></label>
                <label className="field"><Tx text="Parent" /><select name="parentId"><option value=""><Tx text="No parent" /></option>{departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="field"><Tx text="Effective date" /><TInput name="effectiveDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <button className="btn" type="submit"><Tx text="Save department" /></button>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}
      {tab === "positions" ? (
        <section className="card">
          <div className="record-list">
            {visiblePositions.map((row) => <p className="record" key={row.id}><strong>{row.name}</strong></p>)}
          </div>
          {canManage ? (
            <details className="drawer">
              <summary><Tx text="Add position" /></summary>
              <form action={positionAction} className="inset">
                <label className="field"><Tx text="Name" /><TInput name="name" placeholder="Position name" required /></label>
                <button className="btn" type="submit"><Tx text="Add position" /></button>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}
      {tab === "structure" ? <OrgChart people={people} query={needle} /> : null}
    </div>
  );
}

function OrgChart({ people, query }: { people: Person[]; query: string }) {
  const ids = useMemo(() => new Set(people.map((person) => person.id)), [people]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const visible = useMemo(() => {
    if (!query) return new Set(people.map((person) => person.id));
    const keep = new Set<string>();
    const byId = new Map(people.map((person) => [person.id, person]));
    for (const person of people) {
      if (!person.fullName.toLowerCase().includes(query)) continue;
      let current: Person | undefined = person;
      while (current && !keep.has(current.id)) {
        keep.add(current.id);
        current = current.managerId ? byId.get(current.managerId) : undefined;
      }
    }
    return keep;
  }, [people, query]);
  const roots = people.filter((person) => visible.has(person.id) && (!person.managerId || !ids.has(person.managerId)));
  return (
    <section className="card org-chart">
      {roots.map((person) => <OrgNode key={person.id} person={person} people={people} visible={visible} collapsed={collapsed} toggle={(id) => setCollapsed((current) => ({ ...current, [id]: !current[id] }))} />)}
    </section>
  );
}

function OrgNode({
  person,
  people,
  visible,
  collapsed,
  toggle,
}: {
  person: Person;
  people: Person[];
  visible: Set<string>;
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
}) {
  const children = people.filter((item) => item.managerId === person.id && visible.has(item.id));
  const open = !collapsed[person.id];
  return (
    <div className="org-node">
      <button type="button" className="org-card" onClick={() => children.length && toggle(person.id)}>
        <strong>{person.fullName}</strong>
        <span>{[person.position, person.department].filter(Boolean).join(" · ") || "—"}</span>
        {person.managerId ? null : <em><Tx text="No direct supervisor" /></em>}
        {children.length ? <small>{open ? "–" : "+"} {children.length}</small> : null}
      </button>
      {open && children.length ? <div className="org-children">{children.map((child) => <OrgNode key={child.id} person={child} people={people} visible={visible} collapsed={collapsed} toggle={toggle} />)}</div> : null}
    </div>
  );
}
