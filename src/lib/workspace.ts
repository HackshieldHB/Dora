import type { NavItem } from "./permissions";

export type ModuleItem = { href: string; label: string };
export type ModuleSection = { title: string; items: ModuleItem[] };

export function moduleSections(nav: NavItem[]): ModuleSection[] {
  const home = nav.filter((item) => item.href && !item.children).map((item) => ({ href: item.href as string, label: item.label }));
  const mine: ModuleItem[] = [];
  const manage: ModuleSection[] = [];
  for (const item of nav) {
    if (!item.children) continue;
    mine.push(...item.children.filter((child) => child.href?.startsWith("/me/")).map((child) => ({ href: child.href as string, label: child.label })));
    const rest = item.children.filter((child) => child.href && !child.href.startsWith("/me/")).map((child) => ({ href: child.href as string, label: child.label }));
    if (rest.length) manage.push({ title: item.label, items: rest });
  }
  return [
    ...(home.length ? [{ title: "Overview", items: home }] : []),
    ...(mine.length ? [{ title: "My work", items: mine }] : []),
    ...manage,
  ];
}

export const BOTTOM_NAV = [
  { href: "/overview", label: "Overview", gate: "nav" },
  { href: "/me/attendance", label: "Attendance", gate: "nav" },
  { href: "/me/leave", label: "Leave", gate: "nav" },
  { href: "/notifications", label: "Notifications", gate: "always" },
  { href: "/me/profile", label: "My account", gate: "nav" },
] as const;
