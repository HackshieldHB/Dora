"use client";

import Link from "next/link";
import { translate } from "@/lib/i18n";
import type { ModuleItem, ModuleSection } from "@/lib/workspace";

function tone(href: string) {
  if (href === "/menu") return "slate";
  if (href.includes("leave")) return "purple";
  if (href.includes("attendance")) return "teal";
  if (href.includes("payroll") || href.includes("payslip")) return "green";
  if (href.includes("benefit") || href.includes("goal")) return "yellow";
  if (href.includes("approval")) return "orange";
  if (href.includes("profile") || href.includes("employee")) return "blue";
  if (href.includes("overtime")) return "amber";
  if (href.includes("training")) return "pink";
  if (href.includes("organization") || href.includes("report")) return "slate";
  return "teal";
}

function Glyph({ href }: { href: string }) {
  const name = href === "/menu" ? "grid"
    : href.includes("leave") ? "calendar"
    : href.includes("attendance") ? "clock"
    : href.includes("overtime") ? "timer"
    : href.includes("payslip") || href.includes("payroll") || href.includes("benefit") ? "receipt"
    : href.includes("approval") ? "check"
    : href.includes("goal") || href.includes("report") ? "chart"
    : href.includes("organization") ? "building"
    : href.includes("setting") || href.includes("tax") ? "gear"
    : href.includes("profile") || href.includes("employee") ? "user"
    : href.includes("training") ? "cap"
    : "home";
  const paths: Record<string, string> = {
    home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
    calendar: "M5 6h14v13H5zM8 4v4M16 4v4M5 10h14",
    timer: "M12 8v5l3 2M9 3h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
    receipt: "M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2zM9 8h6M9 12h6",
    check: "M8 12l3 3 5-6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
    chart: "M4 19h16M7 16V9M12 16V5M17 16v-4",
    building: "M4 20h16M6 20V5h8v15M14 9h4v11M9 8h2M9 12h2",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v2M12 19v2M4.9 6.5l1.7 1M17.4 16.5l1.7 1M3 12h2M19 12h2M4.9 17.5l1.7-1M17.4 7.5l1.7-1",
    cap: "M3 9 12 4l9 5-9 5-9-5M7 11.5V16c1.6 1.3 3.2 2 5 2s3.4-.7 5-2v-4.5",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}

export function ModuleStrip({ items, locale }: { items: ModuleItem[]; locale: string }) {
  const t = (value: string) => translate(locale, value);
  if (!items.length) return null;
  return (
    <div className="module-grid home-pins">
      {items.map((item) => (
        <Link key={item.href} className={`module-card tone-${tone(item.href)}`} href={item.href}>
          <span className="module-icon"><Glyph href={item.href} /></span>
          <span className="module-name">{t(item.label)}</span>
        </Link>
      ))}
    </div>
  );
}

export function ModuleBoard({ sections, locale }: { sections: ModuleSection[]; locale: string }) {
  const t = (value: string) => translate(locale, value);
  const items = sections.flatMap((section) => section.items);
  if (!items.length) return null;
  return (
    <section className="workspace">
      <div className="module-grid">
        {items.map((item) => (
          <Link key={item.href} className={`module-card tone-${tone(item.href)}`} href={item.href}>
            <span className="module-icon"><Glyph href={item.href} /></span>
            <span className="module-name">{t(item.label)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
