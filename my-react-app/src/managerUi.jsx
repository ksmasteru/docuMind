// Shared components of the manager pages; the constants and formatters are in managerUtils.js.
import { PRIORITY_LABEL, PRIORITY_STYLE } from "./managerUtils";

export const PriorityBadge = ({ priority }) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.LOW}`}>
        {PRIORITY_LABEL[priority] ?? priority}
    </span>
);

export const PageHeader = ({ title, subtitle }) => (
    <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </header>
);

export const GroupHeading = ({ children }) => (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
);

export const ListSkeleton = () => (
    <ul className="space-y-2">
        {[0, 1, 2].map((i) => (
            <li key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
    </ul>
);

export const ErrorBanner = ({ message, onRetry }) => (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        <p>{message}</p>
        {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 font-medium underline hover:no-underline">
                Réessayer
            </button>
        )}
    </div>
);

// a one-off confirmation passed through navigation state ("Task assigned", "Report approved")
export const Notice = ({ children }) => (
    <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        {children}
    </p>
);

export const EmptyState = ({ icon, title, hint }) => (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-700">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A75BC]/10 text-2xl dark:bg-[#5BC6E8]/15">
            {icon}
        </div>
        <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
);

// one expandable card: the summary is a button, the details show under a divider when open
export const ExpandableCard = ({ isOpen, onToggle, summary, tone = "", children }) => (
    <li className={`rounded-2xl border bg-white dark:bg-slate-800 ${
        isOpen ? "border-slate-400 dark:border-slate-500" : "border-slate-200 dark:border-slate-700"
    } ${tone}`}>
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left">
            <div className="min-w-0 flex-1">{summary}</div>
            <svg className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
            </svg>
        </button>
        {isOpen && (
            <div className="border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-700">{children}</div>
        )}
    </li>
);

export const SectionLabel = ({ children, className = "" }) => (
    <h3 className={`text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${className}`}>{children}</h3>
);

// a dashboard panel: title, optional subtitle and action (a link, a badge) over its content
export const Card = ({ id, title, subtitle, action, className = "", children }) => (
    <section id={id} className={`scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
        {(title || action) && (
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                    {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
                </div>
                {action}
            </header>
        )}
        {children}
    </section>
);

// marks what comes from the simulated twin, until the real one is connected
export const SimulatedBadge = () => (
    <span title="Généré dans le navigateur tant que le digital twin n'est pas connecté"
        className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Simulé
    </span>
);

// the hover box of the dashboard charts (recharts' Tooltip content); format turns a point into its lines
export const ChartTooltip = ({ active, payload, format }) => {
    if (!active || !payload?.length) return null;
    const { title, value } = format(payload[0].payload);
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-900">
            <p className="text-slate-500 dark:text-slate-400">{title}</p>
            <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{value}</p>
        </div>
    );
};
