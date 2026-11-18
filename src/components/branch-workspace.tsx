import Link from "next/link";
import { Tx, TInput } from "@/components/locale";
import { LocationForm } from "@/components/location-form";
import { branchAction } from "@/app/actions";

type Branch = { id: string; name: string; code: string; address: string };
type Location = { id: string; name: string; address: string; lat: number | null; lng: number | null; radiusMeters: number; branchId: string | null };

export function BranchWorkspace({
  branches,
  locations,
  selectedId,
  canManage,
}: {
  branches: Branch[];
  locations: Location[];
  selectedId: string;
  canManage: boolean;
}) {
  const selected = branches.find((row) => row.id === selectedId) || branches[0];
  const children = selected ? locations.filter((row) => row.branchId === selected.id) : [];
  const unassigned = locations.filter((row) => !row.branchId);
  return (
    <div>
      <div className="org-board">
        <section className="card">
          <p className="section-label"><Tx text="Branches" /></p>
          <div className="record-list">
            {branches.map((row) => (
              <Link key={row.id} className={selected?.id === row.id ? "record active" : "record"} href={`/organization/branches?branch=${row.id}`}>
                <strong>{row.name}</strong>
                <span>{row.code}</span>
              </Link>
            ))}
          </div>
          {canManage ? (
            <details className="drawer">
              <summary><Tx text="Add branch" /></summary>
              <form action={branchAction} className="inset">
                <label className="field"><Tx text="Name" /><TInput name="name" placeholder="Branch name" required /></label>
                <label className="field"><Tx text="Code" /><TInput name="code" placeholder="Code" required /></label>
                <label className="field"><Tx text="Address" /><TInput name="address" placeholder="Address" /></label>
                <button className="btn" type="submit"><Tx text="Add branch" /></button>
              </form>
            </details>
          ) : null}
        </section>
        <section className="card">
          {selected ? (
            <>
              <p className="section-label"><Tx text="Branch" /></p>
              {canManage ? (
                <form action={branchAction} className="stack-form">
                  <TInput type="hidden" name="id" value={selected.id} />
                  <label className="field"><Tx text="Name" /><TInput name="name" defaultValue={selected.name} required /></label>
                  <label className="field"><Tx text="Code" /><TInput name="code" defaultValue={selected.code} required /></label>
                  <label className="field"><Tx text="Address" /><TInput name="address" defaultValue={selected.address} /></label>
                  <button className="btn secondary" type="submit"><Tx text="Save" /></button>
                </form>
              ) : <p className="record"><strong>{selected.name}</strong><span>{selected.address || selected.code}</span></p>}
              <p className="section-label"><Tx text="Work locations" /></p>
              {children.length === 0 ? <p className="empty"><Tx text="No work locations for this branch" /></p> : (
                <div className="record-list">
                  {children.map((row) => (
                    <div key={row.id}>
                      <p className="record">
                        <strong>{row.name}</strong>
                        <span>{row.address || "—"} · {row.lat ?? "—"}, {row.lng ?? "—"} · {row.radiusMeters > 0 ? `${row.radiusMeters} m` : "0 m"}</span>
                      </p>
                      {canManage ? (
                        <details className="drawer">
                          <summary><Tx text="Edit" /></summary>
                          <LocationForm branchId={selected.id} location={row} />
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {canManage ? (
                <details className="drawer">
                  <summary><Tx text="Add location" /></summary>
                  <LocationForm branchId={selected.id} />
                </details>
              ) : null}
            </>
          ) : <p className="empty"><Tx text="No results found" /></p>}
          {unassigned.length ? <p className="hint"><Tx text="Work locations without a branch stay unassigned until you add them under a branch." /> {unassigned.map((row) => row.name).join(", ")}</p> : null}
        </section>
      </div>
    </div>
  );
}
