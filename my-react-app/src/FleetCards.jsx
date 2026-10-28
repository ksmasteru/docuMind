// The dashboard's fleet panels, fed by the twin (simulated for now, fleetSimulator.js):
// the status of every pump by site, the live alerts, and the total flow over the last minutes.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleCheck } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { Card, ChartTooltip, SimulatedBadge } from "./managerUi";
import { SITES, effectiveState } from "./fleetSimulator";
import { METRICS, PUMP_STATES, SEVERITY } from "./pumpStates";
import { ISSUE_STATUS } from "./alertContent";
import { openIssueFor, useAlertIssues } from "./alertStore";
import { ago, chartColors, compact, formatAgo, newOrderRoute, plural } from "./managerUtils";

const percent = (ratio) => new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(ratio);
const clock = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// ---- fleet status ----

// one bar split by state, 2px gaps between the segments
function StateBar({ counts, total }) {
    return (
        <div className="flex h-3 gap-0.5" role="img"
            aria-label={Object.entries(counts).map(([s, n]) => `${n} ${PUMP_STATES[s].label}`).join(", ")}>
            {Object.entries(counts).filter(([, n]) => n > 0).map(([state, n]) => (
                <span key={state} title={`${PUMP_STATES[state].label}: ${n}`}
                    className={`rounded-sm first:rounded-l-full last:rounded-r-full ${PUMP_STATES[state].fill}`}
                    style={{ width: `${(n / total) * 100}%` }} />
            ))}
        </div>
    );
}

function PumpTile({ pump, state, alert, selected, onSelect }) {
    const { label, icon: Icon, fill } = PUMP_STATES[state];
    return (
        <button type="button" onClick={onSelect} aria-pressed={selected}
            aria-label={`${pump.pumpId}, ${label}${alert ? `, alerte ${SEVERITY[alert.severity].label.toLowerCase()}` : ""}`}
            title={`${pump.pumpId} · ${label}`}
            className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition hover:brightness-110 ${fill} ${
                selected ? "ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-slate-800" : ""
            }`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pump.model}·{pump.pumpId.slice(-2)}</span>
            {alert && (
                <span aria-hidden="true" className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${
                    alert.severity === "critical" ? "bg-[#d03b3b]" : "bg-[#fab219]"
                }`} />
            )}
        </button>
    );
}

function PumpReadings({ pump, state, alerts, now }) {
    const { label, icon: Icon } = PUMP_STATES[state];
    return (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {pump.pumpId} <span className="font-normal text-slate-500 dark:text-slate-400">· {pump.siteName}</span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label} · dernière mesure {ago(now - pump.ts)}
                    <Link to={`/pumps?pompe=${pump.pumpId}`} className="ml-2 font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                        Voir la fiche →
                    </Link>
                </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {METRICS.map(([key, name, unit]) => (
                    <div key={key}>
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{name}</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {pump.metrics[key].toLocaleString("fr-FR")} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{unit}</span>
                        </dd>
                    </div>
                ))}
            </dl>
            {alerts.length > 0 && (
                <ul className="mt-3 space-y-1">
                    {alerts.map((a) => {
                        const { icon: SevIcon, style } = SEVERITY[a.severity];
                        return (
                            <li key={a.id} className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${style}`}>
                                <SevIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {a.message}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export function FleetStatusCard({ fleet, className }) {
    const [selectedId, setSelectedId] = useState(null);
    const { pumps, counts, availability, alerts, updatedAt: now } = fleet;
    const worstAlert = (pumpId) => alerts.find((a) => a.pumpId === pumpId); // alerts are sorted worst first
    const selected = pumps.find((p) => p.pumpId === selectedId);

    return (
        <Card title="État du parc" subtitle={`${pumps.length} pompes sur ${SITES.length} sites`} action={<SimulatedBadge />} className={className}>
            <div className="flex flex-col gap-5 md:flex-row md:items-end">
                <div className="shrink-0">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Disponibilité</p>
                    <p className="text-5xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{percent(availability)}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {counts.RUNNING + counts.STANDBY} sur {pumps.length} en marche ou prêtes
                    </p>
                </div>
                <div className="min-w-0 flex-1">
                    <StateBar counts={counts} total={pumps.length} />
                    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {Object.entries(PUMP_STATES).map(([state, { label, icon: Icon, fill }]) => (
                            <li key={state} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <span className={`flex h-4 w-4 items-center justify-center rounded ${fill}`}>
                                    <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                                </span>
                                {label} <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{counts[state]}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
                {SITES.map((site) => {
                    const sitePumps = pumps.filter((p) => p.site === site.code);
                    const running = sitePumps.filter((p) => effectiveState(p, now) === "RUNNING").length;
                    return (
                        <div key={site.code}>
                            <p className="mb-2 flex items-baseline justify-between text-xs">
                                <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{site.name}</span>
                                <span className="text-slate-500 dark:text-slate-400">{running}/{sitePumps.length} en marche</span>
                            </p>
                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                {sitePumps.map((pump) => (
                                    <PumpTile key={pump.pumpId} pump={pump} state={effectiveState(pump, now)}
                                        alert={worstAlert(pump.pumpId)} selected={pump.pumpId === selectedId}
                                        onSelect={() => setSelectedId((id) => (id === pump.pumpId ? null : pump.pumpId))} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {selected
                ? <PumpReadings pump={selected} state={effectiveState(selected, now)} now={now}
                    alerts={alerts.filter((a) => a.pumpId === selected.pumpId)} />
                : <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">Sélectionnez une pompe pour voir ses mesures en direct.</p>}
        </Card>
    );
}

// ---- live alerts ----

export function AlertsCard({ fleet, className }) {
    const navigate = useNavigate();
    const { alerts, updatedAt: now } = fleet;
    const issues = useAlertIssues();

    // the manager turns an alert into a work order on its pump, linked to the alert's case
    const createOrder = (alert, issue) => navigate(...newOrderRoute(alert.pumpId, alert.site, alert.message, issue?.number));

    return (
        <Card id="alerts" title="Alertes en direct"
            subtitle={alerts.length ? `${alerts.length} ${plural(alerts.length, "ouverte")}, les plus graves d'abord` : "Selon les seuils du digital twin"}
            action={<SimulatedBadge />} className={`flex flex-col ${className}`}>
            {alerts.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                    <CircleCheck className="h-8 w-8 text-[#0ca30c]" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">Toutes les pompes sont dans leurs limites</p>
                </div>
            ) : (
                <ul className="-mx-1 max-h-[520px] min-h-0 flex-1 space-y-2 overflow-y-auto px-1 lg:max-h-none">
                    {alerts.map((alert) => {
                        const { label, icon: Icon, style } = SEVERITY[alert.severity];
                        const issue = openIssueFor(issues, alert.id);
                        return (
                            <li key={alert.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                                <div className="flex items-start gap-3">
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style}`}>
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                                            <span className="font-semibold text-slate-900 dark:text-slate-100">{alert.pumpId}</span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{alert.site}</span>
                                            {issue && (
                                                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                                                    #{issue.number} · {ISSUE_STATUS[issue.status].label}
                                                </span>
                                            )}
                                        </p>
                                        <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">{alert.message}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {label} · {now - alert.since < 60000 ? "à l'instant" : `depuis ${formatAgo(now - alert.since)}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap justify-end gap-1">
                                    <button type="button" onClick={() => createOrder(alert, issue)}
                                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 dark:text-[#5BC6E8] dark:hover:bg-[#5BC6E8]/10">
                                        Créer un ordre de travail
                                    </button>
                                    {/* the case is opened on the tick after the alert appears */}
                                    {issue && (
                                        <Link to={`/alerts/${issue.number}`}
                                            className="rounded-lg bg-[#1A75BC]/10 px-2.5 py-1 text-xs font-semibold text-[#1A75BC] transition hover:bg-[#1A75BC]/20 dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">
                                            Voir l'alerte →
                                        </Link>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

// ---- total flow ----

export function FlowTrendCard({ fleet, className }) {
    const { isDark } = useTheme();
    const c = chartColors(isDark);
    const { history } = fleet;
    const current = history.at(-1)?.flow ?? 0;
    const first = history[0]?.flow ?? current;
    const change = first ? (current - first) / first : 0;

    return (
        <Card title="Débit total" subtitle="Pompes en marche, 10 dernières minutes" className={`flex flex-col ${className}`}
            action={
                <div className="flex items-start gap-3">
                    <div className="text-right">
                        <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                            {current.toLocaleString("fr-FR")} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">m³/h</span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {change >= 0 ? "+" : "−"}{percent(Math.abs(change))} sur 10 min
                        </p>
                    </div>
                    <SimulatedBadge />
                </div>
            }>
            <div className="h-56 lg:h-auto lg:min-h-56 lg:flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={c.grid} />
                        <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
                            tickFormatter={clock} minTickGap={48} tickLine={false} stroke={c.axis}
                            tick={{ fill: c.muted, fontSize: 11 }} />
                        <YAxis width={44} tickFormatter={compact} axisLine={false} tickLine={false}
                            domain={[(min) => Math.floor((min * 0.97) / 100) * 100, (max) => Math.ceil((max * 1.03) / 100) * 100]}
                            tick={{ fill: c.muted, fontSize: 11 }} />
                        <Tooltip cursor={{ stroke: c.axis }} isAnimationActive={false}
                            content={<ChartTooltip format={(p) => ({
                                title: new Date(p.ts).toLocaleTimeString("fr-FR"),
                                value: `${p.flow.toLocaleString("fr-FR")} m³/h`,
                            })} />} />
                        {/* live data: no animation, or the curve would redraw on every tick */}
                        <Area type="monotone" dataKey="flow" stroke={c.series} strokeWidth={2} fill={c.series} fillOpacity={0.1}
                            isAnimationActive={false} dot={false}
                            activeDot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
