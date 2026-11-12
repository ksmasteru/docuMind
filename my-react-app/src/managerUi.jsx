// Shared components of the manager pages; the constants and formatters are in managerUtils.js.
// They wear the app's theme (index.css): the console's tokens, light or dark with the toggle —
// hairline panels, mono micro-labels, color kept for status.
import { PRIORITY_LABEL, PRIORITY_STYLE } from "./managerUtils";

export const PriorityBadge = ({ priority }) => (
    <span className={`shrink-0 rounded-sm px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.LOW}`}>
        {PRIORITY_LABEL[priority] ?? priority}
    </span>
);

export const PageHeader = ({ title, subtitle }) => (
    <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </header>
);

export const GroupHeading = ({ children }) => (
    <h2 className="mb-2 font-data text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">{children}</h2>
);

export const ListSkeleton = () => (
    <ul className="space-y-2" role="status" aria-label="Chargement">
        {[0, 1, 2].map((i) => (
            <li key={i} className="h-16 animate-pulse rounded-md bg-foreground/[0.06]" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
    </ul>
);

export const ErrorBanner = ({ message, onRetry }) => (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">
        <p>{message}</p>
        {onRetry && (
            <button type="button" onClick={onRetry}
                className="shrink-0 rounded-sm font-medium underline outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">
                Réessayer
            </button>
        )}
    </div>
);

// a one-off confirmation passed through navigation state ("Task assigned", "Report approved")
export const Notice = ({ children }) => (
    <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
        {children}
    </p>
);

export const EmptyState = ({ icon, title, hint }) => (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
            {icon}
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
    </div>
);

// one expandable card: the summary is a button, the details show under a divider when open
export const ExpandableCard = ({ isOpen, onToggle, summary, tone = "", children }) => (
    <li className={`rounded-md border bg-card transition-colors ${isOpen ? "border-input" : "border-border hover:border-input"} ${tone}`}>
        <button type="button" onClick={onToggle} aria-expanded={isOpen}
            className="flex w-full items-start gap-3 rounded-md px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <div className="min-w-0 flex-1">{summary}</div>
            <svg className={`mt-1 h-4 w-4 shrink-0 text-subtle transition ${isOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
            </svg>
        </button>
        {isOpen && (
            <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
        )}
    </li>
);

export const SectionLabel = ({ children, className = "" }) => (
    <h3 className={`font-data text-[10px] font-medium uppercase tracking-[0.14em] text-subtle ${className}`}>{children}</h3>
);

// a page panel: title, optional subtitle and action (a link, a badge) over its content
export const Card = ({ id, title, subtitle, action, className = "", children }) => (
    <section id={id} className={`scroll-mt-24 rounded-md border border-border bg-card p-5 ${className}`}>
        {(title || action) && (
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
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
        className="shrink-0 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-warn">
        Simulé
    </span>
);

// the hover box of the pages' charts (recharts' Tooltip content); format turns a point into its lines
export const ChartTooltip = ({ active, payload, format }) => {
    if (!active || !payload?.length) return null;
    const { title, value } = format(payload[0].payload);
    return (
        <div className="rounded-sm border border-border bg-popover px-2.5 py-1.5 font-data text-[11px] shadow-md">
            <p className="text-subtle">{title}</p>
            <p className="mt-0.5 font-semibold text-foreground">{value}</p>
        </div>
    );
};
