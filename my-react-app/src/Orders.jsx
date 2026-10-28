// Work orders the signed-in manager assigned, still in progress on the technicians' side.
// The mobile app's Ordres tab.
//
//   list ← GET /api/v1/task/assigned   ({ tasks: [...], tasksCount }, each with technicianEmail)
//
// Open a card to read its instructions.
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";
import { EmptyState, ErrorBanner, ExpandableCard, GroupHeading, ListSkeleton, PageHeader, PriorityBadge, SectionLabel } from "./managerUi";
import { ORDER_STATUS, byPriority, formatDay, humanize, serverMessage } from "./managerUtils";

const Orders = () => {
    const [orders, setOrders] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [openId, setOpenId] = useState(null);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadOrders = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/task/assigned");
                setLoadError(null);
                setOrders([...(data.tasks ?? [])].sort(byPriority));
            }
            catch (err) {
                console.log("Error while fetching assigned tasks", err);
                setLoadError(serverMessage(err, "La liste n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setOrders([]);
            }
        };
        loadOrders();
    }, [attempt]);

    const onRetry = () => {
        setOrders(null);
        setAttempt((n) => n + 1);
    };

    const toggle = (id) => setOpenId((current) => current === id ? null : id);

    const loading = orders === null;

    return (
    <Layout active="orders">
        <PageHeader title="Ordres de travail" subtitle="Les tâches que vous avez assignées." />

        <div className="mt-6">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && orders.length === 0 && (
                <EmptyState icon="📋" title="Aucun ordre en cours"
                    hint="Assignez une tâche depuis la page Techniciens." />
            )}

            {!loading && orders.length > 0 && (
            <>
            <GroupHeading>Ordres actifs · {orders.length}</GroupHeading>
            <ul className="space-y-2">
                {orders.map((order) => {
                const status = ORDER_STATUS[order.status];
                return (
                <ExpandableCard
                    key={order.id}
                    isOpen={openId === order.id}
                    onToggle={() => toggle(order.id)}
                    summary={<>
                        <div className="flex items-start justify-between gap-3">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{order.title}</p>
                            <PriorityBadge priority={order.priority} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <span>Technicien : {order.technicianEmail ?? "—"}</span>
                            <span>Équipement : {order.equipmentId}</span>
                            <span>Échéance : {order.dueDate ? formatDay(order.dueDate) : "Sans échéance"}</span>
                            <span className={status?.style}>{status?.label ?? humanize(order.status)}</span>
                        </div>
                    </>}
                >
                    <SectionLabel>Instructions</SectionLabel>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
                        {order.instructions || "Aucune instruction."}
                    </p>
                </ExpandableCard>)
                })}
            </ul>
            </>
            )}
        </div>
    </Layout>)
}

export default Orders;
