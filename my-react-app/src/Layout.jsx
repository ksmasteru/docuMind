import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import PhovaLogo from "./PhovaLogo";
import AppShell from "./AppShell";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_LINKS, SIDEBAR_ROLES, homeFor, tabsFor } from "./roleTabs";

// kept here too: the login and signup pages import it from this file
export { ThemeToggle };

// Shared top navigation bar used by all authenticated pages.
// active prop highlights the current page link.
export function TopBar({ active }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // set this variable to true to uncover visualize and user tab
  const showVisualize = false;
  const linkClass = (page) =>
    `text-sm transition ${
      active === page
        ? "font-medium text-slate-900 dark:text-slate-100"
        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
    }`;

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <Link to={homeFor(user?.role)} className="flex items-center gap-3">
        <PhovaLogo className="h-7" />
        <span className="border-l border-slate-200 pl-3 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:text-slate-100">
          GreenSense 4.0
        </span>
      </Link>
      <nav className="flex items-center gap-4">
        {/* each role sees its own links (roleTabs.js), like the mobile app's tabs; coming pages have no link yet */}
        {tabsFor(user?.role).filter((page) => NAV_LINKS[page].to).map((page) => (
          <Link key={page} to={NAV_LINKS[page].to} className={linkClass(page)}>{NAV_LINKS[page].label}</Link>
        ))}
        {showVisualize && <>
        <Link to="/data-visualisor" className={linkClass("visualize")}>Visualize</Link>

        <Link to="/users"  className={linkClass("users")}>Members</Link></>
        }
        <ThemeToggle />
        <button
          onClick={() => logout().then(() => navigate("/login"))}
          className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Se déconnecter
        </button>
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <TopBar active={active} />
      <main className={`mx-auto ${width} px-4 py-10`}>
        {children}
      </main>
    </div>
  );
}
