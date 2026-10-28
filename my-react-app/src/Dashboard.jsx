// The manager's home page: the fleet from the digital twin (simulated for now) beside the
// maintenance work in GreenSense.
//
//   orders      ← GET /api/v1/task/assigned       (same as the Orders page)
//   reviews     ← GET /api/v1/task/review         (same as the Review page)
//   technicians ← GET /api/v1/users/technicians   (names for the workload chart; optional)
//   fleet       ← useFleet()                      (fleetSimulator.js, until the twin streams)
//
// The maintenance data reloads every minute; the fleet updates on each twin tick.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BellRing, ClipboardList, ShieldCheck } from "lucide-react";
import Layout from "./Layout";
import { apiClient } from "./apiClient";
import { useFleet } from "./fleetSimulator";
import { AlertsCard, FleetStatusCard, FlowTrendCard } from "./FleetCards";
import { OrdersCard, ReviewCard, WorkloadCard } from "./MaintenanceCards";
import { ErrorBanner, SimulatedBadge } from "./managerUi";
import { ago, isOverdue, plural, serverMessage } from "./managerUtils";
import banner from "./assets/dark_mode_phova _banner.png";

const REFRESH_MS = 60 * 1000;

const greeting = (hour) => (hour < 18 ? "Bonjour" : "Bonsoir");

function Welcome({ updatedAt }) {
    const now = new Date();
    return (
        <section className="relative overflow-hidden rounded-2xl bg-[#0F2A49] bg-cover bg-center"
            style={{ backgroundImage: `url("${banner}")` }}>
            <div className="absolute inset-0 bg-linear-to-r from-[#0F2A49] via-[#0F2A49]/85 to-[#0F2A49]/10" aria-hidden="true" />
            <div className="relative flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[#5BC6E8]">
                        {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold text-white">{greeting(now.getHours())}</h1>
                    <p className="mt-1 text-sm text-slate-300">Vos pompes et votre équipe, en un coup d'œil.</p>
                </div>
                <p className="flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200 backdrop-blur sm:self-auto">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ca30c] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0ca30c]" />
                    </span>
                    En direct · mis à jour à {new Date(updatedAt).toLocaleTimeString("fr-FR")}
                </p>
            </div>
        </section>
    );
}

function StatTile({ to, icon: Icon, label, value, hint, simulated }) {
    return (
        <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#1A75BC]/40 hover:shadow dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#5BC6E8]/40">
            <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                {simulated && <SimulatedBadge />}
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value ?? "—"}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </Link>
    );
}

const Dashboard = () => {
    const fleet = useFleet();
    const [data, setData] = useState(null); // { orders, reviews, technicians }; null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const { hash } = useLocation();

    // attempt: bumped by Retry to run this again; a failed refresh keeps the last data on screen
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [assigned, review, technicians] = await Promise.all([
                    apiClient.get("/api/v1/task/assigned"),
                    apiClient.get("/api/v1/task/review"),
                    apiClient.get("/api/v1/users/technicians").catch(() => null), // names only, the chart falls back to emails
                ]);
                if (cancelled) return;
                setLoadError(null);
                setData({
                    orders: assigned.data.tasks ?? [],
                    reviews: review.data.tasks ?? [],
                    technicians: technicians?.data.technicianInfo ?? [],
                });
            }
            catch (err) {
                console.log("Error while loading the dashboard", err);
                if (!cancelled) setLoadError(serverMessage(err, "Les ordres de travail n'ont pas pu être chargés. Vérifiez votre connexion et réessayez."));
            }
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [attempt]);

    // the header's bell links to #alerts
    useEffect(() => {
        if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    }, [hash]);

    const orders = data?.orders;
    const reviews = data?.reviews;
    const names = new Map((data?.technicians ?? []).map((t) => [t.email, t.name]));
    const critical = fleet.alerts.filter((a) => a.severity === "critical").length;
    const blocked = orders?.filter((o) => o.status === "BLOCKED").length ?? 0;
    const overdue = orders?.filter(isOverdue).length ?? 0;
    const oldestReview = reviews?.[0]?.submittedAt; // the server sends the oldest first

    return (
    <Layout active="dashboard" full>
        <div className="space-y-6">
            <Welcome updatedAt={fleet.updatedAt} />

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile to="#fleet" icon={Activity} label="Pompes en marche" simulated
                    value={`${fleet.counts.RUNNING} / ${fleet.pumps.length}`}
                    hint={`${fleet.counts.STANDBY} en réserve, ${fleet.counts.FAULT} en défaut`} />
                <StatTile to="#alerts" icon={BellRing} label="Alertes en direct" simulated
                    value={fleet.alerts.length} hint={critical ? `${critical} ${plural(critical, "critique")}` : "Aucune critique"} />
                <StatTile to="/orders" icon={ClipboardList} label="Ordres de travail ouverts"
                    value={orders?.length} hint={orders ? `${blocked} ${plural(blocked, "bloqué")}, ${overdue} en retard` : "Chargement…"} />
                <StatTile to="/review" icon={ShieldCheck} label="Rapports à valider"
                    value={reviews?.length}
                    hint={!reviews ? "Chargement…" : oldestReview ? `Le plus ancien envoyé ${ago(fleet.updatedAt - new Date(oldestReview))}` : "Vous êtes à jour"} />
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
                <div id="fleet" className="scroll-mt-24 lg:col-span-8">
                    <FleetStatusCard fleet={fleet} className="h-full" />
                </div>
                {/* on large screens the alerts take the fleet panel's height and scroll inside it */}
                <div className="relative min-h-[420px] lg:col-span-4">
                    <AlertsCard fleet={fleet} className="lg:absolute lg:inset-0" />
                </div>
            </div>

            {loadError && <ErrorBanner message={loadError} onRetry={() => setAttempt((n) => n + 1)} />}

            <div className="grid gap-6 lg:grid-cols-12">
                <FlowTrendCard fleet={fleet} className="lg:col-span-8" />
                <OrdersCard orders={orders} names={names} className="lg:col-span-4" />
                <WorkloadCard orders={orders} technicians={data?.technicians} names={names} className="lg:col-span-7" />
                <ReviewCard reviews={reviews} names={names} now={fleet.updatedAt} className="lg:col-span-5" />
            </div>
        </div>
    </Layout>);
};

export default Dashboard;
