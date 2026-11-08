// The Suivi tab of the Chef de projet and the Workshop Lead: every intervention they worked on
// (a step taken or validated, a technician assigned), and where it is now. Their side of the
// manager's Ordres page.
//
//   list ← GET /api/v1/interventions/followed   ({ interventions: [...], interventionsCount, stepsCount })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "./apiClient";
import { EmptyState, ErrorBanner, GroupHeading, ListSkeleton, PageHeader } from "./managerUi";
import { formatDateTime, serverMessage } from "./managerUtils";
import { UrgentBadge } from "./Workshop";
import { INTERVENTION_STATUS, ROLE_LABEL, STEP_STATUS, TASK_STATUS, stepLabel } from "./workshopUtils";

const WorkshopFollowUp = () => {
    const [data, setData] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/interventions/followed");
                setLoadError(null);
                setData(data);
            }
            catch (err) {
                console.log("Error while fetching the followed interventions", err);
                setLoadError(serverMessage(err, "La liste n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setData({ interventions: [], stepsCount: 20 });
            }
        };
        load();
    }, [attempt]);

    const onRetry = () => {
        setData(null);
        setAttempt((n) => n + 1);
    };

    const loading = data === null;
    const all = loading ? [] : data.interventions ?? [];
    const open = all.filter((i) => i.status === "EN_COURS");
    const closed = all.filter((i) => i.status !== "EN_COURS");

    return (
    <Layout active="followup">
        <PageHeader title="Suivi" subtitle="Les interventions auxquelles vous avez participé, et où elles en sont." />

        <div className="mt-6 space-y-8">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && all.length === 0 && (
                <EmptyState icon="📈" title="Aucune intervention suivie"
                    hint="Dès que vous prenez en charge ou validez une étape dans l'Atelier, l'intervention apparaît ici." />
            )}

            {open.length > 0 && <FollowGroup title={`En cours · ${open.length}`} interventions={open} stepsCount={data.stepsCount} />}
            {closed.length > 0 && <FollowGroup title={`Clôturées · ${closed.length}`} interventions={closed} stepsCount={data.stepsCount} />}
        </div>
    </Layout>)
}

const FollowGroup = ({ title, interventions, stepsCount }) => (
    <section>
        <GroupHeading>{title}</GroupHeading>
        <ul className="space-y-2">
            {interventions.map((intervention) =>
                <FollowCard key={intervention.id} intervention={intervention} stepsCount={stepsCount} />)}
        </ul>
    </section>
);

const FollowCard = ({ intervention, stepsCount }) => {
    const running = intervention.status === "EN_COURS";
    const badge = running ? STEP_STATUS[intervention.stepStatus] : INTERVENTION_STATUS[intervention.status];
    const step = intervention.currentStep;
    // a finished intervention is on its last step: show the bar full
    const done = intervention.status === "TERMINEE" ? stepsCount : step.number - 1;
    const task = intervention.task;
    const taskStatus = task && TASK_STATUS[task.status];
    return (
    <li>
        <Link to={`/atelier/${intervention.id}`}
            className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500">
            <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                    {intervention.number} · {intervention.equipmentId}
                </p>
                <div className="flex shrink-0 gap-1.5">
                    {intervention.urgent && running && <UrgentBadge />}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge?.style}`}>{badge?.label}</span>
                </div>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-slate-700 dark:text-slate-200">{intervention.fault}</p>

            {/* progress: the steps already validated */}
            <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    role="progressbar" aria-valuemin={0} aria-valuemax={stepsCount} aria-valuenow={done}>
                    <div className={`h-full rounded-full ${intervention.status === "ANNULEE" ? "bg-red-400" : "bg-[#1A75BC] dark:bg-[#5BC6E8]"}`}
                        style={{ width: `${(done / stepsCount) * 100}%` }} />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{done} / {stepsCount}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                {running ? (
                    <>
                    <span className="text-slate-700 dark:text-slate-200">{stepLabel(step)}</span>
                    <span>{ROLE_LABEL[step.role] ?? step.role}{intervention.stepAssignee ? ` · ${intervention.stepAssignee}` : " · non prise en charge"}</span>
                    </>
                ) : (
                    <span>{intervention.status === "TERMINEE" ? "Terminée" : `Annulée à l'étape ${stepLabel(step)}`}
                        {intervention.closedAt && ` le ${formatDateTime(intervention.closedAt)}`}</span>
                )}
                <span>Mise à jour le {formatDateTime(intervention.updatedAt)}</span>
            </div>

            {task && running && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>Tâche « {task.title} » · {task.technicianEmail}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${taskStatus?.style}`}>{taskStatus?.label ?? task.status}</span>
                </p>
            )}
        </Link>
    </li>)
};

export default WorkshopFollowUp;
