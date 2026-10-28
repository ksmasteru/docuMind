// The intranet frame for the roles in SIDEBAR_ROLES (roleTabs.js): a sidebar grouped by
// section, a header with the live alerts bell and the account, and the page under it.
// Below the lg breakpoint the sidebar becomes a drawer opened from the header.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Radio, X } from "lucide-react";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import phovaLogo from "./assets/phova_logo.png";
import { useFleet } from "./fleetSimulator";
import { syncAlerts } from "./alertStore";
import { NAV_LINKS, NAV_SECTIONS, homeFor, tabsFor } from "./roleTabs";

const ROLE_LABEL = { MANAGER: "Manager", ADMIN: "Administrateur", USER: "Technicien" };

function NavItem({ page, active, onNavigate }) {
  const { to, label, icon: Icon, soon } = NAV_LINKS[page];
  if (soon) {
    return (
      <li className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400/70">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bientôt</span>
      </li>
    );
  }
  const isActive = active === page;
  return (
    <li>
      <Link to={to} onClick={onNavigate} aria-current={isActive ? "page" : undefined}
        className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          isActive ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
        }`}>
        {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-[#5BC6E8]" aria-hidden="true" />}
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
    </li>
  );
}

function Sidebar({ active, onNavigate }) {
  const { user } = useAuth();
  const tabs = tabsFor(user?.role);
  return (
    <div className="flex h-full flex-col bg-[#0F2A49] text-slate-300">
      <Link to={homeFor(user?.role)} onClick={onNavigate} className="flex items-center gap-3 px-5 py-5">
        {/* the logo's navy lettering needs a white badge on the navy sidebar, in both themes */}
        <span className="rounded-md bg-white px-2 py-1"><img src={phovaLogo} alt="PHOVA Technology" className="h-6 w-auto" /></span>
        <span className="text-sm font-semibold text-white">GreenSense 4.0</span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Navigation principale">
        {NAV_SECTIONS.map(({ title, pages }) => {
          const shown = pages.filter((page) => tabs.includes(page));
          if (shown.length === 0) return null;
          return (
            <div key={title}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
              <ul className="space-y-0.5">
                {shown.map((page) => <NavItem key={page} page={page} active={active} onNavigate={onNavigate} />)}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* where the live data comes from, so nobody mistakes the simulation for the plant */}
      <div className="m-3 rounded-xl bg-white/5 px-3 py-3 text-xs">
        <p className="flex items-center gap-2 font-medium text-white">
          <Radio className="h-3.5 w-3.5 text-[#fab219]" aria-hidden="true" />
          Digital twin
        </p>
        <p className="mt-1 text-slate-400">Pas encore connecté. Les données du parc sont simulées.</p>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.email?.[0] ?? ROLE_LABEL[user?.role]?.[0] ?? "?").toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A75BC] text-sm font-semibold text-white" aria-hidden="true">
        {initial}
      </span>
      <div className="hidden text-right leading-tight sm:block">
        {/* after a page reload the session only knows the role, not the email */}
        {user?.email && <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.email}</p>}
        <p className={user?.email ? "text-xs text-slate-500 dark:text-slate-400" : "text-sm font-medium text-slate-900 dark:text-slate-100"}>
          {ROLE_LABEL[user?.role] ?? user?.role}
        </p>
      </div>
      <button type="button" onClick={() => logout().then(() => navigate("/login"))} aria-label="Se déconnecter" title="Se déconnecter"
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function AppShell({ active, contentClass, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { alerts, updatedAt } = useFleet();
  // every page of the frame keeps the alert cases following the twin, so none is missed
  useEffect(() => syncAlerts(alerts, updatedAt), [alerts, updatedAt]);
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div lang="fr" className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* fixed sidebar on large screens */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar active={active} />
      </aside>

      {/* drawer on small screens */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeDrawer} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button type="button" onClick={closeDrawer} aria-label="Fermer le menu"
              className="absolute right-3 top-5 rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Sidebar active={active} onNavigate={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 dark:border-slate-700 dark:bg-slate-800/90">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden dark:text-slate-400 dark:hover:bg-slate-700">
              <Menu className="h-5 w-5" />
            </button>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{NAV_LINKS[active]?.label}</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/dashboard#alerts" aria-label={`${alerts.length} alertes en direct`} title="Alertes en direct"
              className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100">
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && (
                <span className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                  critical ? "bg-[#d03b3b]" : "bg-[#ec835a]"
                }`}>{alerts.length}</span>
              )}
            </Link>
            <ThemeToggle />
            <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
            <AccountMenu />
          </div>
        </header>

        <main className={`px-4 py-6 sm:px-6 lg:py-8 ${contentClass}`}>{children}</main>
      </div>
    </div>
  );
}
