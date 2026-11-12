// The manager's home page, as a control console: the fleet from the digital twin (simulated for
// now) beside the maintenance work in GreenSense. Its parts are in src/dashboard/.
//
//   orders      ← GET /api/v1/task/assigned       (same as the Orders page)
//   reviews     ← GET /api/v1/task/review         (same as the Review page)
//   technicians ← GET /api/v1/users/technicians   (names for the workload panel; optional)
//   fleet       ← useFleet()                      (fleetSimulator.js, until the twin streams)
//
// The maintenance data reloads every minute; the fleet updates on each twin tick (5 s). A new
// alert, or one that turns critical, also shows as a toast.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "./Layout";
import { apiClient } from "./apiClient";
import { useFleet } from "./fleetSimulator";
import { openIssueFor, useAlertIssues } from "./alertStore";
import { newOrderRoute, serverMessage } from "./managerUtils";
import { ConsoleHeader, KpiRail } from "./dashboard/Overview";
import { FleetPanel } from "./dashboard/FleetTable";
import { AlertsPanel } from "./dashboard/AlertStream";
import { FlowPanel } from "./dashboard/FlowPanel";
import { OrdersPanel, ReviewPanel, WorkloadPanel } from "./dashboard/MaintenancePanels";
import { PumpSheet } from "./dashboard/PumpSheet";
import { SEVERITY } from "./dashboard/tokens";

const REFRESH_MS = 60 * 1000;

// toasts the alerts that appear, and the ones that turn critical, after the page opened; the ones
// already on when it opened are in the alerts panel. onShow opens the pump.
function useAlertToasts(alerts, onShow) {
    const seen = useRef(null);
    useEffect(() => {
        const before = seen.current;
        seen.current = new Map(alerts.map((a) => [a.id, a.severity]));
        if (!before) return;
        for (const alert of alerts) {
            const was = before.get(alert.id);
            const escalated = was === "warning" && alert.severity === "critical";
            if (was && !escalated) continue;
            const notify = alert.severity === "critical" ? toast.error : toast.warning;
            notify(`${alert.pumpId} · ${escalated ? "passe en critique" : SEVERITY[alert.severity].label.toLowerCase()}`, {
                id: alert.id, // the same alert replaces its toast instead of stacking a second one
                description: `${alert.message} (${alert.site})`,
                duration: alert.severity === "critical" ? 12000 : 8000,
                action: { label: "Voir", onClick: () => onShow(alert.pumpId) },
            });
        }
    }, [alerts, onShow]);
}

const Dashboard = () => {
    const fleet = useFleet();
    const issues = useAlertIssues();
    const navigate = useNavigate();
    const { hash } = useLocation();
    const [data, setData] = useState(null); // { orders, reviews, technicians, loadedAt }; null = still loading
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [selectedId, setSelectedId] = useState(null);
    const failing = useRef(false);

    useAlertToasts(fleet.alerts, setSelectedId);

    // attempt: bumped by Retry to run this again; a failed refresh keeps the last data on screen
    useEffect(() => {
        let cancelled = false;
        const retry = () => setAttempt((n) => n + 1);
        const load = async () => {
            try {
                const [assigned, review, technicians] = await Promise.all([
                    apiClient.get("/api/v1/task/assigned"),
                    apiClient.get("/api/v1/task/review"),
                    apiClient.get("/api/v1/users/technicians").catch(() => null), // names only, the panels fall back to emails
                ]);
                if (cancelled) return;
                setLoadError(null);
                setData({
                    orders: assigned.data.tasks ?? [],
                    reviews: review.data.tasks ?? [],
                    technicians: technicians?.data.technicianInfo ?? [],
                    loadedAt: Date.now(),
                });
                if (failing.current) toast.success("Données de maintenance à jour", { id: "maintenance-load" });
                failing.current = false;
            }
            catch (err) {
                console.log("Error while loading the dashboard", err);
                if (cancelled) return;
                const message = serverMessage(err, "Les données de maintenance n'ont pas pu être chargées. Vérifiez votre connexion et réessayez.");
                setLoadError(message);
                // once per failure, not on every minute it keeps failing
                if (!failing.current) {
                    toast.error("Maintenance indisponible", {
                        id: "maintenance-load", description: message, duration: 10000,
                        action: { label: "Réessayer", onClick: retry },
                    });
                }
                failing.current = true;
            }
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [attempt]);

    // the header's bell links to #alerts, the readouts to #fleet and #flow
    useEffect(() => {
        if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [hash]);

    const names = new Map((data?.technicians ?? []).map((t) => [t.email, t.name]));
    const maintenance = {
        data: data ?? undefined,
        error: loadError,
        stale: Boolean(loadError && data),
        loadedAt: data?.loadedAt,
        onRetry: () => setAttempt((n) => n + 1),
    };

    // the manager turns an alert (or a pump) into a work order, linked to the alert's case
    const createOrder = (pumpId, site, reason, alertId) => {
        const issue = alertId ? openIssueFor(issues, alertId) : issues.find((i) => i.pumpId === pumpId && i.status !== "RESOLVED");
        navigate(...newOrderRoute(pumpId, site, reason, issue?.number));
    };

    return (
        <Layout active="dashboard" full>
            <TooltipProvider delayDuration={250}>
                <div className="overflow-hidden rounded-md border border-border bg-background font-ui text-foreground">
                    <ConsoleHeader updatedAt={fleet.updatedAt} simulated={fleet.simulated} />
                    <KpiRail fleet={fleet} orders={data?.orders} reviews={data?.reviews} failed={Boolean(loadError && !data)} />

                    {/* the 1px gaps of the grid show its border-colored background: one hairline between neighbours.
                        On a phone the alerts come before the 24 rows of the fleet. */}
                    <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-12">
                        <FleetPanel fleet={fleet} selectedId={selectedId} onSelect={setSelectedId}
                            className="md:col-span-2 xl:col-span-8" style={{ "--i": 8 }} />
                        <AlertsPanel fleet={fleet} issues={issues} onSelect={setSelectedId}
                            onCreateOrder={(alert) => createOrder(alert.pumpId, alert.site, alert.message, alert.id)}
                            className="min-h-[320px] max-md:order-first md:col-span-2 xl:col-span-4" style={{ "--i": 9 }} />
                        <FlowPanel fleet={fleet} className="md:col-span-2 xl:col-span-7" style={{ "--i": 10 }} />
                        <OrdersPanel state={maintenance} names={names} className="xl:col-span-5" style={{ "--i": 11 }} />
                        <WorkloadPanel state={maintenance} names={names} className="xl:col-span-5" style={{ "--i": 12 }} />
                        <ReviewPanel state={maintenance} names={names} now={fleet.updatedAt}
                            className="md:col-span-2 xl:col-span-7" style={{ "--i": 13 }} />
                    </div>
                </div>

                <PumpSheet fleet={fleet} pumpId={selectedId} onClose={() => setSelectedId(null)}
                    onCreateOrder={(pumpId, site, reason) => createOrder(pumpId, site, reason)} />
                <Toaster position="bottom-right" visibleToasts={4} />
            </TooltipProvider>
        </Layout>
    );
};

export default Dashboard;
