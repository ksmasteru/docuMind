// The console's maintenance side, from GreenSense's own data (the endpoints of the Orders, Review
// and Technicians pages): open work orders and the ones that need the manager, each technician's
// load, and the reports waiting for review.
//
// Each panel gets `state`: { data, error, stale, onRetry }. data undefined = still loading;
// error with no data = the first load failed; stale = a refresh failed, the last data stays.
import { Link } from "react-router-dom";
import { CircleCheck, OctagonAlert, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ORDER_STATUS, PRIORITY_LABEL, ago, byPriority, formatDay, isOverdue, plural } from "../managerUtils";
import { LoadBar, MicroLabel, Panel, PanelEmpty, PanelError, PanelSkeleton } from "./primitives";
import { TONE, clock } from "./tokens";

const nameOf = (names, email) => names.get(email) ?? email ?? "Non assigné";

const ViewAll = ({ to, children }) => (
    <Button variant="link" size="xs" asChild className="h-auto px-0 text-xs">
        <Link to={to}>{children} →</Link>
    </Button>
);

// a refresh failed: the panel still shows the last data, marked with when it was loaded
function StaleTag({ loadedAt }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded-sm border border-warn/40 px-1.5 py-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-warn outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {clock(loadedAt)}
                </span>
            </TooltipTrigger>
            <TooltipContent>La dernière mise à jour a échoué. Données de {clock(loadedAt)}.</TooltipContent>
        </Tooltip>
    );
}

// the panel's body for its state; render(data) draws the loaded data
function Body({ state, rows, render }) {
    if (state.data) return render(state.data);
    if (state.error) return <PanelError message={state.error} onRetry={state.onRetry} />;
    return <PanelSkeleton rows={rows} />;
}

const actions = (state, link) => (
    <span className="flex items-center gap-3">
        {state.stale && state.loadedAt && <StaleTag loadedAt={state.loadedAt} />}
        {link}
    </span>
);

// ---- work orders ----

const PRIORITY_TONE = { URGENT: "crit", HIGH: "warn", NORMAL: "standby", LOW: "neutral" };

function PriorityBadge({ priority }) {
    const tone = PRIORITY_TONE[priority] ?? "neutral";
    return (
        <Badge variant="outline" className={cn("rounded-sm border-current/30 px-1.5 font-data text-[10px] uppercase tracking-wider",
            tone === "neutral" ? "text-muted-foreground" : TONE[tone].text)}>
            {PRIORITY_LABEL[priority] ?? priority}
        </Badge>
    );
}

// why an order needs the manager: returned or blocked first, then late
const attention = (order) =>
    order.status === "RETURNED" ? { reason: "À corriger", tone: "crit" }
    : order.status === "BLOCKED" ? { reason: "Bloqué", tone: "warn" }
    : isOverdue(order) ? { reason: `En retard, échéance le ${formatDay(order.dueDate)}`, tone: "warn" }
    : null;

const STATUS_TONE = { BLOCKED: "warn", RETURNED: "crit" };

export function OrdersPanel({ state, names, className, style }) {
    const orders = state.data?.orders;
    return (
        <Panel label="Maintenance" title="Ordres de travail" meta={orders ? `${orders.length} ${plural(orders.length, "ouvert")}` : null}
            action={actions(state, <ViewAll to="/orders">Tous les ordres</ViewAll>)} style={style} className={className}>
            <Body state={state} rows={5} render={() => {
                const pending = orders.filter(attention).sort(byPriority);
                return (
                    <>
                        <dl className="grid grid-cols-4 gap-px border-b border-border bg-border">
                            {Object.entries(ORDER_STATUS).map(([status, { label }]) => {
                                const count = orders.filter((o) => o.status === status).length;
                                const tone = count ? STATUS_TONE[status] : null;
                                return (
                                    <div key={status} className="bg-card px-3 py-2.5">
                                        <MicroLabel as="dt" className="truncate">{label}</MicroLabel>
                                        <dd className={cn("mt-1 font-data text-xl tabular-nums leading-none", tone ? TONE[tone].text : "text-foreground")}>{count}</dd>
                                    </div>
                                );
                            })}
                        </dl>
                        <div className="px-4 pb-4 pt-3">
                            <MicroLabel>À traiter · {pending.length}</MicroLabel>
                            {pending.length === 0 ? (
                                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                    <CircleCheck className="size-3.5 text-ok" aria-hidden="true" /> Aucun ordre bloqué, à corriger ni en retard.
                                </p>
                            ) : (
                                <ul className="mt-1 divide-y divide-border">
                                    {pending.slice(0, 5).map((order) => {
                                        const { reason, tone } = attention(order);
                                        return (
                                            <li key={order.id} className="flex items-start justify-between gap-3 py-2.5">
                                                <div className="min-w-0">
                                                    <p className="truncate text-[13px] font-medium text-foreground">{order.title}</p>
                                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                        <span className={cn("font-medium", TONE[tone].text)}>{reason}</span>
                                                        <span aria-hidden="true" className="px-1 text-subtle">·</span>
                                                        {nameOf(names, order.technicianEmail)}
                                                    </p>
                                                </div>
                                                <PriorityBadge priority={order.priority} />
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {pending.length > 5 && (
                                <p className="mt-1 font-data text-[11px] text-subtle">+ {pending.length - 5} sur la page des ordres</p>
                            )}
                        </div>
                    </>
                );
            }} />
        </Panel>
    );
}

// ---- technician workload ----

export function WorkloadPanel({ state, names, className, style }) {
    const data = state.data;
    // every technician, idle ones included: they can take the next alert
    const load = new Map((data?.technicians ?? []).map((t) => [t.email, 0]));
    for (const order of data?.orders ?? []) load.set(order.technicianEmail, (load.get(order.technicianEmail) ?? 0) + 1);
    const rows = [...load].map(([email, count]) => ({ email, name: nameOf(names, email), count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const idle = rows.filter((r) => r.count === 0).length;
    const busiest = Math.max(1, ...rows.map((r) => r.count));

    return (
        <Panel label="Équipe" title="Charge des techniciens" meta={data && rows.length ? `${idle} ${plural(idle, "disponible")}` : null}
            action={actions(state, <ViewAll to="/technicians">Assigner</ViewAll>)} style={style} className={className}>
            <Body state={state} rows={5} render={() => rows.length === 0 ? (
                <PanelEmpty icon={UserRound} tone="neutral" title="Aucun technicien pour l'instant"
                    hint="Les comptes technicien créés par l'administrateur apparaissent ici avec leurs ordres ouverts." />
            ) : (
                <ul className="divide-y divide-border px-4 py-1">
                    {rows.map((row) => (
                        <li key={row.email} className="flex items-center gap-3 py-2">
                            <span className="w-32 shrink-0 truncate text-[13px] text-foreground sm:w-40" title={row.email}>{row.name}</span>
                            <LoadBar ratio={row.count / busiest} tone={row.count ? "neutral" : "ok"} className="w-auto flex-1" />
                            <span className="w-20 shrink-0 text-right font-data text-xs tabular-nums">
                                {row.count ? <span className="text-foreground">{row.count} {plural(row.count, "ordre")}</span>
                                    : <span className="text-ok">disponible</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            )} />
        </Panel>
    );
}

// ---- review queue ----

// the report page needs the submission id, and the task for its approve / return buttons
const reportLink = (task) =>
    task.submissionId
        ? `/review/${task.submissionId}?${new URLSearchParams({ taskId: task.taskId, title: task.title ?? "" })}`
        : "/review";

export function ReviewPanel({ state, names, now, className, style }) {
    const reviews = state.data?.reviews;
    return (
        <Panel label="Validation" title="Rapports en attente" meta={reviews ? `${reviews.length} · du plus ancien au plus récent` : null}
            action={actions(state, <ViewAll to="/review">File de validation</ViewAll>)} style={style} className={className}>
            <Body state={state} rows={4} render={() => reviews.length === 0 ? (
                <PanelEmpty icon={CircleCheck} title="Vous êtes à jour" hint="Les rapports envoyés par vos techniciens arrivent ici pour validation." />
            ) : (
                <ul className="divide-y divide-border">
                    {reviews.slice(0, 6).map((task) => {
                        const nonConforming = task.submissionStatus === "NON_CONFORME";
                        return (
                            <li key={task.taskId}>
                                <Link to={reportLink(task)}
                                    className="group flex items-start justify-between gap-4 px-4 py-2.5 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-medium text-foreground transition-colors group-hover:text-primary">{task.title}</p>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                            {task.submissionStatus && (
                                                <span className={cn("inline-flex items-center gap-1", nonConforming ? "font-medium text-crit" : "text-ok")}>
                                                    {nonConforming && <OctagonAlert className="size-3" aria-hidden="true" />}
                                                    {nonConforming ? "Non conforme" : "Conforme"}
                                                </span>
                                            )}
                                            {task.submissionStatus && <span aria-hidden="true" className="text-subtle">·</span>}
                                            {nameOf(names, task.technicianEmail)}
                                            {task.equipmentId && <>
                                                <span aria-hidden="true" className="text-subtle">·</span>
                                                <span className="font-data text-[11px]">{task.equipmentId}</span>
                                            </>}
                                        </p>
                                    </div>
                                    <span className="shrink-0 pt-0.5 font-data text-[11px] tabular-nums text-subtle">
                                        {task.submittedAt ? ago(now - new Date(task.submittedAt)) : "—"}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )} />
        </Panel>
    );
}
