"use client";

import { useState } from "react";
import { Tx } from "@/components/locale";

export function AttendancePhoto({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return <Tx text="Not available yet" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={48} height={48} style={{ objectFit: "cover", borderRadius: 8, display: "block" }} />
      </button>
      {open ? (
        <button type="button" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", background: "rgba(8,18,36,.72)", border: 0, padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" style={{ maxWidth: "min(920px, 92vw)", maxHeight: "88vh", borderRadius: 12 }} />
        </button>
      ) : null}
    </>
  );
}
