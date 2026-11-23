// Reports waiting for the signed-in manager's review: their tasks a technician has submitted.
// The mobile app's Revue tab.
//
//   list ← GET /api/v1/task/review              ({ tasks: [...], tasksCount }: each task joined to its latest report)
//        ← GET /api/v1/task/review?scope=all    « Tous les rapports »: every manager's, each with whose task it
//                                               is. Any manager may validate one when its sender is away; the
//                                               validation is recorded under his own name
//
// An opened card leads to the report page (ReviewReport.jsx), where the manager reads the
// answers and approves or returns the task. A decided task is no longer SUBMITTED, so it's
// gone when this page loads again.
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { EmptyState, ErrorBanner, ExpandableCard, GroupHeading, ListSkeleton, Notice, PageHeader, PriorityBadge, SectionLabel } from "./managerUi";
import { TASK_TYPE_LABEL, formatDateTime, formatDay, formatWorked, localIso, serverMessage } from "./managerUtils";

// the report's verdict, decided by the server: NON_CONFORME when a critical point is MAUVAIS
const CONFORMITY = {
    CONFORME:     { label: "Conforme",      style: "font-medium text-emerald-700 dark:text-emerald-400" },
    NON_CONFORME: { label: "Non conforme",  style: "font-medium text-red-700 dark:text-red-400" },
};

// sent after the day it was due
const isLate = (task) =>
    Boolean(task.dueDate && task.submittedAt && localIso(new Date(task.submittedAt)) > task.dueDate);

const Review = () => {
    const { user } = useAuth();
    const [reviews, setReviews] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [openId, setOpenId] = useState(null);
    const notice = useLocation().state?.notice;
    // ?vue=tous: every manager's waiting reports
    const [params, setParams] = useSearchParams();
    // the super admin has no reports of his own to review: always every manager's
    const all = params.get("vue") === "tous" || user?.role === "ADMIN";
    const show = (everyone) => { setReviews(null); setParams(everyone ? { vue: "tous" } : {}, { replace: true }); };

    // the server already sorts them oldest submission first, the order to review them in
    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadReviews = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/task/review", { params: all ? { scope: "all" } : {} });
                setLoadError(null);
                setReviews(data.tasks ?? []);
            }
            catch (err) {
                console.log("Error while fetching tasks to review", err);
                setLoadError(serverMessage(err, "La liste n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setReviews([]);
            }
        };
        loadReviews();
    }, [attempt, all]);

    const onRetry = () => {
        setReviews(null);
        setAttempt((n) => n + 1);
    };

    const toggle = (id) => setOpenId((current) => current === id ? null : id);

    const loading = reviews === null;

    return (
    <Layout active="review">
        <PageHeader title="Rapports à valider" subtitle={all
            ? "Les rapports en attente de tous les managers. Vous pouvez en valider un quand son manager est absent : la validation est enregistrée à votre nom."
            : "Les tâches terminées par vos techniciens."} />

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm dark:border-slate-700" role="group" aria-label="Rapports affichés">
            {[[false, "Mes rapports"], [true, "Tous les rapports"]].map(([everyone, label]) => (
                <button key={label} type="button" onClick={() => show(everyone)} aria-pressed={all === everyone}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${all === everyone
                        ? "bg-[#1A75BC] text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}>
                    {label}
                </button>
            ))}
        </div>

        <div className="mt-6">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && reviews.length === 0 && (
                <EmptyState icon="✅" title="Aucun rapport à valider"
                    hint={all ? "Aucun rapport n'attend de validation." : "Les rapports envoyés par vos techniciens apparaissent ici."} />
            )}

            {!loading && reviews.length > 0 && (
            <>
            <GroupHeading>En attente · {reviews.length}</GroupHeading>
            <ul className="space-y-2">
                {reviews.map((task) => {
                const conformity = CONFORMITY[task.submissionStatus];
                const late = isLate(task);
                return (
                <ExpandableCard
                    key={task.taskId}
                    isOpen={openId === task.taskId}
                    onToggle={() => toggle(task.taskId)}
                    tone={task.submissionStatus === "NON_CONFORME" ? "border-l-4 border-l-red-500" : ""}
                    summary={<>
                        <div className="flex items-start justify-between gap-3">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                            <PriorityBadge priority={task.priority} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <span className={conformity?.style}>{conformity?.label ?? "Rapport introuvable"}</span>
                            <span>Technicien : {task.technicianName ?? task.technicianEmail ?? "—"}</span>
                            {all && <span>Tâche de : {task.managerName ?? task.managerEmail ?? "—"}</span>}
                            {task.equipmentId && <span>Équipement : {task.equipmentId}</span>}
                            <span className={late ? "text-orange-700 dark:text-orange-400" : ""}>
                                Envoyé : {formatDateTime(task.submittedAt)}
                            </span>
                            {late && <span className="font-medium text-orange-700 dark:text-orange-400">En retard</span>}
                        </div>
                    </>}
                >
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Fact label="Rapport" value={task.templateTitle ?? "—"} />
                        <Fact label="Type" value={TASK_TYPE_LABEL[task.taskType] ?? task.taskType ?? "—"} />
                        <Fact label="Assignée le" value={formatDateTime(task.assignedAt)} />
                        <Fact label="Échéance" value={task.dueDate ? formatDay(task.dueDate) : "Sans échéance"} />
                        <Fact label="Intervention" value={formatDay(task.inspectionDate)} />
                        <Fact label="Temps passé" value={formatWorked(task.workedSeconds)} />
                    </dl>

                    <SectionLabel className="mt-4">Instructions</SectionLabel>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
                        {task.instructions || "Aucune instruction."}
                    </p>

                    <OpenReport task={task} />
                </ExpandableCard>)
                })}
            </ul>
            </>
            )}
        </div>
    </Layout>)
}

// one label / value pair of the opened card, two per row
const Fact = ({ label, value }) => (
    <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
);

// Opens the report page. A task submitted before it kept its report's id has none.
const OpenReport = ({ task }) => {
    if (!task.submissionId)
        return <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Le rapport de cette tâche n'est pas disponible.</p>;

    const params = new URLSearchParams({ taskId: task.taskId, title: task.title ?? "" });
    return (
        <div className="mt-4 flex justify-end">
            <Link to={`/review/${task.submissionId}?${params}`}
                className="rounded-lg bg-[#1A75BC] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#0F2A49]">
                Voir le rapport →
            </Link>
        </div>
    );
};

export default Review;
