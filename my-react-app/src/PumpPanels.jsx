// The bottom half of the pump page, one panel per action button:
//   Mesures        the live readings and one metric's trend against its limits (twin, simulated for now)
//   Interventions  the pump's alerts, and the work orders / reports whose equipmentId is this pump
//   Documentation  the manuals of the pump's model, and the assistant
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, FileText, MessageSquareText } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { apiClient } from "./apiClient";
import { LIMITS } from "./fleetSimulator";
import { METRICS, PUMP_STATES, SEVERITY } from "./pumpStates";
import { ChartTooltip, ErrorBanner, PriorityBadge, SectionLabel } from "./managerUi";
import { ORDER_STATUS, ago, chartColors, compact, formatAgo, formatDay, humanize, serverMessage } from "./managerUtils";

const STATUS_COLORS = { warn: "#fab219", crit: "#d03b3b" };
const clock = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const unitOf = (key) => METRICS.find(([k]) => k === key)[2];
const labelOf = (key) => METRICS.find(([k]) => k === key)[1];

// where a reading stands against its limits: "crit", "warn" or null
const levelOf = (key, value) => {
    const limits = LIMITS[key];
    if (!limits) return null;
    return value >= limits.crit ? "crit" : value >= limits.warn ? "warn" : null;
};

const Muted = ({ children, className = "" }) => (
    <p className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>{children}</p>
);

// ---- Mesures ----

const CHART_METRICS = ["flow_m3h", "pressure_bar", "vibration_mms", "bearing_temp_c"];

export function MeasuresPanel({ pump, state }) {
    const { isDark } = useTheme();
    const c = chartColors(isDark);
    const [metric, setMetric] = useState("vibration_mms");
    const limits = LIMITS[metric];
    const unit = unitOf(metric);
    const values = pump.readings.map((r) => r[metric]);
    const top = Math.max(...values, limits ? limits.crit * 1.1 : 0);

    return (
        <div className="flex h-full flex-col">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {METRICS.map(([key, name, metricUnit]) => {
                    const level = levelOf(key, pump.metrics[key]);
                    const Icon = level && SEVERITY[level === "crit" ? "critical" : "warning"].icon;
                    return (
                        <div key={key} className={`rounded-xl px-3 py-2 ${
                            level ? SEVERITY[level === "crit" ? "critical" : "warning"].style : "bg-slate-50 dark:bg-slate-900/40"
                        }`}>
                            <dt className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                {Icon && <Icon className="h-3 w-3" aria-label={level === "crit" ? "au-delà du seuil critique" : "au-delà du seuil d'alerte"} />}
                                {name}
                            </dt>
                            <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                {pump.metrics[key].toLocaleString("fr-FR")} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{metricUnit}</span>
                            </dd>
                        </div>
                    );
                })}
            </dl>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>{labelOf(metric)} · 10 dernières minutes</SectionLabel>
                <div role="radiogroup" aria-label="Mesure affichée" className="flex flex-wrap gap-1.5">
                    {CHART_METRICS.map((key) => (
                        <button key={key} type="button" role="radio" aria-checked={metric === key} onClick={() => setMetric(key)}
                            className={`rounded-full px-3 py-1 text-xs transition ${
                                metric === key
                                    ? "bg-[#1A75BC]/10 font-semibold text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]"
                                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                            }`}>
                            {labelOf(key)}
                        </button>
                    ))}
                </div>
            </div>

            {pump.readings.length === 0 ? (
                <Muted className="mt-6">Aucune mesure reçue sur les 10 dernières minutes : la pompe ne transmet plus.</Muted>
            ) : (
                <>
                    {state !== "RUNNING" && (
                        <Muted className="mt-1 text-xs">La pompe est {PUMP_STATES[state].phrase} : débit et pression à zéro.</Muted>
                    )}
                    {/* a fixed height on small screens, where the panel has none for the chart to fill */}
                    <div className="mt-2 h-56 lg:h-auto lg:min-h-48 lg:flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={pump.readings} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} stroke={c.grid} />
                                <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
                                    tickFormatter={clock} minTickGap={48} tickLine={false} stroke={c.axis}
                                    tick={{ fill: c.muted, fontSize: 11 }} />
                                <YAxis width={44} tickFormatter={compact} axisLine={false} tickLine={false}
                                    domain={limits ? [0, Math.ceil(top)] : ["auto", "auto"]}
                                    tick={{ fill: c.muted, fontSize: 11 }} />
                                {limits && ["warn", "crit"].map((level) => (
                                    <ReferenceLine key={level} y={limits[level]} stroke={STATUS_COLORS[level]} strokeWidth={1}
                                        label={{ value: `${level === "crit" ? "Critique" : "Alerte"} ${limits[level].toLocaleString("fr-FR")}`,
                                            position: "insideTopLeft", fill: c.muted, fontSize: 11 }} />
                                ))}
                                <Tooltip cursor={{ stroke: c.axis }} isAnimationActive={false}
                                    content={<ChartTooltip format={(p) => ({
                                        title: new Date(p.ts).toLocaleTimeString("fr-FR"),
                                        value: `${p[metric].toLocaleString("fr-FR")} ${unit}`,
                                    })} />} />
                                {/* live data: no animation, or the line would redraw on every tick */}
                                <Line type="monotone" dataKey={metric} stroke={c.series} strokeWidth={2} dot={false}
                                    isAnimationActive={false} activeDot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </div>
    );
}

// ---- Interventions ----

// the work orders and reports are tied to a pump by the equipment typed when assigning the task
// (prefilled when the order is started from the pump page's "Nouvel ordre de travail")
const isFor = (pump, task) => task.equipmentId?.trim().toUpperCase() === pump.pumpId;

const reportLink = (task) =>
    task.submissionId
        ? `/review/${task.submissionId}?${new URLSearchParams({ taskId: task.taskId, title: task.title ?? "" })}`
        : "/review";

export function InterventionsPanel({ pump, alerts, now, tasks, loadError, onRetry }) {
    const orders = tasks?.orders.filter((o) => isFor(pump, o)) ?? [];
    const reviews = tasks?.reviews.filter((r) => isFor(pump, r)) ?? [];

    return (
        <div className="space-y-5">
            <section>
                <SectionLabel>Alertes en cours · {alerts.length}</SectionLabel>
                {alerts.length === 0 ? <Muted className="mt-1">Aucune alerte sur cette pompe.</Muted> : (
                    <ul className="mt-2 space-y-1.5">
                        {alerts.map((a) => {
                            const { label, icon: Icon, style } = SEVERITY[a.severity];
                            return (
                                <li key={a.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${style}`}>
                                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="flex-1">{a.message}</span>
                                    <span className="text-xs opacity-80">{label} · depuis {formatAgo(now - a.since)}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            <section>
                <SectionLabel>Ordres de travail ouverts · {tasks ? orders.length : "…"}</SectionLabel>
                {!tasks ? <Muted className="mt-1">Chargement…</Muted>
                : orders.length === 0 ? <Muted className="mt-1">Aucun ordre ouvert sur cette pompe.</Muted>
                : (
                    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                        {orders.map((order) => {
                            const status = ORDER_STATUS[order.status];
                            return (
                                <li key={order.id} className="flex items-start justify-between gap-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{order.title}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            <span className={status?.style}>{status?.label ?? humanize(order.status)}</span>
                                            {" · "}{order.technicianEmail ?? "—"}
                                            {" · "}{order.dueDate ? `échéance ${formatDay(order.dueDate)}` : "sans échéance"}
                                        </p>
                                    </div>
                                    <PriorityBadge priority={order.priority} />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section>
                <SectionLabel>Rapports à valider · {tasks ? reviews.length : "…"}</SectionLabel>
                {tasks && reviews.length === 0 && <Muted className="mt-1">Aucun rapport en attente pour cette pompe.</Muted>}
                {reviews.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                        {reviews.map((task) => (
                            <li key={task.taskId}>
                                <Link to={reportLink(task)} className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</span>
                                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                        {task.submittedAt ? `envoyé ${ago(now - new Date(task.submittedAt))}` : "—"}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {tasks && orders.length === 0 && reviews.length === 0 && (
                <Muted className="text-xs">
                    Les ordres sont reliés à la pompe par leur équipement : saisissez « {pump.pumpId} » dans le champ Équipement lors de l'assignation.
                </Muted>
            )}
        </div>
    );
}

// ---- Documentation ----

// 1 234 567 -> "1,2 Mo"
const fileSize = (bytes) => {
    if (bytes == null) return "";
    const units = ["o", "Ko", "Mo", "Go"];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[i]}`;
};

// The model's manuals: until the server serves PumpModel.manuals, they're found by file name
// (GET /api/v1/files/{name}, "OTW" -> OTW.pdf, OTW_maintenance.pdf…).
export function DocumentationPanel({ pump }) {
    const [result, setResult] = useState(null); // { model, files } or { model, error }
    const [attempt, setAttempt] = useState(0);
    const [openError, setOpenError] = useState(null);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        let cancelled = false;
        const loadManuals = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/files/${encodeURIComponent(pump.model)}`);
                if (!cancelled) setResult({ model: pump.model, files: data.files ?? [] });
            }
            catch (err) {
                console.log("Error while fetching the pump's manuals", err);
                if (!cancelled) setResult({ model: pump.model, error: serverMessage(err, "Les documents n'ont pas pu être chargés.") });
            }
        };
        loadManuals();
        return () => { cancelled = true; };
    }, [pump.model, attempt]);

    // the file needs the token, so it's fetched here and handed to a tab opened right away
    // (opened after the await, the browser would block it as a pop-up)
    const openFile = async (file) => {
        setOpenError(null);
        const tab = window.open("", "_blank");
        try {
            const response = await apiClient.get(`/api/v1/files/id/${encodeURIComponent(file.id)}?inline=true`, { responseType: "blob" });
            const type = response.headers["content-type"] || "application/pdf";
            tab.location.href = URL.createObjectURL(new Blob([response.data], { type }));
        }
        catch (err) {
            console.log("Error while opening the manual", err);
            tab?.close();
            setOpenError(`« ${file.name} » n'a pas pu être ouvert.`);
        }
    };

    const current = result?.model === pump.model ? result : null; // a result for the previous pump isn't shown

    return (
        <div className="grid gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2">
                <SectionLabel>Manuels {pump.model}</SectionLabel>
                {!current && <Muted className="mt-1">Chargement…</Muted>}
                {current?.error && <div className="mt-2"><ErrorBanner message={current.error} onRetry={() => setAttempt((n) => n + 1)} /></div>}
                {current?.files?.length === 0 && (
                    <Muted className="mt-1">Aucun document dont le nom contient « {pump.model} ». Les manuels importés depuis la page Documents apparaissent ici.</Muted>
                )}
                {current?.files?.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                        {current.files.map((file) => (
                            <li key={file.id} className="flex items-center gap-3 py-2">
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-100">{file.name}</span>
                                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{fileSize(file.size)}</span>
                                <button type="button" onClick={() => openFile(file)}
                                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1A75BC] hover:bg-[#1A75BC]/10 dark:text-[#5BC6E8] dark:hover:bg-[#5BC6E8]/10">
                                    Ouvrir <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {openError && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{openError}</p>}
            </section>

            <aside className="rounded-xl bg-[#1A75BC]/5 p-4 dark:bg-[#5BC6E8]/10">
                <MessageSquareText className="h-5 w-5 text-[#1A75BC] dark:text-[#5BC6E8]" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">Une question sur la {pump.model} ?</p>
                <Muted className="mt-1 text-xs">L'assistant répond à partir des manuels, avec ses sources.</Muted>
                <Link to="/ask" className="mt-3 inline-block text-sm font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                    Interroger l'assistant →
                </Link>
            </aside>
        </div>
    );
}
