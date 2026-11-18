"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavItem } from "@/lib/permissions";
import { Avatar } from "./ui";
import { Logo } from "./logo";
import { languageAction, openNotificationAction, readAllNotificationsAction } from "@/app/actions";
import { translate } from "@/lib/i18n";
import { BOTTOM_NAV } from "@/lib/workspace";
import { LocaleProvider, TInput } from "./locale";
import { SearchField } from "./search-field";

function Icon({ name }: { name: string }) {
  const props = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, string> = {
    home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
    users: "M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2.2-2.9M16 5.1a3 3 0 0 1 0 5.8",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
    calendar: "M5 6h14v13H5zM8 4v4M16 4v4M5 10h14",
    timer: "M12 8v5l3 2M9 3h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
    receipt: "M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2zM9 8h6M9 12h6",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0",
    building: "M4 20h16M6 20V5h8v15M14 9h4v11M9 8h2M9 12h2",
    check: "M8 12l3 3 5-6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
    chart: "M4 19h16M7 16V9M12 16V5M17 16v-4",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v2M12 19v2M4.9 6.5l1.7 1M17.4 16.5l1.7 1M3 12h2M19 12h2M4.9 17.5l1.7-1M17.4 7.5l1.7-1",
    bell: "M6 16h12l-1.2-2.2A6 6 0 0 1 16 10V9a4 4 0 1 0-8 0v1a6 6 0 0 1-.8 3.8zM10 18a2 2 0 0 0 4 0",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    cap: "M3 9 12 4l9 5-9 5L3 9zM7 11.2V16c1.6 1.4 8.4 1.4 10 0v-4.8",
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path {...props} d={paths[name] || paths.home} />
    </svg>
  );
}

function iconFor(href?: string) {
  if (!href) return "home";
  if (href.startsWith("/me/attendance") || href.startsWith("/attendance")) return "clock";
  if (href.startsWith("/me/leave") || href.startsWith("/leave")) return "calendar";
  if (href.startsWith("/me/overtime") || href.startsWith("/overtime")) return "timer";
  if (href.startsWith("/me/benefits") || href.startsWith("/me/payslip") || href.startsWith("/payroll")) return "receipt";
  if (href.startsWith("/me/goals") || href.startsWith("/goals")) return "chart";
  if (href.startsWith("/me/training") || href.startsWith("/training")) return "cap";
  if (href.startsWith("/me/profile")) return "user";
  if (href.startsWith("/employees")) return "users";
  if (href.startsWith("/organization")) return "building";
  if (href.startsWith("/approvals")) return "check";
  if (href.startsWith("/reports")) return "chart";
  if (href.startsWith("/settings") || href.startsWith("/platform") || href.startsWith("/tax")) return "gear";
  if (href.startsWith("/notifications")) return "bell";
  return "home";
}

const CRUMB: Record<string, string> = {
  overview: "Overview",
  employees: "Employees",
  onboarding: "Onboarding",
  import: "Import",
  employment: "Employment",
  offboarding: "Offboarding",
  organization: "Organization",
  branches: "Branches",
  departments: "Departments",
  positions: "Positions",
  structure: "Structure",
  attendance: "Attendance",
  records: "Records",
  schedules: "Schedules",
  corrections: "Corrections",
  policy: "Policy",
  holidays: "Holidays",
  leave: "Leave",
  requests: "Requests",
  permission: "Permission",
  balances: "Balances",
  history: "History",
  overtime: "Overtime",
  calculation: "Calculation",
  payroll: "Payroll",
  compare: "Pay comparison",
  periods: "Periods",
  components: "Components",
  processing: "Processing",
  adjustments: "Adjustments",
  approval: "Approval",
  payslips: "Payslips",
  thr: "THR & bonus",
  tax: "Tax & BPJS",
  pph21: "PPh 21",
  config: "Configuration",
  approvals: "Approvals",
  pending: "Pending",
  workflow: "Workflow",
  delegation: "Delegation",
  reports: "Reports",
  settings: "Settings",
  users: "Users",
  roles: "Roles",
  permissions: "Permissions",
  matrix: "Access matrix",
  security: "Security",
  audit: "Audit log",
  notifications: "Notifications",
  me: "My work",
  payslip: "Payslip",
  profile: "Profile",
  benefits: "Benefits",
  goals: "Goals",
  training: "Training",
  catalog: "Catalog",
  schedule: "Schedule",
  evaluation: "Evaluation",
  loans: "Loans",
  menu: "Menu",
  forbidden: "Access denied",
  platform: "Platform",
  tenants: "Tenants",
  rules: "Rules",
};

function isSettings(item: NavItem) {
  const hrefs = [item.href, ...(item.children?.map((child) => child.href) ?? [])];
  return hrefs.some((href) => href?.startsWith("/settings") || href?.startsWith("/platform"));
}

function splitNav(nav: NavItem[]) {
  const mine: NavItem[] = [];
  const rest: NavItem[] = [];
  for (const item of nav) {
    if (!item.children) {
      rest.push(item);
      continue;
    }
    const myChildren = item.children.filter((child) => child.href?.startsWith("/me/"));
    const other = item.children.filter((child) => !child.href?.startsWith("/me/"));
    mine.push(...myChildren);
    if (other.length) rest.push({ ...item, children: other });
  }
  return {
    home: rest.filter((item) => !item.children && !isSettings(item)),
    mine,
    groups: rest.filter((item) => item.children && !isSettings(item)),
    settings: rest.filter(isSettings),
  };
}

function activeHref(path: string, href: string | undefined, hrefs: string[]) {
  if (!href) return false;
  if (path === href) return true;
  if (!path.startsWith(`${href}/`)) return false;
  return !hrefs.some((other) => other !== href && (path === other || path.startsWith(`${other}/`)) && other.length > href.length);
}

function crumbs(path: string) {
  const parts = path.split("/").filter(Boolean);
  const items: { href: string; label: string }[] = [];
  let href = "";
  for (const part of parts) {
    href += `/${part}`;
    const known = CRUMB[part];
    items.push({ href: part === "me" ? "/overview" : href, label: known || (part.length > 12 ? "Details" : part) });
  }
  return items;
}

export function Shell({
  nav,
  user,
  notices,
  children,
}: {
  nav: NavItem[];
  user: { name: string; role: string; company: string; unread: number; photo?: string; locale: string };
  notices: { id: string; title: string; body: string; href: string; time: string; read: boolean }[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const text = (value: string) => translate(user.locale, value);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { home, mine, groups, settings } = splitNav(nav);
  const hrefs = nav.flatMap((item) => [item.href, ...(item.children?.map((child) => child.href) ?? [])]).filter((href): href is string => Boolean(href));
  const canSearch = hrefs.includes("/employees");
  const trail = crumbs(path);
  const close = () => setOpen(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("dora-sidebar") === "1");
  }, []);

  function setCollapsedPersist(value: boolean) {
    setCollapsed(value);
    window.localStorage.setItem("dora-sidebar", value ? "1" : "0");
  }

  function isOpen(label: string, hasActive: boolean) {
    return label in openGroups ? openGroups[label] : hasActive;
  }

  function toggle(label: string, hasActive: boolean) {
    if (collapsed) {
      setCollapsedPersist(false);
      setOpenGroups((current) => ({ ...current, [label]: true }));
      return;
    }
    setOpenGroups((current) => ({ ...current, [label]: !(label in current ? current[label] : hasActive) }));
  }

  function ItemLink({ item, child = false }: { item: NavItem; child?: boolean }) {
    const active = activeHref(path, item.href, hrefs);
    return (
        <Link className={`${child ? "nav-link child" : "nav-link"}${active ? " active" : ""}`} href={item.href || "#"} title={text(item.label)} onClick={close}>
        {child ? <span className="nav-dot" /> : <Icon name={iconFor(item.href)} />}
        <span className="nav-text">{text(item.label)}</span>
      </Link>
    );
  }

  function Group({ item }: { item: NavItem }) {
    const children = item.children ?? [];
    const hasActive = children.some((child) => activeHref(path, child.href, hrefs)) || activeHref(path, item.href, hrefs);
    const expanded = isOpen(item.label, hasActive);
    return (
      <div className="nav-group">
        <button className="nav-toggle" type="button" title={text(item.label)} aria-expanded={expanded} onClick={() => toggle(item.label, hasActive)}>
          <Icon name={iconFor(item.href || children[0]?.href)} />
          <span className="nav-text">{text(item.label)}</span>
          <span className="chev" />
        </button>
        {expanded ? children.map((child) => <ItemLink key={child.href} item={child} child />) : null}
      </div>
    );
  }

  const bottom = BOTTOM_NAV.filter((item) => item.gate === "always" || hrefs.includes(item.href));

  return (
    <LocaleProvider locale={user.locale}>
    <div className={collapsed ? "shell collapsed" : "shell"}>
      <button className={open ? "scrim show" : "scrim"} type="button" aria-label={text("Close menu")} onClick={close} />
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand-lockup">
          <Logo />
          <div className="brand-copy">
            <div className="brand">DORA</div>
            <div className="brand-sub">{user.company}</div>
          </div>
          <button className="collapse-btn" type="button" aria-label={text(collapsed ? "Expand sidebar" : "Collapse sidebar")} onClick={() => setCollapsedPersist(!collapsed)}>
            {collapsed ? ">" : "<"}
          </button>
        </div>
        <div className="nav-scroll">
          {home.map((item) => <ItemLink key={item.href} item={item} />)}
          {mine.length ? <div className="nav-section">{text("My work")}</div> : null}
          {mine.map((item) => <ItemLink key={item.href} item={item} />)}
          {groups.length ? <div className="nav-section">{text("Manage")}</div> : null}
          {groups.map((item) => <Group key={item.label} item={item} />)}
          {settings.length ? <div className="nav-section">{text("Admin")}</div> : null}
          {settings.map((item) => item.children ? <Group key={item.label} item={item} /> : <ItemLink key={item.href} item={item} />)}
        </div>
        <div className="sidebar-user">
          <Avatar name={user.name} small src={user.photo} />
          <div>
            <strong>{user.name}</strong>
            <span className="hint">{user.role}</span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn btn secondary" type="button" aria-label={text("Menu")} onClick={() => setOpen((value) => !value)}><Icon name="grid" /></button>
          {path === "/menu" ? <span className="top-brand">DORA</span> : (
            <nav className="crumbs" aria-label={text("Breadcrumb")}>
              {trail.map((item, index) => index === trail.length - 1 ? <span key={item.href} className="current">{text(item.label)}</span> : <span key={item.href}><Link href={item.href}>{text(item.label)}</Link> <span aria-hidden="true">/</span></span>)}
            </nav>
          )}
          {canSearch ? (
            <form className="search" action="/employees" method="get">
              <SearchField placeholder="Search employees" />
            </form>
          ) : null}
          <div className="top-actions">
            <details className="notice-menu">
              <summary className="bell" aria-label={user.unread ? `${text("Notifications")}, ${user.unread}` : text("Notifications")}>
                <Icon name="bell" />
                {user.unread ? <span className="count">{user.unread}</span> : null}
              </summary>
              <div className="notice-panel">
                <div className="notice-head">
                  <strong>{text("Notifications")}</strong>
                  {user.unread ? (
                    <form action={readAllNotificationsAction}>
                      <TInput type="hidden" name="return" value={path} />
                      <button className="text-action" type="submit">{text("Read all")}</button>
                    </form>
                  ) : null}
                </div>
                {notices.length === 0 ? <p className="empty">{text("No notifications yet.")}</p> : notices.map((notice) => (
                  <form key={notice.id} action={openNotificationAction}>
                    <TInput type="hidden" name="id" value={notice.id} />
                    <button className={notice.read ? "notice-item" : "notice-item unread"} type="submit">
                      <strong>{text(notice.title)}</strong>
                      <span>{text(notice.body)}</span>
                      <span className="hint">{notice.time}{notice.href ? ` · ${text("Open request")}` : ""}</span>
                    </button>
                  </form>
                ))}
                <Link className="notice-more" href="/notifications">{text("See all notifications")}</Link>
              </div>
            </details>
            <details className="user-menu">
              <summary><Avatar name={user.name} small src={user.photo} /><span className="nav-text">{user.name.split(" ")[0]}</span></summary>
              <div className="user-menu-panel">
                <p><strong>{user.name}</strong><br /><span className="hint">{user.role}</span></p>
                <form action={languageAction}>
                  <TInput type="hidden" name="return" value={path} />
                  <label className="field">{text("Language")}
                    <select name="locale" defaultValue={user.locale} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
                      <option value="en">English</option>
                      <option value="id">Bahasa Indonesia</option>
                    </select>
                  </label>
                </form>
                <form action="/logout" method="post"><button className="btn secondary" type="submit">{text("Log out")}</button></form>
              </div>
            </details>
          </div>
        </header>
        <div className={path === "/overview" ? "content wide" : path === "/menu" ? "content launcher-page" : "content"}>{children}</div>
      </div>
      <nav className="bottom-nav" aria-label="Mobile">
        {bottom.map((item) => (
          <Link key={item.href} className={activeHref(path, item.href, hrefs) ? "active" : ""} href={item.href}>
            <Icon name={iconFor(item.href)} />
            {item.label === "My account" && text(item.label).includes(" ") ? "Account" : text(item.label).split(" ")[0]}
          </Link>
        ))}
      </nav>
    </div>
    </LocaleProvider>
  );
}
