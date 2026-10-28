// One alert case, opened from the dashboard's live alerts ("Voir l'alerte") or the Alertes link:
// what the twin saw, what was decided and done about it, and the actions to move it on.
//
//   case  ← alertStore.js        (status, priority, activity, linked orders; browser-only for now)
//   live  ← useFleet()           (the alert's current severity and message, the pump's 7-day trend)
//   tasks ← GET /api/v1/task/assigned, /api/v1/task/review   (where the linked orders are now)
//
// /alerts/:number?vue=fil|ordres. /alerts opens the worst open case.
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardPlus, Wrench } from "lucide-react";
import Layout from "./Layout";
import { useAuth } from "./AuthContext";
import { apiClient } from "./apiClient";
import { useFleet } from "./fleetSimulator";
import { SEVERITY } from "./pumpStates";
import { ALERT_KINDS, ISSUE_STATUS } from "./alertContent";
import { addComment, setPriority, setStatus, useAlertIssues } from "./alertStore";
import { ActivityFeed, OrdersTab, SummaryCard, TrendCard } from "./AlertFeed";
import { Card, EmptyState, Notice, PriorityBadge, SimulatedBadge } from "./managerUi";
import { PRIORITY_LABEL, ago, formatDateTime, newOrderRoute, plural, serverMessage } from "./managerUtils";

const SEVERITY_RANK = { critical: 0, warning: 1 };
const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];

const selectClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

// the open cases, worst first then oldest: the order previous / next walks through
const openCases = (issues) =>
    issues.filter((i) => i.status !== "RESOLVED")
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.raisedAt - b.raisedAt);

// /alerts: the worst open case, or a note that there is none
export function AlertsIndex() {
    const first = openCases(useAlertIssues())[0];
    if (first) return <Navigate to={`/alerts/${first.number}`} replace />;
    return (
        <Layout active="alerts">
            <EmptyState icon="✅" title="Aucune alerte ouverte" hint="Les alertes levées par le digital twin s'ouvrent ici." />
        </Layout>
    );
}

const Pill = ({ className, children }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
);

// ---- the right column ----

function UpdatePanel({ issue, live, actor }) {
    const severity = live?.severity ?? issue.severity;
    const { label, icon: Icon, style } = SEVERITY[severity];
    return (
        <Card title="Mettre à jour">
            <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Statut
                    <select value={issue.status} onChange={(e) => setStatus(issue.number, e.target.value, actor)} className={selectClass}>
                        {Object.entries(ISSUE_STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
                    </select>
                </label>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Priorité
                    <select value={issue.priority} onChange={(e) => setPriority(issue.number, e.target.value, actor)} className={selectClass}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                    </select>
                </label>
                <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Gravité</p>
                    <p className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${style}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                        <span className="ml-auto text-xs font-normal opacity-80">{live ? "selon la mesure en direct" : "la plus haute atteinte"}</span>
                    </p>
                </div>
            </div>
        </Card>
    );
}

function WorkPanel({ issue, onCreate, onShowOrders }) {
    return (
        <Card>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0ca30c] text-white">
                    <Wrench className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="pt-2 text-sm font-medium text-slate-900 dark:text-slate-100">Faut-il intervenir sur cette pompe ?</p>
            </div>
            <button type="button" onClick={onCreate}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1A75BC] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#0F2A49]">
                <ClipboardPlus className="h-4 w-4" aria-hidden="true" /> Créer un ordre de travail
            </button>
            {issue.orders.length > 0 && (
                <button type="button" onClick={onShowOrders} className="mt-2 w-full text-center text-xs font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                    {issue.orders.length} {plural(issue.orders.length, "ordre lié", "ordres liés")} →
                </button>
            )}
        </Card>
    );
}

// now: the twin's last tick
function ResolutionPanel({ issue, live, now, actor }) {
    if (issue.status === "RESOLVED") {
        return (
            <Card title="Résolution">
                <p className="text-sm text-slate-700 dark:text-slate-200">Résolue le {formatDateTime(new Date(issue.resolvedAt).toISOString())}.</p>
                <button type="button" onClick={() => setStatus(issue.number, issue.orders.length ? "IN_PROGRESS" : "ACKNOWLEDGED", actor)}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                    Rouvrir
                </button>
            </Card>
        );
    }
    return (
        <Card title="Résolution">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                {live ? "La mesure est encore hors limites." : `Mesure revenue dans les limites ${ago(now - issue.clearedAt)}.`}
            </p>
            <button type="button" onClick={() => setStatus(issue.number, "RESOLVED", actor)}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700">
                Marquer comme résolue
            </button>
        </Card>
    );
}

// ---- the page ----

const AlertDetail = () => {
    const number = Number(useParams().number);
    const issues = useAlertIssues();
    const fleet = useFleet();
    const { user } = useAuth();
    const navigate = useNavigate();
    const notice = useLocation().state?.notice;
    const [params, setParams] = useSearchParams();
    const [tasks, setTasks] = useState(null); // { orders, reviews }; null = still loading
    const [loadError, setLoadError] = useState(null);

    // the linked orders' current state; the case itself is local
    useEffect(() => {
        let cancelled = false;
        const loadTasks = async () => {
            try {
                const [assigned, review] = await Promise.all([apiClient.get("/api/v1/task/assigned"), apiClient.get("/api/v1/task/review")]);
                if (!cancelled) setTasks({ orders: assigned.data.tasks ?? [], reviews: review.data.tasks ?? [] });
            }
            catch (err) {
                console.log("Error while loading the alert's work orders", err);
                if (!cancelled) setLoadError(serverMessage(err, "Les ordres de travail n'ont pas pu être chargés."));
            }
        };
        loadTasks();
        return () => { cancelled = true; };
    }, []);

    const issue = issues.find((i) => i.number === number);
    if (!issue) {
        return (
            <Layout active="alerts">
                <EmptyState icon="🔎" title={`Alerte #${number || "?"} introuvable`}
                    hint="Les alertes sont gardées dans ce navigateur tant que le serveur ne les enregistre pas." />
            </Layout>
        );
    }

    const actor = user?.email ?? "Manager";
    const pump = fleet.pumps.find((p) => p.pumpId === issue.pumpId);
    const live = fleet.alerts.find((a) => a.id === issue.key);
    const kind = ALERT_KINDS[issue.kind];
    const severity = SEVERITY[live?.severity ?? issue.severity];
    const SeverityIcon = severity.icon;
    const status = ISSUE_STATUS[issue.status];
    const view = params.get("vue") === "ordres" ? "ordres" : "fil";

    // previous / next among the open cases (this one included even when resolved)
    const walk = openCases(issues);
    if (!walk.includes(issue)) walk.unshift(issue);
    const position = walk.indexOf(issue);
    const goTo = (i) => navigate(`/alerts/${walk[i].number}`);

    const createOrder = () => navigate(...newOrderRoute(issue.pumpId, issue.site, live?.message ?? kind.title, issue.number));

    return (
    <Layout active="alerts" full>
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <Link to="/dashboard#alerts" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                    ← Alertes en direct
                </Link>
                <div className="flex items-center gap-1">
                    <button type="button" disabled={position <= 0} onClick={() => goTo(position - 1)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-200/60 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédente
                    </button>
                    <span className="rounded-md bg-white px-2 py-1 text-xs tabular-nums text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                        {position + 1} sur {walk.length}
                    </span>
                    <button type="button" disabled={position >= walk.length - 1} onClick={() => goTo(position + 1)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#1A75BC] hover:bg-slate-200/60 disabled:opacity-40 dark:text-[#5BC6E8] dark:hover:bg-slate-700">
                        Suivante <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <header>
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    #{issue.number} · {issue.pumpId} — {kind.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Pill className={severity.style}><SeverityIcon className="h-3 w-3" aria-hidden="true" /> {severity.label}</Pill>
                    <PriorityBadge priority={issue.priority} />
                    <Pill className={status.style}>{status.label}</Pill>
                    <SimulatedBadge />
                    <span>
                        {issue.site} › {pump?.model} ›{" "}
                        <Link to={`/pumps?pompe=${issue.pumpId}`} className="font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">{issue.pumpId}</Link>
                    </span>
                    <span>· Ouverte le {formatDateTime(new Date(issue.raisedAt).toISOString())}</span>
                    {live && <span>· {live.message}</span>}
                </div>
            </header>

            {notice && <Notice>{notice}</Notice>}

            <div className="grid gap-6 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-8">
                    <div role="tablist" className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
                        {[["fil", "Fil d'activité"], ["ordres", `Ordres de travail · ${issue.orders.length}`]].map(([key, label]) => (
                            <button key={key} type="button" role="tab" aria-selected={view === key}
                                onClick={() => setParams(key === "fil" ? {} : { vue: key }, { replace: true })}
                                className={`-mb-px border-b-2 pb-2.5 text-sm transition ${
                                    view === key
                                        ? "border-[#1A75BC] font-semibold text-[#1A75BC] dark:border-[#5BC6E8] dark:text-[#5BC6E8]"
                                        : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                }`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {view === "fil" ? (
                        <>
                            {/* what the alert is and what to do, then its data, then what happened */}
                            {pump && <SummaryCard issue={issue} pump={pump} />}
                            {pump && <TrendCard pump={pump} issue={issue} now={fleet.updatedAt} />}
                            <Card title="Fil d'activité">
                                <ActivityFeed issue={issue} onComment={(text) => addComment(issue.number, text, actor)} />
                            </Card>
                        </>
                    ) : (
                        <Card>
                            <OrdersTab issue={issue} tasks={tasks} loadError={loadError} />
                        </Card>
                    )}
                </div>

                <aside className="space-y-6 lg:col-span-4">
                    <UpdatePanel issue={issue} live={live} actor={actor} />
                    <WorkPanel issue={issue} onCreate={createOrder} onShowOrders={() => setParams({ vue: "ordres" }, { replace: true })} />
                    <ResolutionPanel issue={issue} live={live} now={fleet.updatedAt} actor={actor} />
                </aside>
            </div>
        </div>
    </Layout>);
};

export default AlertDetail;
