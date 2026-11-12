// The top of the console: the header strip (where and when, the twin's live clock) and the rail of
// six readouts, each a link to the panel or page behind it.
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SITES, TICK_MS } from "../fleetSimulator";
import { ago, isOverdue, plural } from "../managerUtils";
import { MicroLabel, Sparkline } from "./primitives";
import { STATE, TONE, clock, num, pct } from "./tokens";

function LiveClock({ updatedAt }) {
    return (
        <p className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inset-0 animate-ping rounded-full bg-ok/60 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-ok" />
            </span>
            <span className="font-data text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">En direct</span>
            <span className="font-data text-xs tabular-nums text-foreground">
                <span className="sr-only">dernière mesure à </span>{clock(updatedAt, true)}
            </span>
        </p>
    );
}

export function SimulatedTag() {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0}
                    className="cursor-help rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-warn outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Simulé
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
                Généré dans le navigateur tant que le digital twin n'est pas connecté. Les ordres et les rapports, eux, sont réels.
            </TooltipContent>
        </Tooltip>
    );
}

export function ConsoleHeader({ updatedAt, simulated }) {
    const date = new Date(updatedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return (
        <header className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-4 pb-4 pt-5 sm:px-5">
            <div className="console-rise min-w-0">
                {/* the brand is in the sidebar now; this names what the console watches */}
                <MicroLabel>Supervision du parc</MicroLabel>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">Tableau de bord</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                    {date} <span aria-hidden="true" className="px-1 text-subtle">·</span> {SITES.map((s) => s.name).join(", ")}
                </p>
            </div>
            <div className="console-rise flex items-center gap-2" style={{ "--i": 1 }}>
                {simulated && <SimulatedTag />}
                <LiveClock updatedAt={updatedAt} />
            </div>
            {/* fills until the twin's next reading, then starts again: the page is alive, and how often */}
            <span key={updatedAt} aria-hidden="true" className="console-tick absolute inset-x-0 -bottom-px h-px bg-primary/60"
                style={{ animationDuration: `${TICK_MS}ms` }} />
        </header>
    );
}

// ---- the readouts rail ----

// the fleet split by state, one segment per state that has pumps
function StateBar({ counts, total }) {
    return (
        <span className="mt-3 flex h-1 gap-px overflow-hidden rounded-full" role="img"
            aria-label={Object.entries(counts).filter(([, n]) => n).map(([s, n]) => `${n} ${STATE[s].label.toLowerCase()}`).join(", ")}>
            {Object.entries(counts).filter(([, n]) => n > 0).map(([state, n]) => (
                <span key={state} className={TONE[STATE[state].tone].fill} style={{ width: `${(n / total) * 100}%` }} />
            ))}
        </span>
    );
}

function Readout({ to, label, value, unit, hint, tone = "neutral", loading, extra, index }) {
    const alarming = tone === "crit" || tone === "warn";
    return (
        <Link to={to} style={{ "--i": index }}
            className="console-rise group relative flex min-w-0 flex-col bg-card px-4 py-3.5 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            {alarming && <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", TONE[tone].rail)} />}
            <span className="flex items-center justify-between gap-2">
                <MicroLabel as="span">{label}</MicroLabel>
                <ArrowUpRight aria-hidden="true"
                    className="size-3.5 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
            </span>
            {loading ? (
                <>
                    <Skeleton className="mt-2 h-7 w-16 rounded-sm bg-foreground/[0.07]" />
                    <Skeleton className="mt-2 h-3 w-28 rounded-sm bg-foreground/[0.05]" />
                </>
            ) : (
                <>
                    <span className={cn("mt-1.5 font-data text-[26px] font-medium leading-none tracking-tight tabular-nums",
                        alarming ? TONE[tone].text : "text-foreground")}>
                        {value}
                        {unit && <span className="ml-1 text-xs font-normal tracking-normal text-subtle">{unit}</span>}
                    </span>
                    <span className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</span>
                </>
            )}
            {extra}
        </Link>
    );
}

// orders / reviews: undefined until loaded; failed: the first load failed, so there is nothing to show
export function KpiRail({ fleet, orders, reviews, failed }) {
    const { pumps, counts, availability, alerts, history, updatedAt } = fleet;
    const critical = alerts.filter((a) => a.severity === "critical").length;
    const flow = history.at(-1)?.flow ?? 0;
    const first = history[0]?.flow ?? flow;
    const change = first ? (flow - first) / first : 0;
    const blocked = orders?.filter((o) => o.status === "BLOCKED").length ?? 0;
    const overdue = orders?.filter(isOverdue).length ?? 0;
    const oldestReview = reviews?.[0]?.submittedAt; // the server sends the oldest first
    const unavailable = { value: "—", hint: "Indisponible", loading: false };

    return (
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
            <Readout index={2} to="#fleet" label="Disponibilité" value={pct(availability)}
                hint={`${counts.RUNNING + counts.STANDBY} / ${pumps.length} en marche ou prêtes`}
                extra={<StateBar counts={counts} total={pumps.length} />} />
            <Readout index={3} to="#fleet" label="En marche" value={counts.RUNNING} unit={`/ ${pumps.length}`}
                hint={`${counts.STANDBY} réserve · ${counts.FAULT} défaut · ${counts.OFFLINE} hors ligne`} />
            <Readout index={4} to="#flow" label="Débit total" value={num(flow)} unit="m³/h"
                hint={`${change >= 0 ? "+" : "−"}${pct(Math.abs(change))} sur 10 min`}
                extra={
                    <span className="mt-2 block">
                        <Sparkline values={history.map((h) => h.flow)} tone="primary" width={120} height={16}
                            label={`Débit total sur 10 minutes, ${num(flow)} m³/h à ${clock(updatedAt)}`} />
                    </span>
                } />
            <Readout index={5} to="#alerts" label="Alertes" value={alerts.length}
                tone={critical ? "crit" : alerts.length ? "warn" : "neutral"}
                hint={critical ? `dont ${critical} ${plural(critical, "critique")}` : "Aucune critique"} />
            <Readout index={6} to="/orders" label="Ordres ouverts" tone={blocked ? "warn" : "neutral"}
                value={orders?.length} loading={!orders}
                hint={`${blocked} ${plural(blocked, "bloqué")} · ${overdue} en retard`}
                {...(failed && !orders ? unavailable : {})} />
            <Readout index={7} to="/review" label="À valider" value={reviews?.length} loading={!reviews}
                hint={oldestReview ? `Le plus ancien ${ago(updatedAt - new Date(oldestReview))}` : "Vous êtes à jour"}
                {...(failed && !reviews ? unavailable : {})} />
        </div>
    );
}
