// Everything one pump went through, on one timeline: the alerts it showed (the twin's and the faults
// technicians reported, with what they found on site) and the maintenance made on it (each task with
// its technician and its report). Above it, its checks on site (levée de doute) with their reports,
// how often its alerts were false, and how they were closed. Opened from the pump page's Historique panel.
//
//   history ← GET /api/v1/pumps/{pumpId}/history   { alerts: [case…], tasks: [task…], checks: [check…] }   (AlertService)
//   the pump's live state ← useFleet()
import Layout from "./Layout";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, ClipboardList, FileText, Gauge, Megaphone, Repeat, ShieldAlert, ShieldCheck, Siren, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiClient } from "./apiClient";
import { useFleet } from "./fleetSimulator";
import { CANNOT_HANDLE_REASON, CHECK_VERDICT, CLOSE_REASON, FALSE_ALARM_CAUSE, INCONCLUSIVE_REASON, ISSUE_STATUS, VERDICT, caseTitle } from "./alertContent";
import { CheckPdfButton, Tag } from "./CheckReportParts";
import { PriorityBadge } from "./managerUi";
import { TASK_TYPE_LABEL, formatDateTime, formatDay, formatWorked, localIso, newOrderRoute, plural, serverMessage } from "./managerUtils";
import { MicroLabel, Panel, PanelEmpty, PanelError, PanelSkeleton } from "./dashboard/primitives";
import { SEVERITY, STATE, TONE, pct } from "./dashboard/tokens";
import { REPORT_STATUS, TASK_STATE } from "./teamUtils";

const dayOf = (ms) => formatDay(localIso(new Date(ms)));
const monthOf = (ms) => new Date(ms).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

// a timeline item: an alert or a task, with the moment it is filed under
const toItems = (history) => [
    ...history.alerts.map((alert) => ({ type: "alert", at: alert.raisedAt, alert })),
    ...history.tasks.map((task) => ({ type: "task", at: Date.parse(task.createdAt), task })),
].sort((a, b) => b.at - a.at);

const FILTERS = [
    { value: "all", label: "Tout" },
    { value: "alert", label: "Alertes" },
    { value: "task", label: "Maintenance" },
];

function Tile({ label, value, hint, index }) {
    return (
        <div style={{ "--i": index }} className="console-rise min-w-0 bg-card px-4 py-3.5">
            <MicroLabel as="dt">{label}</MicroLabel>
            <dd className="mt-1.5 font-data text-[24px] font-medium leading-none tracking-tight text-foreground">{value}</dd>
            {hint && <dd className="mt-2 text-xs text-muted-foreground">{hint}</dd>}
        </div>
    );
}

// an alert's last verdict on site: its check report's, or the quick verdicts given before it existed
const verdictOf = (alert) => alert.check?.verdict
    ?? (alert.verifications?.some((v) => v.verdict === "CONFIRMED") ? "CONFIRMED"
        : alert.verifications?.some((v) => v.verdict === "FALSE_ALARM") ? "FALSE_ALARM" : null);

// the sensor blamed for this many false alarms in 90 days: worth having it looked at
const SENSOR_DAYS = 90;
const SENSOR_ALERTS = 2;
const sensorFalseAlarms = (checks, now) => checks.filter((c) => c.verdict === "FALSE_ALARM" && c.falseAlarmCause === "SENSOR_FAULT"
    && c.submittedAt && now - Date.parse(c.submittedAt) <= SENSOR_DAYS * 86400000);

function Summary({ history }) {
    const { alerts, tasks, checks } = history;
    const critical = alerts.filter((a) => a.severity === "critical").length;
    const reported = alerts.filter((a) => a.source === "FIELD").length;
    const sent = checks.filter((c) => c.rounds > 0);
    const byVerdict = (v) => sent.filter((c) => c.verdict === v).length;
    // the false-alarm rate, per alert: false ÷ (confirmed + false); a check that couldn't conclude isn't a finding
    const verdicts = alerts.map(verdictOf);
    const falseAlarms = verdicts.filter((v) => v === "FALSE_ALARM").length;
    const found = falseAlarms + verdicts.filter((v) => v === "CONFIRMED").length;
    const causes = Object.entries(alerts.filter((a) => verdictOf(a) === "FALSE_ALARM" && a.check?.falseAlarmCause)
        .reduce((acc, a) => ({ ...acc, [a.check.falseAlarmCause]: (acc[a.check.falseAlarmCause] ?? 0) + 1 }), {}))
        .sort((a, b) => b[1] - a[1]);
    const CAUSE_SHORT = { SENSOR_FAULT: "capteur", PUMP_OK: "pompe en bon état", OPERATING_CONDITIONS: "conditions de marche" };
    const work = tasks.filter((t) => t.taskType !== "VERIFICATION");
    const approved = work.filter((t) => t.status === "APPROVED");
    const worked = tasks.reduce((sum, t) => sum + (t.workedSeconds ?? 0), 0);
    const last = approved.map((t) => t.closedAt).filter(Boolean).sort().at(-1);
    const tiles = [
        { label: "Alertes", value: alerts.length, hint: `${critical} ${plural(critical, "critique")} · ${reported} ${plural(reported, "signalée")} sur place` },
        { label: "Levées de doute", value: sent.length, hint: `${byVerdict("CONFIRMED")} ${plural(byVerdict("CONFIRMED"), "confirmée")} · ${byVerdict("FALSE_ALARM")} ${plural(byVerdict("FALSE_ALARM"), "fausse", "fausses")} · ${byVerdict("INCONCLUSIVE")} non concl.` },
        { label: "Fausses alertes", value: found ? pct(falseAlarms / found, 0) : "—",
          hint: found ? `${falseAlarms} sur ${found} ${plural(found, "vérifiée")}${causes.length ? ` · ${causes.map(([c, n]) => `${CAUSE_SHORT[c]} ×${n}`).join(", ")}` : ""}` : "aucune vérifiée sur place" },
        { label: "Interventions", value: work.length, hint: `${approved.length} ${plural(approved.length, "approuvée")}` },
        { label: "Temps passé", value: worked ? formatWorked(worked) : "—", hint: "interventions et levées de doute" },
        { label: "Dernière maintenance", value: last ? dayOf(Date.parse(last)) : "—", hint: last ? "rapport approuvé" : "aucune approuvée" },
    ];
    return (
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile, index) => <Tile key={tile.label} {...tile} index={index} />)}
        </dl>
    );
}

// the sensor keeps raising false alarms: have it checked (a work order on the pump, not on an alert)
function SensorCallout({ history, site }) {
    const navigate = useNavigate();
    const [now] = useState(() => Date.now());
    const blamed = sensorFalseAlarms(history.checks, now);
    if (blamed.length < SENSOR_ALERTS) return null;
    const reason = `capteur à contrôler (${blamed.length} fausses alertes en ${SENSOR_DAYS} jours)`;
    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn/10 px-4 py-3">
            <p className="flex items-start gap-2 text-sm text-foreground">
                <Gauge className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                <span>Le capteur a causé <span className="font-medium">{blamed.length} fausses alertes</span> en {SENSOR_DAYS} jours (alertes {[...new Set(blamed.map((c) => `#${c.alertNumber}`))].join(", ")}) : faites-le contrôler.</span>
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate(...newOrderRoute(history.pumpId, site, reason, null))}>
                <Wrench aria-hidden="true" /> Faire contrôler le capteur
            </Button>
        </div>
    );
}

// every check on the pump, newest first: its verdict, what came next, its report and PDF
function ChecksPanel({ history }) {
    const checks = [...history.checks].sort((a, b) => Date.parse(b.submittedAt ?? b.createdAt) - Date.parse(a.submittedAt ?? a.createdAt));
    const current = new Set(history.alerts.map((a) => a.check?.taskId).filter(Boolean));
    return (
        <Panel label="Sur place" title="Levées de doute" meta={`${checks.length} ${plural(checks.length, "levée", "levées")} de doute`}
            className="rounded-md border border-border">
            {checks.length === 0 ? (
                <PanelEmpty icon={ClipboardCheck} tone="ok" title="Aucune levée de doute" hint="Les vérifications sur place de ses alertes s'afficheront ici." />
            ) : (
                <ul className="divide-y divide-border">
                    {checks.map((c) => {
                        const verdict = c.verdict && CHECK_VERDICT[c.verdict];
                        const why = c.falseAlarmCause ? FALSE_ALARM_CAUSE[c.falseAlarmCause] : c.inconclusiveReason ? INCONCLUSIVE_REASON[c.inconclusiveReason] : null;
                        const state = TASK_STATE[c.status];
                        const next = c.verdict !== "CONFIRMED" ? null : c.canHandle ? "pouvait s'en charger"
                            : c.cannotHandleReason ? `ne pouvait pas s'en charger : ${CANNOT_HANDLE_REASON[c.cannotHandleReason].toLowerCase()}` : null;
                        return (
                            <li key={c.taskId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-6">
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                                        {verdict ? <Tag tone={verdict.tone}>{verdict.label}</Tag> : <Tag tone="neutral">{state?.label ?? c.status}</Tag>}
                                        {why && <span className="text-muted-foreground">{why}</span>}
                                        {c.urgentStop && <span className="text-xs font-medium text-crit">arrêt immédiat demandé</span>}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        <Link to={`/alerts/${c.alertNumber}`} className="font-medium text-foreground hover:underline">Alerte #{c.alertNumber}</Link>
                                        {" "}· {c.technicianName ?? c.technicianEmail}{c.fieldReport ? " (panne signalée)" : c.selfAssigned ? " (à son initiative)" : ""}
                                        {" "}· {dayOf(Date.parse(c.submittedAt ?? c.createdAt))}
                                        {c.rounds > 1 && <> · version {c.rounds}</>}
                                        {c.rounds > 0 && <> · {c.anomalies} {plural(c.anomalies, "anomalie")} sur {c.points} {plural(c.points, "point")} · {c.photos} {plural(c.photos, "photo")}</>}
                                        {verdict && state && c.status !== "APPROVED" && <> · {state.label.toLowerCase()}</>}
                                    </p>
                                    {next && <p className="mt-0.5 text-xs text-muted-foreground">{c.technicianName ?? "Le technicien"} {next}</p>}
                                </div>
                                {c.rounds > 0 && (
                                    <div className="flex shrink-0 items-start gap-2">
                                        {current.has(c.taskId) && (
                                            <Button variant="ghost" size="sm" asChild><Link to={`/alerts/${c.alertNumber}#rapport`}>Rapport</Link></Button>
                                        )}
                                        <CheckPdfButton taskId={c.taskId} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

// how the pump's alerts were closed, by reason: a count and a bar each, the most frequent first
function ClosuresPanel({ alerts }) {
    const closed = alerts.filter((a) => a.status === "RESOLVED");
    const open = alerts.length - closed.length;
    const rows = Object.entries(closed.reduce((acc, a) => ({ ...acc, [a.closeReason ?? "NONE"]: (acc[a.closeReason ?? "NONE"] ?? 0) + 1 }), {}))
        .map(([reason, count]) => ({ reason, count, label: reason === "NONE" ? "Sans raison (close avant la clôture motivée)" : CLOSE_REASON[reason] }))
        .sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return (
        <Panel label="Clôtures" title="Comment ses alertes ont été closes" meta={`${closed.length} ${plural(closed.length, "close")} · ${open} ${plural(open, "ouverte")}`}
            className="rounded-md border border-border">
            {rows.length === 0 ? (
                <PanelEmpty icon={ShieldCheck} tone="ok" title="Aucune alerte close" hint="Leur raison de clôture s'affichera ici." />
            ) : (
                <ul className="space-y-3 px-4 py-4 sm:px-6">
                    {rows.map((r) => (
                        <li key={r.reason} title={`${r.label} : ${r.count} sur ${closed.length}`}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="text-foreground">{r.label}</span>
                                <span className="font-data tabular-nums text-foreground">{r.count}<span className="ml-1.5 text-xs text-subtle">{pct(r.count / closed.length, 0)}</span></span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-border" aria-hidden="true">
                                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

// the marker on the timeline's line: the item's icon in its tone
const Marker = ({ icon: Icon, tone }) => (
    <span className={cn("absolute -left-[13px] top-0.5 flex size-6 items-center justify-center rounded-full ring-4 ring-card", TONE[tone].soft)}>
        <Icon className={cn("size-3.5", TONE[tone].text)} aria-hidden="true" />
    </span>
);

function AlertItem({ alert }) {
    const severity = SEVERITY[alert.severity] ?? SEVERITY.warning;
    const status = ISSUE_STATUS[alert.status];
    const field = alert.source === "FIELD";
    const end = alert.resolvedAt ? `résolue le ${dayOf(alert.resolvedAt)}`
        : alert.clearedAt ? `revenue dans les limites le ${dayOf(alert.clearedAt)}` : "toujours ouverte";
    return (
        <li className="relative pb-6 pl-6 last:pb-0">
            <Marker icon={field ? Megaphone : Siren} tone={severity.tone} />
            <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                    {caseTitle(alert)}
                    <span className="ml-2 font-data text-[11px] font-normal text-subtle">#{alert.number}</span>
                </p>
                <span className="flex items-center gap-1.5">
                    <span className={cn("font-data text-[10px] font-semibold uppercase tracking-[0.12em]", TONE[severity.tone].text)}>{severity.label}</span>
                    <span className="font-data text-[10px] uppercase tracking-[0.1em] text-subtle">· {status?.label ?? alert.status}</span>
                </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
                {field ? `Signalée par ${alert.report?.byName ?? alert.report?.by}` : "Digital twin"} · levée le {formatDateTime(new Date(alert.raisedAt).toISOString())} · {end}
            </p>
            {field && alert.report?.description && <p className="mt-1 line-clamp-2 text-sm text-foreground">{alert.report.description}</p>}
            {alert.check?.verdict && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs">
                    {alert.check.verdict === "FALSE_ALARM" ? <ShieldCheck className="mt-px size-3.5 shrink-0 text-ok" aria-hidden="true" /> : <ShieldAlert className={cn("mt-px size-3.5 shrink-0", TONE[CHECK_VERDICT[alert.check.verdict].tone].text)} aria-hidden="true" />}
                    <span className="text-foreground">
                        Levée de doute de {alert.check.technicianName ?? alert.check.technicianEmail} : {CHECK_VERDICT[alert.check.verdict].label.toLowerCase()}
                        {alert.check.falseAlarmCause && <span className="text-muted-foreground"> ({FALSE_ALARM_CAUSE[alert.check.falseAlarmCause].toLowerCase()})</span>}
                    </span>
                </p>
            )}
            {alert.closeReason && <p className="mt-0.5 text-xs text-muted-foreground">Close : {CLOSE_REASON[alert.closeReason].toLowerCase()}{alert.closeComment ? ` — « ${alert.closeComment} »` : ""}</p>}
            {alert.recurrence && (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-warn">
                    <Repeat className="size-3.5" aria-hidden="true" /> Revenue après la fausse alerte #{alert.recurrence.number}
                    {alert.recurrence.count > 1 ? ` (${alert.recurrence.count} en 30 jours)` : ""}
                </p>
            )}
            {alert.verifications?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                    {alert.verifications.map((v) => {
                        const Icon = v.verdict === "FALSE_ALARM" ? ShieldCheck : ShieldAlert;
                        return (
                            <li key={v.technicianEmail} className="flex items-start gap-1.5 text-xs">
                                <Icon className={cn("mt-px size-3.5 shrink-0", TONE[VERDICT[v.verdict].tone].text)} aria-hidden="true" />
                                <span className="text-foreground">{v.name ?? v.technicianEmail} : {VERDICT[v.verdict].label.toLowerCase()}{v.comment ? <span className="text-muted-foreground"> — « {v.comment} »</span> : null}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
                <Link to={`/alerts/${alert.number}`} className="font-medium text-primary hover:underline">Ouvrir l'alerte</Link>
                {alert.orders?.length > 0 && <span className="text-muted-foreground">{alert.orders.length} {plural(alert.orders.length, "ordre de travail", "ordres de travail")}</span>}
                {alert.interventions?.length > 0 && <span className="text-muted-foreground">envoyée en atelier</span>}
            </p>
        </li>
    );
}

function TaskItem({ task, check, current }) {
    const state = TASK_STATE[task.status] ?? { label: task.status, tone: "neutral", icon: Wrench };
    const report = REPORT_STATUS[task.submissionStatus];
    const verdict = check?.verdict && CHECK_VERDICT[check.verdict];
    return (
        <li className="relative pb-6 pl-6 last:pb-0">
            <Marker icon={check ? ClipboardCheck : Wrench} tone={state.tone === "neutral" ? "standby" : state.tone} />
            <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{task.title}</p>
                <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{state.label}</span>
                    <PriorityBadge priority={task.priority} />
                </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
                {TASK_TYPE_LABEL[task.taskType] ?? task.taskType} · {task.technicianName ?? task.technicianEmail}{task.workshop ? " · atelier" : ""}
                {" "}· assignée le {dayOf(Date.parse(task.createdAt))}
                {task.closedAt && <> · clôturée le {dayOf(Date.parse(task.closedAt))}</>}
                {task.workedSeconds > 0 && <> · {formatWorked(task.workedSeconds)} passées</>}
            </p>
            {task.statusComment && <p className="mt-1 text-xs italic text-muted-foreground">« {task.statusComment} »</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {task.latestSubmissionId && (
                    <Link to={`/review/${task.latestSubmissionId}?${new URLSearchParams({ title: task.title ?? "" })}`}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        <FileText className="size-3.5" aria-hidden="true" /> {task.formTitle ?? "Rapport"}
                    </Link>
                )}
                {report && <span className={cn("font-data text-[10px] font-semibold uppercase tracking-[0.12em]", TONE[report.tone].text)}>{report.label}</span>}
                {/* a check has no checklist: its report is on its alert (the alert shows its current check) */}
                {verdict && <span className={cn("font-data text-[10px] font-semibold uppercase tracking-[0.12em]", TONE[verdict.tone].text)}>{verdict.label}</span>}
                {verdict && current && (
                    <Link to={`/alerts/${task.alertNumber}#rapport`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        <FileText className="size-3.5" aria-hidden="true" /> Rapport de levée de doute
                    </Link>
                )}
                {task.alertNumber && <Link to={`/alerts/${task.alertNumber}`} className="text-muted-foreground hover:text-foreground">{check ? "alerte" : "depuis l'alerte"} #{task.alertNumber}</Link>}
            </p>
        </li>
    );
}

export default function PumpHistoryPage() {
    const { pumpId } = useParams();
    const fleet = useFleet();
    const [history, setHistory] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [filter, setFilter] = useState("all");

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        let cancelled = false;
        apiClient.get(`/api/v1/pumps/${encodeURIComponent(pumpId)}/history`)
            .then(({ data }) => { if (!cancelled) { setHistory({ ...data, checks: data.checks ?? [] }); setError(null); } })
            .catch((err) => {
                console.log("Error while loading the pump's history", err);
                if (!cancelled) setError(serverMessage(err, "L'historique n'a pas pu être chargé. Vérifiez votre connexion et réessayez."));
            });
        return () => { cancelled = true; };
    }, [pumpId, attempt]);

    const items = useMemo(() => (history ? toItems(history) : []), [history]);
    const checks = useMemo(() => Object.fromEntries((history?.checks ?? []).map((c) => [c.taskId, c])), [history]);
    const currentChecks = useMemo(() => new Set((history?.alerts ?? []).map((a) => a.check?.taskId).filter(Boolean)), [history]);
    const shown = items.filter((item) => filter === "all" || item.type === filter);
    const months = [];
    for (const item of shown) {
        const month = monthOf(item.at);
        if (months.at(-1)?.month !== month) months.push({ month, items: [] });
        months.at(-1).items.push(item);
    }
    const counts = { all: items.length, alert: history?.alerts.length ?? 0, task: history?.tasks.length ?? 0 };
    const pump = fleet.pumps.find((p) => p.pumpId === pumpId);
    const state = pump && STATE[pump.state];
    const StateIcon = state?.icon;

    return (
    <Layout active="pumps" wide>
        <Link to={`/pumps?pompe=${encodeURIComponent(pumpId)}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden="true" /> Fiche de {pumpId}
        </Link>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
                <MicroLabel>Historique de la pompe</MicroLabel>
                <h1 className="mt-1 font-data text-2xl font-semibold tracking-tight text-foreground">{pumpId}</h1>
                {pump && (
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        {StateIcon && <StateIcon className={cn("size-4", TONE[state.tone].text)} aria-hidden="true" />}
                        {state?.label ?? pump.state} · {pump.model} · {pump.siteName}
                    </p>
                )}
            </div>
            <Button variant="outline" size="sm" asChild>
                <Link to={`/pumps?pompe=${encodeURIComponent(pumpId)}`}><ClipboardList aria-hidden="true" /> Fiche et mesures</Link>
            </Button>
        </header>

        {history && <Summary history={history} />}
        {history && <SensorCallout history={history} site={pump?.siteName ?? history.alerts[0]?.site} />}

        {history && (
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <ChecksPanel history={history} />
                <ClosuresPanel alerts={history.alerts} />
            </div>
        )}

        <Panel label="Chronologie" title="Alertes et maintenance" meta={history ? `${shown.length} ${plural(shown.length, "événement")}` : null}
            className="mt-6 rounded-md border border-border"
            toolbar={history && items.length > 0 && (
                <ToggleGroup type="single" value={filter} onValueChange={(v) => setFilter(v || "all")} spacing={1} size="sm" aria-label="Filtrer la chronologie">
                    {FILTERS.map((f) => (
                        <ToggleGroupItem key={f.value} value={f.value} aria-label={`${f.label}, ${counts[f.value]}`}
                            className="h-7 gap-1.5 rounded-sm px-2 text-xs text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground">
                            {f.label} <span className="font-data text-[10px] tabular-nums text-subtle">{counts[f.value]}</span>
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            )}>
            {!history && !error && <PanelSkeleton rows={5} />}
            {error && <PanelError message={error} onRetry={() => { setError(null); setHistory(null); setAttempt((n) => n + 1); }} />}
            {history && items.length === 0 && (
                <PanelEmpty icon={Siren} tone="ok" title="Rien pour l'instant" hint="Les alertes et les interventions sur cette pompe s'afficheront ici." />
            )}
            {months.length > 0 && (
                <div className="space-y-6 px-4 py-5 sm:px-6">
                    {months.map(({ month, items: monthItems }) => (
                        <section key={month}>
                            <MicroLabel as="h3" className="mb-3">{month}</MicroLabel>
                            <ol className="ml-3 border-l border-border">
                                {monthItems.map((item) => item.type === "alert"
                                    ? <AlertItem key={`a${item.alert.number}`} alert={item.alert} />
                                    : <TaskItem key={`t${item.task.id}`} task={item.task} check={checks[item.task.id]} current={currentChecks.has(item.task.id)} />)}
                            </ol>
                        </section>
                    ))}
                </div>
            )}
        </Panel>
    </Layout>);
}
