"use client";

export function ClearFilter({ label }: { label: string }) {
  return (
    <button className="btn secondary" type="button" onClick={() => window.location.assign("/overview")}>
      {label}
    </button>
  );
}
