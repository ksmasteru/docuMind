// The console's small parts: the hairline panel, the micro-label, the state glyph, and the inline
// instruments drawn in the fleet table (sparkline, vibration gauge, load bar).
import { useId } from "react";
import { CircleAlert, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LIMITS } from "../fleetSimulator";
import { STATE, TONE, VIBRATION_SCALE } from "./tokens";

export const MicroLabel = ({ as: Tag = "p", className, children }) => (
    <Tag className={cn("font-data text-[10px] font-medium uppercase tracking-[0.14em] text-subtle", className)}>{children}</Tag>
);

// one panel of the console. The panels sit in a grid whose 1px gaps show the border color,
// so neighbours share a single hairline. label: the micro-label over the title; meta: the muted
// text after it; action: the panel's links / controls, top right.
export function Panel({ id, label, title, meta, action, toolbar, footer, className, bodyClass, style, children }) {
    const titleId = useId();
    return (
        <section id={id} aria-labelledby={titleId} style={style}
            className={cn("console-rise flex min-w-0 scroll-mt-24 flex-col bg-card", className)}>
            <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-3.5">
                <div className="min-w-0">
                    {label && <MicroLabel>{label}</MicroLabel>}
                    <h2 id={titleId} className="mt-1 text-sm font-semibold text-foreground">
                        {title}
                        {meta != null && <span className="ml-2 font-normal text-muted-foreground">{meta}</span>}
                    </h2>
                </div>
                {action}
            </header>
            {toolbar && <div className="border-y border-border bg-background/40 px-4 py-2">{toolbar}</div>}
            <div className={cn("relative min-h-0 flex-1", toolbar ? "" : "border-t border-border", bodyClass)}>{children}</div>
            {footer && <footer className="border-t border-border px-4 py-2.5">{footer}</footer>}
        </section>
    );
}

// a pump state: the icon always, the label unless compact. A running pump is the normal case,
// so its label stays neutral and only the icon is green.
export function StateGlyph({ state, compact = false, className }) {
    const { label, short, tone, icon: Icon } = STATE[state];
    return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
            <Icon className={cn("size-3.5 shrink-0", TONE[tone].text)} aria-hidden="true" />
            <span className={cn("text-xs", compact && "sr-only sm:not-sr-only",
                state === "RUNNING" ? "text-muted-foreground" : cn("font-medium", TONE[tone].text))}>
                <span className="hidden 2xl:inline">{label}</span>
                <span className="2xl:hidden">{short}</span>
            </span>
        </span>
    );
}

const STROKE = {
    neutral: "stroke-foreground/55", ok: "stroke-ok", standby: "stroke-standby",
    warn: "stroke-warn", crit: "stroke-crit", offline: "stroke-offline", primary: "stroke-primary",
};
const DOT = {
    neutral: "fill-foreground", ok: "fill-ok", standby: "fill-standby",
    warn: "fill-warn", crit: "fill-crit", offline: "fill-offline", primary: "fill-primary",
};

// values over time as one line; domain: [min, max] fixed so rows compare at a glance (the
// vibrations all on 0–9 mm/s), or omitted to fit the values. threshold: a dashed limit line.
export function Sparkline({ values, domain, threshold, tone = "neutral", width = 84, height = 22, label }) {
    if (values.length < 2) return <span className="font-data text-xs text-subtle" aria-label="Pas de données">—</span>;
    const [min, max] = domain ?? [Math.min(...values), Math.max(...values)];
    const span = max - min || 1;
    const x = (i) => (i / (values.length - 1)) * width;
    const y = (v) => height - 1 - ((Math.min(Math.max(v, min), max) - min) / span) * (height - 2);
    const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block overflow-visible">
            {threshold != null && (
                <line x1="0" x2={width} y1={y(threshold)} y2={y(threshold)} className="stroke-warn/45" strokeDasharray="2 3" strokeWidth="1" />
            )}
            <path d={d} fill="none" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" className={STROKE[tone]} />
            <circle cx={x(values.length - 1)} cy={y(values.at(-1))} r="1.75" className={DOT[tone]} />
        </svg>
    );
}

// the vibration on its ISO scale: the fill takes the zone's color, the ticks mark zones C and D
export function VibrationGauge({ value, zone, className }) {
    const at = (v) => `${(v / VIBRATION_SCALE) * 100}%`;
    return (
        <span aria-hidden="true" className={cn("relative block h-1 w-14 rounded-full bg-foreground/10", className)}>
            <span className={cn("absolute inset-y-0 left-0 rounded-full", TONE[zone].fill)} style={{ width: at(Math.min(value, VIBRATION_SCALE)) }} />
            <span className="absolute -inset-y-0.5 w-px bg-warn/70" style={{ left: at(LIMITS.vibration_mms.warn) }} />
            <span className="absolute -inset-y-0.5 w-px bg-crit/70" style={{ left: at(LIMITS.vibration_mms.crit) }} />
        </span>
    );
}

// a share of a whole (flow against the nominal, a technician's load against the busiest)
export function LoadBar({ ratio, tone = "neutral", className }) {
    return (
        <span aria-hidden="true" className={cn("block h-1 w-14 overflow-hidden rounded-full bg-foreground/10", className)}>
            <span className={cn("block h-full rounded-full", TONE[tone].fill)} style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }} />
        </span>
    );
}

// ---- the panels' states ----

export function PanelSkeleton({ rows = 4, className }) {
    return (
        <div className={cn("space-y-2 p-4", className)} role="status" aria-label="Chargement">
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} className="h-9 rounded-sm bg-foreground/[0.06]" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
        </div>
    );
}

export function PanelEmpty({ icon: Icon, tone = "ok", title, hint, action, className }) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
            <span className={cn("flex size-9 items-center justify-center rounded-full", TONE[tone].soft)}>
                <Icon className={cn("size-4", TONE[tone].text)} aria-hidden="true" />
            </span>
            <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
            {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function PanelError({ message, onRetry, className }) {
    return (
        <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
            <span className="flex size-9 items-center justify-center rounded-full bg-crit/10">
                <CircleAlert className="size-4 text-crit" aria-hidden="true" />
            </span>
            <p className="mt-1 text-sm font-medium text-foreground">Indisponible</p>
            <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
            {onRetry && (
                <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                    <RotateCw aria-hidden="true" /> Réessayer
                </Button>
            )}
        </div>
    );
}
