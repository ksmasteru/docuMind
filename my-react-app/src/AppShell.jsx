// The intranet frame for the roles in SIDEBAR_ROLES (roleTabs.js): a sidebar grouped by
// section, a header with the live alerts bell and the account, and the page under it.
// Below the lg breakpoint the sidebar becomes a drawer opened from the header.
//
// The frame wears the app's theme (index.css): the console's tokens, light or dark with the toggle.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import phovaLogo from "./assets/phova_logo.png";
import { TICK_MS, useFleet } from "./fleetSimulator";
import { syncAlerts } from "./alertStore";
import { NAV_LINKS, NAV_SECTIONS, homeFor, tabsFor } from "./roleTabs";

const ROLE_LABEL = { MANAGER: "Manager", ADMIN: "Administrateur", USER: "Technicien" };

const MicroLabel = ({ className, children }) => (
  <p className={cn("font-data text-[10px] font-medium uppercase tracking-[0.14em] text-subtle", className)}>{children}</p>
);

// count: { value, tone } shown at the end of the link (the live alerts on Alertes)
function NavItem({ page, active, count, onNavigate }) {
  const { to, label, icon: Icon, soon } = NAV_LINKS[page];
  if (soon) {
    return (
      <li className="flex h-8 items-center gap-2.5 px-3 text-[13px] text-subtle">
        <Icon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        <span className="flex-1 truncate">{label}</span>
        <span className="rounded-sm border border-border px-1 font-data text-[9px] uppercase tracking-[0.12em]">Bientôt</span>
      </li>
    );
  }
  const isActive = active === page;
  return (
    <li>
      <Link to={to} onClick={onNavigate} aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex h-8 items-center gap-2.5 rounded-sm px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}>
        {/* the active page's rail sits on the sidebar's edge */}
        {isActive && <span className="absolute inset-y-1.5 -left-2 w-0.5 rounded-r-sm bg-primary" aria-hidden="true" />}
        <Icon aria-hidden="true"
          className={cn("size-4 shrink-0 transition-colors", isActive ? "text-primary" : "text-subtle group-hover:text-muted-foreground")} />
        <span className="flex-1 truncate">{label}</span>
        {count?.value > 0 && (
          <span className={cn("rounded-sm px-1.5 font-data text-[10px] font-semibold tabular-nums leading-4",
            count.tone === "crit" ? "bg-crit/15 text-crit" : "bg-warn/15 text-warn")}>
            {count.value}<span className="sr-only"> en cours</span>
          </span>
        )}
      </Link>
    </li>
  );
}

// where the live data comes from, so nobody mistakes the simulation for the plant
function TwinStatus({ pumps }) {
  return (
    <div className="m-2 rounded-sm border border-border bg-background/60 px-3 py-3">
      <p className="flex items-center gap-2">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-warn/50 motion-reduce:hidden" />
          <span className="relative size-2 rounded-full bg-warn" />
        </span>
        <span className="text-[13px] font-medium text-foreground">Digital twin</span>
        <span className="ml-auto font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-warn">Simulé</span>
      </p>
      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">Pas encore connecté. Les données du parc sont simulées.</p>
      <p className="mt-2 border-t border-border pt-2 font-data text-[10px] tabular-nums text-subtle">
        {pumps} pompes · 1 mesure / {TICK_MS / 1000} s
      </p>
    </div>
  );
}

function Sidebar({ active, alertCount, pumps, onNavigate, onClose }) {
  const { user } = useAuth();
  const tabs = tabsFor(user?.role);
  return (
    <div className="flex h-full flex-col border-r border-border bg-card font-ui text-foreground">
      {/* as tall as the header, so the two hairlines meet */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <Link to={homeFor(user?.role)} onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {/* the logo's navy lettering needs a white badge on the dark sidebar */}
          <span className="shrink-0 rounded-sm px-1.5 py-1 dark:bg-white"><img src={phovaLogo} alt="PHOVA Technology" className="h-5 w-auto" /></span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-foreground">GreenSense 4.0</span>
            <span className="block font-data text-[10px] uppercase tracking-[0.14em] text-subtle">Supervision</span>
          </span>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer le menu"
            className="rounded-sm p-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 py-4" aria-label="Navigation principale">
        {NAV_SECTIONS.map(({ title, pages }) => {
          const shown = pages.filter((page) => tabs.includes(page));
          if (shown.length === 0) return null;
          return (
            <div key={title}>
              <MicroLabel className="px-3 pb-1.5">{title}</MicroLabel>
              <ul className="space-y-px">
                {shown.map((page) => (
                  <NavItem key={page} page={page} active={active} onNavigate={onNavigate}
                    count={page === "alerts" ? alertCount : undefined} />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <TwinStatus pumps={pumps} />
    </div>
  );
}

// the header's parts, from the theme's tokens
const LOOK = {
  icon: "rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
};

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.email?.[0] ?? ROLE_LABEL[user?.role]?.[0] ?? "?").toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-sm bg-primary/15 font-data text-sm font-semibold text-primary ring-1 ring-inset ring-primary/30" aria-hidden="true">
        {initial}
      </span>
      <div className="hidden text-right leading-tight sm:block">
        {/* after a page reload the session only knows the role, not the email */}
        {user?.email && <p className="text-sm font-medium text-foreground">{user.email}</p>}
        <p className={user?.email ? "font-data text-[10px] uppercase tracking-[0.14em] text-subtle" : "text-sm font-medium text-foreground"}>
          {ROLE_LABEL[user?.role] ?? user?.role}
        </p>
      </div>
      <button type="button" onClick={() => logout().then(() => navigate("/login"))} aria-label="Se déconnecter" title="Se déconnecter"
        className={cn("p-1.5", LOOK.icon)}>
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export default function AppShell({ active, contentClass, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { alerts, updatedAt, pumps } = useFleet();
  // every page of the frame keeps the alert cases following the twin, so none is missed
  useEffect(() => syncAlerts(alerts, updatedAt), [alerts, updatedAt]);
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const alertCount = { value: alerts.length, tone: critical ? "crit" : "warn" };
  const closeDrawer = () => setDrawerOpen(false);
  const section = NAV_SECTIONS.find((s) => s.pages.includes(active))?.title;

  return (
    <div lang="fr" className="min-h-screen bg-background font-ui text-foreground">
      {/* fixed sidebar on large screens */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar active={active} alertCount={alertCount} pumps={pumps.length} />
      </aside>

      {/* drawer on small screens */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-2xl">
            <Sidebar active={active} alertCount={alertCount} pumps={pumps.length} onNavigate={closeDrawer} onClose={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu"
              className={cn("p-1.5 lg:hidden", LOOK.icon)}>
              <Menu className="size-5" />
            </button>
            <p className="flex min-w-0 items-baseline gap-2">
              {section && <>
                <span className="hidden font-data text-[10px] font-medium uppercase tracking-[0.14em] text-subtle sm:inline">{section}</span>
                <span aria-hidden="true" className="hidden text-subtle sm:inline">/</span>
              </>}
              <span className="truncate text-sm font-semibold text-foreground">{NAV_LINKS[active]?.label}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/dashboard#alerts" aria-label={`${alerts.length} alertes en direct`} title="Alertes en direct"
              className={cn("relative p-1.5", LOOK.icon)}>
              <Bell className="size-4" />
              {alerts.length > 0 && (
                <span className={cn("absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-data text-[10px] font-bold ring-2 ring-background",
                  critical ? "bg-crit text-background" : "bg-warn text-background")}>
                  {alerts.length}
                </span>
              )}
            </Link>
            <ThemeToggle className={cn("flex items-center justify-center p-1.5", LOOK.icon)} />
            <span className="h-6 w-px bg-border" aria-hidden="true" />
            <AccountMenu />
          </div>
        </header>

        <main className={`px-4 py-6 sm:px-6 lg:py-8 ${contentClass}`}>{children}</main>
      </div>
    </div>
  );
}
