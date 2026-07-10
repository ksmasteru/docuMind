import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useTheme } from "./ThemeContext";

// Sun icon — shown when dark mode is on (click to go light)
function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}

// Moon icon — shown when light mode is on (click to go dark)
function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

// Shared top navigation bar used by all authenticated pages.
// active prop highlights the current page link.
export function TopBar({ active }) {
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const linkClass = (page) =>
    `text-sm transition ${
      active === page
        ? "font-medium text-slate-900 dark:text-slate-100"
        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
    }`;

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <Link to="/documents" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        DocuMind
      </Link>
      <nav className="flex items-center gap-4">
        <Link to="/documents" className={linkClass("search")}>Documents</Link>
        <Link to="/upload" className={linkClass("upload")}>Upload</Link>
        <Link to="/ask" className={linkClass("ask")}>Ask</Link>
        <Link to="/users"  className={linkClass("users")}>Members</Link>
        {isAdmin && (
          <Link to="/admin" className={linkClass("admin")}>Admin</Link>
        )}
        <ThemeToggle />
        <button
          onClick={() => logout().then(() => navigate("/login"))}
          className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}

// Full-page wrapper used by authenticated pages: TopBar + scrollable content area.
export default function Layout({ active, children }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <TopBar active={active} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        {children}
      </main>
    </div>
  );
}
