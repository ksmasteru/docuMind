// The manager's pump page: the fleet listed on the left (filtered by site), and the selected
// pump on the right, split in two: its photo, asset data, a new work order button and the three
// action buttons on top, and the panel of the chosen action under them (PumpPanels.jsx).
//
//   fleet ← useFleet()                     (fleetSimulator.js, until the twin streams)
//   tasks ← GET /api/v1/task/assigned      (the Interventions panel keeps this pump's orders)
//         ← GET /api/v1/task/review        (… and its reports waiting for review)
//
// The selection lives in the URL (/pumps?pompe=PHB3-J-07&vue=mesures&site=J) so other pages
// can link to a pump.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, BookOpen, Camera, ClipboardPlus, Cpu, History, Search, Wrench } from "lucide-react";
import Layout from "./Layout";
import { apiClient } from "./apiClient";
import { NOMINAL_FLOW, SITES, effectiveState, useFleet } from "./fleetSimulator";
import { PUMP_STATES, SEVERITY, pumpPhoto } from "./pumpStates";
import { DocumentationPanel, InterventionsPanel, MeasuresPanel } from "./PumpPanels";
import { HistoryPanel } from "./PumpHistory";
import { SimulatedBadge } from "./managerUi";
import { openIssueFor, useAlertIssues } from "./alertStore";
import { ago, newOrderRoute, plural, serverMessage } from "./managerUtils";

// the action buttons, each filling the bottom half with its panel
const ACTIONS = [
    { key: "mesures",       label: "Mesures",       icon: Activity },
    { key: "interventions", label: "Interventions", icon: Wrench },
    { key: "historique",    label: "Historique",    icon: History },
    { key: "documentation", label: "Documentation", icon: BookOpen },
];

const paneClass = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800";

const StateBadge = ({ state }) => {
    const { label, icon: Icon, fill } = PUMP_STATES[state];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${fill}`}>
            <Icon className="h-3 w-3" aria-hidden="true" /> {label}
        </span>
    );
};

// ---- left: the list ----

// the pumps that aren't running come first, worst first; the sort keeps the fleet's order within a state
const STATE_ORDER = ["FAULT", "OFFLINE", "MAINTENANCE", "STANDBY", "RUNNING"];

function PumpList({ pumps, alerts, now, site, onSite, selectedId, onSelect }) {
    const [query, setQuery] = useState("");
    const worstAlert = (pumpId) => alerts.find((a) => a.pumpId === pumpId); // alerts are sorted worst first
    const q = query.trim().toUpperCase();
    const shown = pumps.filter((p) => (!site || p.site === site) && (!q || p.pumpId.includes(q)))
        .sort((a, b) => STATE_ORDER.indexOf(effectiveState(a, now)) - STATE_ORDER.indexOf(effectiveState(b, now)));
    const groups = SITES.filter((s) => !site || s.code === site)
        .map((s) => ({ ...s, pumps: shown.filter((p) => p.site === s.code) }))
        .filter((g) => g.pumps.length > 0);
    const filters = [{ code: null, name: "Tous", count: pumps.length },
        ...SITES.map((s) => ({ ...s, count: pumps.filter((p) => p.site === s.code).length }))];

    return (
        <aside className={`${paneClass} flex max-h-[26rem] flex-col lg:max-h-none lg:w-[26%] lg:min-w-64 lg:shrink-0`}>
            <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pompes</h1>
                    <SimulatedBadge />
                </div>
                <div role="radiogroup" aria-label="Site" className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900/60">
                    {filters.map((f) => (
                        <button key={f.name} type="button" role="radio" aria-checked={site === f.code} onClick={() => onSite(f.code)}
                            className={`flex-1 rounded-md px-2 py-1 text-xs transition ${
                                site === f.code
                                    ? "bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                            }`}>
                            {f.name} <span className="tabular-nums text-slate-400">{f.count}</span>
                        </button>
                    ))}
                </div>
                <label className="relative block">
                    <span className="sr-only">Rechercher une pompe</span>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (ex. PHB3)"
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                </label>
            </div>

            <nav aria-label="Liste des pompes" className="flex-1 overflow-y-auto p-2">
                {groups.length === 0 && <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">Aucune pompe ne correspond.</p>}
                {groups.map((group) => (
                    <div key={group.code} className="mb-3 last:mb-0">
                        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {group.name} · {group.pumps.length}
                        </p>
                        <ul className="space-y-0.5">
                            {group.pumps.map((pump) => {
                                const state = effectiveState(pump, now);
                                const { label, icon: Icon, fill } = PUMP_STATES[state];
                                const alert = worstAlert(pump.pumpId);
                                const AlertIcon = alert && SEVERITY[alert.severity].icon;
                                const selected = pump.pumpId === selectedId;
                                return (
                                    <li key={pump.pumpId}>
                                        <button type="button" onClick={() => onSelect(pump.pumpId)} aria-current={selected ? "true" : undefined}
                                            className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                                                selected ? "bg-[#1A75BC]/10 dark:bg-[#5BC6E8]/15" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                            }`}>
                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fill}`}>
                                                <Icon className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{pump.pumpId}</span>
                                                <span className="block text-xs text-slate-500 dark:text-slate-400">{pump.model} · {label}</span>
                                            </span>
                                            {alert && (
                                                <AlertIcon className={`h-4 w-4 shrink-0 ${alert.severity === "critical" ? "text-[#d03b3b]" : "text-amber-500"}`}
                                                    aria-label={`Alerte ${SEVERITY[alert.severity].label.toLowerCase()}`} />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>
        </aside>
    );
}

// ---- right, top half: photo, asset data, actions ----

const Fact = ({ label, children }) => (
    <div>
        <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
);

function PumpPhoto({ model }) {
    const photo = pumpPhoto(model);
    if (photo) return <img src={photo} alt={`Pompe ${model}`} className="h-full w-full object-contain p-4" />;
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
            <Camera className="h-8 w-8" aria-hidden="true" />
            <span className="text-xs">Photo {model} à venir</span>
        </div>
    );
}

function PumpSummary({ pump, state, alerts, now, action, onAction, onNewOrder }) {
    const commissioned = new Date(`${pump.commissionedOn}T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return (
        <section className={`${paneClass} flex flex-col gap-5 p-5 lg:min-h-0 lg:flex-1`}>
            <div className="flex min-h-0 flex-1 flex-col gap-5 sm:flex-row">
                <div className="h-48 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-auto sm:w-1/3 sm:max-w-sm dark:bg-slate-900/50">
                    <PumpPhoto model={pump.model} />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{pump.pumpId}</h2>
                                <StateBadge state={state} />
                                {alerts.length > 0 && (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY[alerts[0].severity].style}`}>
                                        {alerts.length} {plural(alerts.length, "alerte")}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Pompe {pump.model} · {pump.siteName}</p>
                        </div>
                        <button type="button" onClick={onNewOrder}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1A75BC] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#0F2A49]">
                            <ClipboardPlus className="h-4 w-4 shrink-0" aria-hidden="true" /> Nouvel ordre de travail
                        </button>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-3">
                        <Fact label="Modèle">{pump.model}</Fact>
                        <Fact label="Site">{pump.siteName}</Fact>
                        <Fact label="N° de série">{pump.serial}</Fact>
                        <Fact label="Mise en service">{commissioned}</Fact>
                        <Fact label="Heures de marche">{Math.round(pump.runningHours).toLocaleString("fr-FR")} h</Fact>
                        <Fact label="Débit nominal">{NOMINAL_FLOW[pump.model].toLocaleString("fr-FR")} m³/h</Fact>
                        <Fact label="Dernière mesure">{ago(now - pump.ts)}</Fact>
                    </dl>
                </div>
            </div>

            <div role="tablist" aria-label="Actions sur la pompe" className="grid grid-cols-4 gap-2">
                {ACTIONS.map(({ key, label, icon: Icon }) => {
                    const active = action === key;
                    return (
                        <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={active} aria-controls="pump-panel"
                            onClick={() => onAction(key)}
                            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                                active
                                    ? "border-transparent bg-[#1A75BC] text-white shadow-sm"
                                    : "border-slate-200 text-slate-700 hover:border-[#1A75BC]/40 hover:bg-[#1A75BC]/5 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                            }`}>
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="hidden truncate sm:inline">{label}</span>
                            <span className="sr-only sm:hidden">{label}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

// ---- the page ----

const Pumps = () => {
    const fleet = useFleet();
    const [params, setParams] = useSearchParams();
    const [tasks, setTasks] = useState(null); // { orders, reviews }; null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const detailRef = useRef(null);
    const navigate = useNavigate();
    const issues = useAlertIssues();

    const site = params.get("site");
    const selectedId = params.get("pompe");
    const action = ACTIONS.some((a) => a.key === params.get("vue")) ? params.get("vue") : "mesures";
    const pump = fleet.pumps.find((p) => p.pumpId === selectedId);
    const now = fleet.updatedAt;

    // changes some keys of the URL, keeping the others; replace: the back button leaves the page
    const update = (changes) => setParams((current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
        return next;
    }, { replace: true });

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        let cancelled = false;
        const loadTasks = async () => {
            try {
                const [assigned, review] = await Promise.all([
                    apiClient.get("/api/v1/task/assigned"),
                    apiClient.get("/api/v1/task/review"),
                ]);
                if (cancelled) return;
                setLoadError(null);
                setTasks({ orders: assigned.data.tasks ?? [], reviews: review.data.tasks ?? [] });
            }
            catch (err) {
                console.log("Error while loading the pump's tasks", err);
                if (!cancelled) setLoadError(serverMessage(err, "Les ordres de travail n'ont pas pu être chargés. Vérifiez votre connexion et réessayez."));
            }
        };
        loadTasks();
        return () => { cancelled = true; };
    }, [attempt]);

    const select = (pumpId) => {
        update({ pompe: pumpId });
        // on a phone the detail is under the list
        if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    };

    const state = pump && effectiveState(pump, now);
    const pumpAlerts = pump ? fleet.alerts.filter((a) => a.pumpId === pump.pumpId) : [];

    return (
    <Layout active="pumps" full>
        {/* the header is 4rem and the page's padding 2 × 2rem: the two panes fill the rest of the screen */}
        <div className="flex flex-col gap-6 lg:h-[calc(100dvh-8rem)] lg:flex-row">
            <PumpList pumps={fleet.pumps} alerts={fleet.alerts} now={now} site={site}
                onSite={(code) => update({ site: code })} selectedId={selectedId} onSelect={select} />

            <div ref={detailRef} className="flex min-w-0 flex-1 scroll-mt-20 flex-col gap-6">
                {!pump ? (
                    <div className={`${paneClass} flex flex-1 flex-col items-center justify-center px-6 py-16 text-center`}>
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">
                            <Cpu className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">Sélectionnez une pompe</p>
                        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                            Sa fiche, ses mesures en direct, ses interventions et sa documentation s'affichent ici.
                        </p>
                    </div>
                ) : (
                    <>
                        <PumpSummary pump={pump} state={state} alerts={pumpAlerts} now={now}
                            action={action} onAction={(key) => update({ vue: key })}
                            onNewOrder={() => navigate(...newOrderRoute(pump.pumpId, pump.siteName, pumpAlerts[0]?.message,
                                pumpAlerts[0] && openIssueFor(issues, pumpAlerts[0].id)?.number))} />

                        <section id="pump-panel" role="tabpanel" aria-labelledby={`tab-${action}`}
                            className={`${paneClass} min-h-[24rem] overflow-y-auto p-5 lg:min-h-0 lg:flex-1`}>
                            {action === "mesures" && <MeasuresPanel pump={pump} state={state} />}
                            {action === "interventions" && (
                                <InterventionsPanel pump={pump} alerts={pumpAlerts} now={now} tasks={tasks}
                                    loadError={loadError} onRetry={() => setAttempt((n) => n + 1)} />
                            )}
                            {action === "historique" && <HistoryPanel key={pump.pumpId} pump={pump} />}
                            {action === "documentation" && <DocumentationPanel pump={pump} />}
                        </section>
                    </>
                )}
            </div>
        </div>
    </Layout>);
};

export default Pumps;
