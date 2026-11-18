"use client";

import { useState } from "react";
import { Tx } from "@/components/locale";

type Branch = { id: string; name: string };
type Location = { id: string; name: string; branchId: string | null };

export function PlacementFields({
  branches,
  locations,
  branchId = "",
  locationId = "",
}: {
  branches: Branch[];
  locations: Location[];
  branchId?: string;
  locationId?: string;
}) {
  const [branch, setBranch] = useState(branchId);
  const [location, setLocation] = useState(locationId);
  const linked = locations.filter((row) => row.branchId === branch);
  const current = locations.find((row) => row.id === location);
  const keepCurrent = Boolean(current && branch === branchId && location === locationId && current.branchId !== branch);
  const options = keepCurrent && current ? [current, ...linked.filter((row) => row.id !== current.id)] : linked;

  function chooseBranch(value: string) {
    setBranch(value);
    const stillValid = locations.some((row) => row.id === location && row.branchId === value);
    const unchanged = value === branchId && location === locationId;
    if (!stillValid && !unchanged) setLocation("");
  }

  return (
    <>
      <label className="field">
        <Tx text="Branch" />
        <select name="branchId" value={branch} onChange={(event) => chooseBranch(event.target.value)}>
          <option value=""><Tx text="Select" /></option>
          {branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="field">
        <Tx text="Work location" />
        <select name="locationId" value={location} disabled={!branch} onChange={(event) => setLocation(event.target.value)}>
          <option value="">{branch ? (options.length ? <Tx text="Select" /> : <Tx text="No work locations for this branch" />) : <Tx text="Select a branch first" />}</option>
          {options.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
    </>
  );
}
