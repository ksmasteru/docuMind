import { Link, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "./AuthContext";
import PhovaLogo from "./PhovaLogo";
import AppShell from "./AppShell";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_LINKS, SIDEBAR_ROLES, homeFor, tabsFor } from "./roleTabs";

// kept here too: the login and signup pages import it from this file
export { ThemeToggle };

// Shared top navigation bar of the roles without the sidebar (technicians, the workshop roles,
// admin), in the app's theme: the brand, the role's links as tabs (the current one underlined in
// the accent), the theme toggle and logout. active: the current page's key in NAV_LINKS.
export function TopBar({ active }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // set this variable to true to uncover visualize and user tab
  const showVisualize = false;
  const linkClass = (page) =>
    `relative flex h-14 items-center rounded-sm text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
      active === page
        ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
        : "text-muted-foreground hover:text-foreground"
    }`;
  const iconButton = "flex items-center justify-center rounded-sm p-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

  return (
    // wraps on a phone: the brand on one line, the links under it, so the page never gets wider than the screen
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-6 border-b border-border bg-background/85 px-4 font-ui backdrop-blur sm:px-6">
      <Link to={homeFor(user?.role)} className="flex h-14 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <PhovaLogo className="h-6" />
        <span className="border-l border-border pl-3 leading-tight">
          <span className="block text-sm font-semibold text-foreground">GreenSense 4.0</span>
          <span className="block font-data text-[10px] uppercase tracking-[0.14em] text-subtle">PHOVA</span>
        </span>
      </Link>
      <nav className="flex flex-wrap items-center gap-x-5" aria-label="Navigation principale">
        {/* each role sees its own links (roleTabs.js), like the mobile app's tabs; coming pages have no link yet */}
        {tabsFor(user?.role).filter((page) => NAV_LINKS[page].to).map((page) => (
          <Link key={page} to={NAV_LINKS[page].to} aria-current={active === page ? "page" : undefined} className={linkClass(page)}>
            {NAV_LINKS[page].label}
          </Link>
        ))}
        {showVisualize && <>
        <Link to="/data-visualisor" className={linkClass("visualize")}>Visualize</Link>

        <Link to="/users"  className={linkClass("users")}>Members</Link></>
        }
        <span className="flex items-center gap-1 py-2">
          <ThemeToggle className={iconButton} />
          <button type="button" onClick={() => logout().then(() => navigate("/login"))} aria-label="Se déconnecter" title="Se déconnecter"
            className={iconButton}>
            <LogOut className="size-4" />
          </button>
        </span>
      </nav>
    </header>
  );
}

// Full-page wrapper used by authenticated pages. The roles in SIDEBAR_ROLES get the intranet
// frame (AppShell.jsx); the others the TopBar over a scrollable content area.
// wide: opt-in wider content area (e.g. the A4 forms page); other pages keep max-w-2xl
// full: the whole width of the frame, for dashboards
export default function Layout({ active, wide = false, full = false, children }) {
  const { user } = useAuth();
  const width = full ? "max-w-[1440px]" : wide ? "max-w-6xl" : "max-w-2xl";

  if (SIDEBAR_ROLES.includes(user?.role))
    return <AppShell active={active} contentClass={`mx-auto ${width}`}>{children}</AppShell>;

  return (
    <div className="min-h-screen bg-background font-ui text-foreground">
      <TopBar active={active} />
      <main className={`mx-auto ${width} px-4 py-10`}>
        {children}
      </main>
    </div>
  );
}
