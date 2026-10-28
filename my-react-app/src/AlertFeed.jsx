// The left column of the alert page (AlertDetail.jsx): the trend of the alert's metric over the
// pump's last 7 days, the case's activity feed, and the work orders tab.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Bell, CheckCircle2, ClipboardList, MessageSquare, OctagonAlert, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { LIMITS, effectiveState } from "./fleetSimulator";
import { METRICS } from "./pumpStates";
import { ALERT_KINDS, ISSUE_STATUS } from "./alertContent";
import { Card, ChartTooltip, PriorityBadge, SimulatedBadge } from "./managerUi";
import { ORDER_STATUS, PRIORITY_LABEL, chartColors, compact, formatDay, humanize, localIso } from "./managerUtils";

const DAY = 24 * 3600 * 1000;
const STATUS_COLORS = { warn: "#fab219", crit: "#d03b3b" };
const SEVERITY_LABEL = { critical: "critique", warning: "avertissement" };

const time = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (ts) => new Date(ts).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
// "Dimanche 25 octobre": only the first letter capitalized, as French writes it
const longDay = (ts) => {
    const text = new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return text.charAt(0).toUpperCase() + text.slice(1);
};

// ---- what the alert is and what to do, above its data ----

export function SummaryCard({ issue, pump }) {
    const kind = ALERT_KINDS[issue.kind];
    return (
        <Card>
            <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONES[issue.severity === "critical" ? "critical" : "warning"]}`}>
                    <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 pt-1.5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        #{issue.number} · Alerte ouverte — {issue.pumpId} — {kind.title}
                    </p>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {new Date(issue.raisedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </div>
            <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                <section>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Description</h3>
                    <div className="mt-1 space-y-2">
                        {kind.description(pump, issue).map((line) => <p key={line}>{line}</p>)}
                    </div>
                </section>
                <section>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Recommandation</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                        {kind.recommendation.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                </section>
                <p className="text-xs text-slate-500 dark:text-slate-400">Recommandation type pour ce genre d'alerte, à adapter sur site.</p>
            </div>
        </Card>
    );
}

// ---- the 7-day trend ----

// midnights inside [from, to], for the x axis
function midnights(from, to) {
    const ticks = [];
    const d = new Date(from);
    d.setHours(24, 0, 0, 0);
    for (; d.getTime() <= to; d.setDate(d.getDate() + 1)) ticks.push(d.getTime());
    return ticks;
}

export function TrendCard({ pump, issue, now }) {
    const { isDark } = useTheme();
    const c = chartColors(isDark);
    const metric = ALERT_KINDS[issue.kind].metric;
    const [, label, unit] = METRICS.find(([key]) => key === metric);
    const limits = LIMITS[metric];
    // the hourly week, then the live reading when the pump still reports
    const online = effectiveState(pump, now) !== "OFFLINE";
    const data = online ? [...pump.trend, { ts: now, ...pump.metrics }] : pump.trend;
    const from = now - 7 * DAY;
    const top = Math.max(...data.map((p) => p[metric]), limits ? limits.crit * 1.1 : 0);

    return (
        <Card title={`${label} · 7 derniers jours`} subtitle={`${pump.pumpId}, une mesure par heure puis la mesure en direct`}
            action={
                <div className="flex items-center gap-3">
                    <Link to={`/pumps?pompe=${pump.pumpId}&vue=mesures`}
                        className="flex items-center gap-1 text-xs font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                        Voir la pompe <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <SimulatedBadge />
                </div>
            }>
            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={c.grid} />
                        <XAxis dataKey="ts" type="number" scale="time" domain={[from, now]} ticks={midnights(from, now)}
                            tickFormatter={dayLabel} tickLine={false} stroke={c.axis} tick={{ fill: c.muted, fontSize: 11 }} />
                        <YAxis width={44} tickFormatter={compact} axisLine={false} tickLine={false}
                            domain={limits ? [0, Math.ceil(top)] : [0, "auto"]} tick={{ fill: c.muted, fontSize: 11 }} />
                        {limits && ["warn", "crit"].map((level) => (
                            <ReferenceLine key={level} y={limits[level]} stroke={STATUS_COLORS[level]} strokeWidth={1}
                                label={{ value: `${level === "crit" ? "Critique" : "Alerte"} ${limits[level].toLocaleString("fr-FR")}`,
                                    position: "insideTopLeft", fill: c.muted, fontSize: 11 }} />
                        ))}
                        {issue.raisedAt >= from && (
                            <ReferenceLine x={issue.raisedAt} stroke={c.muted} strokeDasharray="3 3"
                                label={{ value: "Début de l'alerte", position: "insideTopRight", fill: c.muted, fontSize: 11 }} />
                        )}
                        <Tooltip cursor={{ stroke: c.axis }} isAnimationActive={false}
                            content={<ChartTooltip format={(p) => ({
                                title: new Date(p.ts).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                                value: `${p[metric].toLocaleString("fr-FR")} ${unit}`,
                            })} />} />
                        <Area type="monotone" dataKey={metric} stroke={c.series} strokeWidth={2} fill={c.series} fillOpacity={0.1}
                            isAnimationActive={false} dot={false}
                            activeDot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            {!online && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">La courbe s'arrête à la dernière mesure reçue.</p>}
        </Card>
    );
}

// ---- the activity feed ----

// one line of the feed: its icon and what it says
function describe(event, issue) {
    const by = event.by ? <span className="font-medium text-slate-900 dark:text-slate-100">{event.by}</span> : null;
    switch (event.type) {
        case "raised":
            return { icon: Bell, tone: event.severity === "critical" ? "critical" : "warning",
                text: <>Le digital twin a levé une alerte ({SEVERITY_LABEL[event.severity]}) : {event.message}</> };
        case "escalated":
            return { icon: OctagonAlert, tone: "critical", text: <>Passée en critique : {event.message}</> };
        case "cleared":
            return { icon: CheckCircle2, tone: "good", text: <>Mesure revenue dans les limites</> };
        case "reactivated":
            return { icon: RefreshCw, tone: "warning", text: <>Alerte de nouveau active : {event.message}</> };
        case "status":
            return { icon: SlidersHorizontal, text: <>{by} a passé le statut de {ISSUE_STATUS[event.from].label} à <span className="font-medium">{ISSUE_STATUS[event.to].label}</span></> };
        case "priority":
            return { icon: SlidersHorizontal, text: <>{by} a passé la priorité de {PRIORITY_LABEL[event.from]} à <span className="font-medium">{PRIORITY_LABEL[event.to]}</span></> };
        case "comment":
            return { icon: MessageSquare, text: <>{by} a commenté</>, body: event.text };
        case "order":
            return { icon: ClipboardList, tone: "brand", text: <>{by} a créé l'ordre de travail « {event.text} » pour {event.to} sur {issue.pumpId}</> };
        default:
            return { icon: Bell, text: humanize(event.type) };
    }
}

const TONES = {
    critical: "bg-[#d03b3b]/10 text-[#d03b3b] dark:bg-[#d03b3b]/20 dark:text-[#f08a8a]",
    warning: "bg-[#fab219]/15 text-amber-700 dark:text-[#fab219]",
    good: "bg-[#0ca30c]/10 text-[#0a7f0a] dark:text-[#3fcf3f]",
    brand: "bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]",
    neutral: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
};

export function ActivityFeed({ issue, onComment }) {
    const [draft, setDraft] = useState("");
    // newest first, grouped by day
    const events = [...issue.events].sort((a, b) => b.at - a.at);
    const days = [];
    for (const event of events) {
        const key = new Date(event.at).toDateString();
        if (days.at(-1)?.key !== key) days.push({ key, at: event.at, events: [] });
        days.at(-1).events.push(event);
    }

    const send = (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onComment(draft.trim());
        setDraft("");
    };

    return (
        <div>
            <form onSubmit={send} className="flex items-start gap-2">
                <label className="sr-only" htmlFor="alert-comment">Commentaire</label>
                <textarea id="alert-comment" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                    placeholder="Ajouter un commentaire pour l'équipe…"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                <button type="submit" disabled={!draft.trim()}
                    className="rounded-lg bg-[#1A75BC] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                    Commenter
                </button>
            </form>

            {days.map((day) => (
                <section key={day.key} className="mt-6">
                    <p className="mb-3 inline-block rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {longDay(day.at)}
                    </p>
                    <ol className="space-y-4 border-l border-slate-200 pl-5 dark:border-slate-700">
                        {day.events.map((event, i) => {
                            const { icon: Icon, tone = "neutral", text, body } = describe(event, issue);
                            return (
                                <li key={`${event.at}-${i}`} className="relative">
                                    <span className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-800 ${TONES[tone]}`}>
                                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                    </span>
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <p className="text-sm text-slate-700 dark:text-slate-200">{text}</p>
                                        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{time(event.at)}</span>
                                    </div>
                                    {body && (
                                        <p className="mt-1.5 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">{body}</p>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </section>
            ))}
        </div>
    );
}

// ---- the work orders ----

// where a linked order is now: still open (/task/assigned), waiting for review (/task/review), or neither
function orderState(order, tasks) {
    if (!tasks) return { label: "…" };
    const open = tasks.orders.find((o) => o.id === order.taskId);
    if (open) return { label: ORDER_STATUS[open.status]?.label ?? humanize(open.status), style: ORDER_STATUS[open.status]?.style, task: open };
    const review = tasks.reviews.find((r) => r.taskId === order.taskId);
    if (review) return { label: "Rapport à valider", style: "font-medium text-[#1A75BC] dark:text-[#5BC6E8]", review };
    return { label: "Clôturé ou annulé", style: "text-slate-500 dark:text-slate-400" };
}

const reportLink = (task) =>
    `/review/${task.submissionId}?${new URLSearchParams({ taskId: task.taskId, title: task.title ?? "" })}`;

export function OrdersTab({ issue, tasks, loadError }) {
    const linkedIds = new Set(issue.orders.map((o) => o.taskId));
    const others = (tasks?.orders ?? []).filter((o) => o.equipmentId?.trim().toUpperCase() === issue.pumpId && !linkedIds.has(o.id));

    return (
        <div className="space-y-6">
            {loadError && <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Créés depuis cette alerte · {issue.orders.length}
                </h3>
                {issue.orders.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Aucun ordre de travail pour l'instant. Créez-en un depuis le panneau de droite.</p>
                ) : (
                    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                        {issue.orders.map((order) => {
                            const state = orderState(order, tasks);
                            return (
                                <li key={order.taskId ?? order.at} className="flex items-start justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{order.title}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            <span className={state.style}>{state.label}</span> · {order.technicianEmail} · créé le {formatDay(localIso(new Date(order.at)))}
                                        </p>
                                    </div>
                                    {state.task && <PriorityBadge priority={state.task.priority} />}
                                    {state.review?.submissionId && (
                                        <Link to={reportLink(state.review)} className="shrink-0 text-xs font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                                            Voir le rapport →
                                        </Link>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Autres ordres ouverts sur {issue.pumpId} · {tasks ? others.length : "…"}
                </h3>
                {tasks && others.length === 0 && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Aucun.</p>}
                {others.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                        {others.map((order) => (
                            <li key={order.id} className="flex items-start justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{order.title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        <span className={ORDER_STATUS[order.status]?.style}>{ORDER_STATUS[order.status]?.label ?? humanize(order.status)}</span> · {order.technicianEmail ?? "—"}
                                    </p>
                                </div>
                                <PriorityBadge priority={order.priority} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
