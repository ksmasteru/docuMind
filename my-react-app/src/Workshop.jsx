// The workshop queue of the signed-in role: the interventions waiting at one of its steps, and the
// ones the user took. Every workshop role has one (WorkshopStep on the backend); Sales also starts a
// client's request from here.
//
//   list ← GET /api/v1/interventions/queue   ({ interventions: [...], interventionsCount })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { EmptyState, ErrorBanner, GroupHeading, ListSkeleton, Notice, PageHeader } from "./managerUi";
import { formatDateTime, serverMessage } from "./managerUtils";
import { STEP_STATUS, originLabel, stepLabel } from "./workshopUtils";

// urgent first, then the oldest (the server sends the oldest first)
const byUrgency = (a, b) => Number(b.urgent) - Number(a.urgent);

const Workshop = () => {
    const { user } = useAuth();
    const notice = useLocation().state?.notice;
    const [interventions, setInterventions] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadQueue = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/interventions/queue");
                setLoadError(null);
                setInterventions([...(data.interventions ?? [])].sort(byUrgency));
            }
            catch (err) {
                console.log("Error while fetching the workshop queue", err);
                setLoadError(serverMessage(err, "La liste n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setInterventions([]);
            }
        };
        loadQueue();
    }, [attempt]);

    const onRetry = () => {
        setInterventions(null);
        setAttempt((n) => n + 1);
    };

    const loading = interventions === null;
    // the queue only holds the ones nobody took and the user's own
    const waiting = loading ? [] : interventions.filter((i) => !i.stepAssignee);
    const mine = loading ? [] : interventions.filter((i) => i.stepAssignee);

    return (
    <Layout active="workshop">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeader title="Atelier" subtitle="Les demandes de réparation en atelier qui attendent votre étape." />
            {user?.role === "SALES" && (
                <Link to="/atelier/nouvelle"
                    className="flex items-center gap-2 rounded-lg bg-[#1A75BC] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#0F2A49]">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle demande
                </Link>
            )}
        </div>

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6 space-y-8">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && interventions.length === 0 && (
                <EmptyState icon="🔧" title="Aucune demande en attente"
                    hint={user?.role === "SALES"
                        ? "Les demandes d'un client que vous créez, et celles qu'un manager envoie depuis une alerte, arrivent ici."
                        : "Les demandes arrivent ici dès que l'étape précédente les valide."} />
            )}

            {mine.length > 0 && <QueueGroup title={`Mes dossiers · ${mine.length}`} interventions={mine} />}
            {waiting.length > 0 && <QueueGroup title={`À prendre en charge · ${waiting.length}`} interventions={waiting} />}
        </div>
    </Layout>)
}

const QueueGroup = ({ title, interventions }) => (
    <section>
        <GroupHeading>{title}</GroupHeading>
        <ul className="space-y-2">
            {interventions.map((intervention) => <QueueCard key={intervention.id} intervention={intervention} />)}
        </ul>
    </section>
);

const QueueCard = ({ intervention }) => {
    const status = STEP_STATUS[intervention.stepStatus];
    return (
    <li>
        <Link to={`/atelier/${intervention.id}`}
            className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500">
            <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                    {intervention.number} · {intervention.equipmentId}
                </p>
                <div className="flex shrink-0 gap-1.5">
                    {intervention.urgent && <UrgentBadge />}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status?.style}`}>{status?.label}</span>
                </div>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{intervention.fault}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                <span>{stepLabel(intervention.currentStep)}</span>
                <span>{originLabel(intervention)}</span>
                <span>Client : {intervention.client ?? "—"}</span>
                <span>Reçue le {formatDateTime(intervention.createdAt)}</span>
            </div>
        </Link>
    </li>)
};

export const UrgentBadge = () => (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
        Urgente
    </span>
);

export default Workshop;
