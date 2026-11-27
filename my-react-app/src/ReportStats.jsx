// « Tableau de bord » (/statistiques): the manager's reports in figures (ReportStatsService, plan_report_stats.md).
// A period at the top (7, 30, 90 days, everything). The figures; the reports filed over time and per form; one
// line per technician of his team; the reports waiting longest for his review; the tasks behind their due date.
// The super admin sees every manager's, or picks one.
//
//   stats ← GET /api/v1/stats/reports?days=30[&manager=…]
//
// Charts (dataviz guidance): stat tiles for the headline numbers; one series in the accent, so no legend (the
// title names it); columns at most 24 px with a 4 px rounded top, a hairline grid; a tooltip per column, and the
// same values in a table under it. On dark the accent is #35a0c4: the theme's #5bc6e8 is outside the validated
// lightness band on the dark surface (validated 2026-11-23).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Inbox } from "lucide-react";
import Layout from "./Layout";
import { cn } from "@/lib/utils";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { useTheme } from "./ThemeContext";
import { ChartTooltip, ErrorBanner } from "./managerUi";
import { formatAgo, formatDay, formatWorked, serverMessage } from "./managerUtils";
import { MicroLabel, Panel, PanelEmpty, PanelSkeleton } from "./dashboard/primitives";
import { num, pct, useChart } from "./dashboard/tokens";

const PERIODS = [
    { days: 7, label: "7 jours" },
    { days: 30, label: "30 jours" },
    { days: 90, label: "90 jours" },
    { days: 0, label: "Tout" },
];
const DARK_SERIES = "#35a0c4";
const STATUS_LABEL = { ASSIGNED: "À faire", STARTED: "En cours", BLOCKED: "En attente", RETURNED: "À corriger" };

const plural = (n, one, many = `${one}s`) => `${num(n)} ${n > 1 ? many : one}`;
// "LocalDate" from the server, "2026-11-23"
const dayOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
// a column's label under the axis, and its title in the tooltip
const stepLabel = (iso, bucket) => {
    const d = dayOf(iso);
    if (bucket === "month") return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};
const stepTitle = (iso, bucket) => {
    if (bucket === "day") return formatDay(iso);
    if (bucket === "week") return `Semaine du ${formatDay(iso)}`;
    return dayOf(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};
const BUCKET_TITLE = { day: "par jour", week: "par semaine", month: "par mois" };
// seconds -> "35 min", "5 h", "2,5 j"
const duration = (seconds) => {
    if (seconds == null) return "—";
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
    if (seconds < 86400) return `${num(seconds / 3600, seconds < 36000 ? 1 : 0)} h`;
    return `${num(seconds / 86400, 1)} j`;
};

// one headline figure: its label, its value, a line under it
function Stat({ label, value, note, warn = false }) {
    return (
        <div className="bg-card px-4 py-3.5">
            <MicroLabel>{label}</MicroLabel>
            <p className={cn("mt-1.5 flex items-center gap-1.5 text-2xl font-semibold tabular-nums tracking-tight", warn ? "text-warn" : "text-foreground")}>
                {warn && <AlertTriangle className="size-4" aria-hidden="true" />}
                {value}
            </p>
            {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </div>
    );
}

function FiledChart({ series, bucket }) {
    const chart = useChart();
    const { isDark } = useTheme();
    const color = isDark ? DARK_SERIES : chart.series;
    const data = series.map((b) => ({ ...b, label: stepLabel(b.start, bucket) }));
    const tick = { fill: chart.tick, fontSize: 10, fontFamily: chart.font };
    return (
        <>
            <div className="h-56 px-2 pb-1 pt-4" role="img"
                aria-label={`Rapports déposés ${BUCKET_TITLE[bucket]} : ${plural(series.reduce((s, b) => s + b.filed, 0), "rapport")} sur la période. Le détail est dans le tableau sous le graphique.`}>
                <ResponsiveContainer>
                    <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -16 }} barCategoryGap={2}>
                        <CartesianGrid vertical={false} stroke={chart.grid} />
                        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: chart.axis }} interval="preserveStartEnd" minTickGap={14} />
                        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
                        <Tooltip cursor={{ fill: chart.grid }}
                            content={<ChartTooltip format={(p) => ({ title: stepTitle(p.start, bucket), value: plural(p.filed, "rapport déposé", "rapports déposés") })} />} />
                        <Bar dataKey="filed" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {/* the same values, without hovering */}
            <details className="border-t border-border px-4 py-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Voir les chiffres</summary>
                <table className="mt-2 w-full text-sm">
                    <tbody className="divide-y divide-border">
                        {[...series].reverse().filter((b) => b.filed > 0).map((b) => (
                            <tr key={b.start}><td className="py-1 text-muted-foreground">{stepTitle(b.start, bucket)}</td><td className="py-1 text-right font-medium tabular-nums">{b.filed}</td></tr>
                        ))}
                    </tbody>
                </table>
                {series.every((b) => b.filed === 0) && <p className="mt-2 text-xs text-muted-foreground">Aucun rapport sur la période.</p>}
            </details>
        </>
    );
}

// the forms, the most filed first: a bar under each name, the count at its end
function FormsList({ forms }) {
    const chart = useChart();
    const { isDark } = useTheme();
    const max = Math.max(1, ...forms.map((f) => f.filed));
    if (forms.length === 0) return <PanelEmpty icon={BarChart3} tone="neutral" title="Aucun rapport sur la période" />;
    return (
        <ul className="space-y-3 p-4">
            {forms.map((f) => (
                <li key={f.title}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-foreground" title={f.title}>{f.title}</span>
                        <span className="font-medium tabular-nums text-foreground">{f.filed}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-foreground/[0.06]">
                        <div className="h-full rounded-full" style={{ width: `${(f.filed / max) * 100}%`, background: isDark ? DARK_SERIES : chart.series }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default function ReportStats() {
    const { user } = useAuth();
    const admin = user?.role === "ADMIN";
    const [days, setDays] = useState(30);
    const [manager, setManager] = useState("");
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [loadedAt, setLoadedAt] = useState(0); // when the figures were read: the « il y a … » count from it

    useEffect(() => {
        let cancelled = false;
        apiClient.get("/api/v1/stats/reports", { params: { days, ...(admin && manager ? { manager } : {}) } })
            .then(({ data }) => { if (!cancelled) { setStats(data); setLoadedAt(Date.now()); setError(null); } })
            .catch((err) => !cancelled && setError(serverMessage(err, "Les chiffres n'ont pas pu être chargés.")));
        return () => { cancelled = true; };
    }, [days, manager, admin, attempt]);

    const f = stats?.figures;
    const since = (iso) => (iso ? formatAgo(loadedAt - new Date(iso).getTime()) : "—");
    const periodText = days === 0 ? "depuis le début" : `sur ${days} jours`;
    const delta = f && f.filedBefore != null ? f.filed - f.filedBefore : null;
    const reviewLink = (w) => `/review/${w.submissionId}?${new URLSearchParams({ taskId: w.taskId, title: w.title ?? "" })}`;

    return (
        <Layout active="stats" full>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <MicroLabel>Tableau de bord</MicroLabel>
                    <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Rapports de l'équipe</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{stats ? `${stats.scope} · ${periodText}` : " "}</p>
                </div>
                {/* the filters, in one row above the figures */}
                <div className="flex flex-wrap items-center gap-2">
                    {admin && (
                        <select value={manager} onChange={(e) => setManager(e.target.value)} aria-label="Manager"
                            className="h-9 rounded-sm border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
                            <option value="">Tous les managers</option>
                            {(stats?.managers ?? []).map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
                        </select>
                    )}
                    <div role="group" aria-label="Période" className="flex rounded-sm border border-border bg-card p-0.5">
                        {PERIODS.map((p) => (
                            <button key={p.days} type="button" onClick={() => setDays(p.days)} aria-pressed={days === p.days}
                                className={cn("rounded-[3px] px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                    days === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && <div className="mt-4"><ErrorBanner message={error} onRetry={() => setAttempt((n) => n + 1)} /></div>}
            {!stats && !error && <div className="mt-6 rounded-md border border-border bg-card"><PanelSkeleton rows={6} /></div>}

            {stats && (
                <div className="mt-6 space-y-6">
                    {/* the figures */}
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
                        <Stat label="Rapports déposés" value={num(f.filed)}
                            note={[
                                f.ownInitiative ? `dont ${num(f.ownInitiative)} à leur initiative` : null,
                                delta == null ? null : delta === 0 ? "autant que la période d'avant" : `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))} par rapport à la période d'avant`,
                            ].filter(Boolean).join(" · ") || null} />
                        <Stat label="En attente de revue" value={num(f.waiting)}
                            note={f.waiting ? `le plus ancien envoyé il y a ${since(f.oldestWaitingSince)}` : "rien n'attend"} />
                        <Stat label="Validés" value={num(f.approved)}
                            note={f.corrections ? `${plural(f.corrections, "correction renvoyée", "corrections renvoyées")} par les techniciens` : null} />
                        <Stat label="En retard" value={num(f.late)} warn={f.late > 0}
                            note={f.late ? "tâches ouvertes après leur échéance" : "aucune tâche en retard"} />
                        <Stat label="Bon du premier coup" value={f.firstTimeRight == null ? "—" : pct(f.firstTimeRight, 0)}
                            note="des rapports validés, jamais renvoyés" />
                        <Stat label="À l'heure" value={f.onTime == null ? "—" : pct(f.onTime, 0)}
                            note="des validés avec échéance, envoyés à temps" />
                        <Stat label="Délai de revue" value={duration(f.averageReviewSeconds)}
                            note="en moyenne, de l'envoi à la validation" />
                        <Stat label="Non conformes" value={f.nonConform == null ? "—" : pct(f.nonConform, 0)}
                            note="des rapports envoyés sur la période" />
                    </div>

                    {/* over time, and per form */}
                    <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-[2fr_1fr]">
                        <Panel label="Activité" title={`Rapports déposés ${BUCKET_TITLE[stats.bucket]}`} meta={periodText}>
                            <FiledChart series={stats.series} bucket={stats.bucket} />
                        </Panel>
                        <Panel label="Formulaires" title="Rapports par formulaire" meta={periodText}>
                            <FormsList forms={stats.byForm} />
                        </Panel>
                    </div>

                    {/* each technician */}
                    <div className="overflow-hidden rounded-md border border-border">
                        <Panel label="Équipe" title="Par technicien" meta={periodText}>
                            {stats.technicians.length === 0 ? (
                                <PanelEmpty icon={Inbox} tone="neutral" title="Aucun technicien"
                                    hint={admin ? "Les managers créent leurs techniciens sur leur page « Techniciens »." : "Ajoutez vos techniciens sur la page « Techniciens »."} />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[56rem] text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-left font-data text-[10px] uppercase tracking-[0.12em] text-subtle">
                                                <th className="px-4 py-2 font-medium">Technicien</th>
                                                <th className="px-2 py-2 text-right font-medium">Déposés</th>
                                                <th className="px-2 py-2 text-right font-medium">Corrections</th>
                                                <th className="px-2 py-2 text-right font-medium">Validés</th>
                                                <th className="px-2 py-2 text-right font-medium">Renvoyés</th>
                                                <th className="px-2 py-2 text-right font-medium">Bon du 1er coup</th>
                                                <th className="px-2 py-2 text-right font-medium">À l'heure</th>
                                                <th className="px-2 py-2 text-right font-medium">Temps moyen</th>
                                                <th className="px-2 py-2 text-right font-medium">Ouvertes</th>
                                                <th className="px-2 py-2 text-right font-medium">En retard</th>
                                                <th className="px-4 py-2 text-right font-medium">Dernier rapport</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {stats.technicians.map((t) => (
                                                <tr key={t.email} className="hover:bg-accent/40">
                                                    <td className="px-4 py-2.5">
                                                        {!admin && t.inTeam && t.id
                                                            ? <Link to={`/technicians/${t.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{t.name}</Link>
                                                            : <span className="font-medium text-foreground">{t.name}</span>}
                                                        {!t.inTeam && !admin && <span className="ml-1.5 text-xs text-muted-foreground">(hors équipe)</span>}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-foreground">{t.filed}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{t.corrections}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">{t.approved}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{t.returns}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">{t.firstTimeRight == null ? "—" : pct(t.firstTimeRight, 0)}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">{t.onTime == null ? "—" : pct(t.onTime, 0)}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{t.averageWorkedSeconds == null ? "—" : formatWorked(t.averageWorkedSeconds)}</td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">{t.open}</td>
                                                    <td className={cn("px-2 py-2.5 text-right tabular-nums", t.late ? "font-semibold text-warn" : "")}>{t.late}</td>
                                                    <td className="px-4 py-2.5 text-right text-muted-foreground">{t.lastReportAt ? `il y a ${since(t.lastReportAt)}` : "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>
                    </div>

                    {/* what needs him */}
                    <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-2">
                        <Panel label="Revue" title="En attente depuis le plus longtemps"
                            action={<Link to="/review" className="text-xs font-medium text-primary hover:underline">Toute la revue</Link>}>
                            {stats.waiting.length === 0 ? (
                                <PanelEmpty icon={Inbox} title="Rien n'attend votre revue" />
                            ) : (
                                <ul className="divide-y divide-border">
                                    {stats.waiting.map((w) => (
                                        <li key={w.taskId}>
                                            <Link to={reviewLink(w)} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/40">
                                                <span className="min-w-0">
                                                    <span className="block truncate font-medium text-foreground">{w.title}</span>
                                                    <span className="text-xs text-muted-foreground">{w.technicianName}</span>
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">il y a {since(w.submittedAt)}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                        <Panel label="Échéances" title="Tâches en retard"
                            action={!admin && <Link to="/orders" className="text-xs font-medium text-primary hover:underline">Tous les ordres</Link>}>
                            {stats.late.length === 0 ? (
                                <PanelEmpty icon={Inbox} title="Aucune tâche en retard" />
                            ) : (
                                <ul className="divide-y divide-border">
                                    {stats.late.map((l) => (
                                        <li key={l.taskId} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-foreground">{l.title}</span>
                                                <span className="text-xs text-muted-foreground">{l.technicianName} · {STATUS_LABEL[l.status] ?? l.status}</span>
                                            </span>
                                            <span className="shrink-0 text-xs font-medium text-warn">échéance {formatDay(l.dueDate)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    </div>
                </div>
            )}
        </Layout>
    );
}
