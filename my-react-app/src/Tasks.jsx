// The technician's tasks (Mes tâches), in two lists:
//   En cours  his active tasks. A card opens the task's own page (TaskScreen.jsx): Détails · Ask · Rapport,
//             where it is accepted or declined and its report filled in.
//   Envoyés   the reports he sent and what became of them: waiting for their review, or validated (by whom,
//             when, and what is done about a non-conformity). A card opens the report, read-only, with its
//             history; a check (levée de doute) gives its PDF.
//
//   list ← GET /api/v1/task/mine        ({ tasks: [...], tasksCount })
//   sent ← GET /api/v1/task/mine/sent   ([{ id, title, status, submittedAt, closedAt, reviewerName, followUp,
//                                          submissionId, submissionStatus, taskType, alertNumber }])
//   /tasks?vue=envoyes · a sent report: /tasks/rapport/:submissionId (MySentReport below)
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { apiClient } from "./apiClient";
import { CheckPdfButton } from "./CheckReportParts";
import { EmptyState, ErrorBanner, ListSkeleton, Notice, PageHeader, PriorityBadge } from "./managerUi";
import { byPriority, formatDateTime, formatDay, serverMessage } from "./managerUtils";
import { ReportView } from "./ReviewReport";
import { TASK_STATUS } from "./workshopUtils";

const cardClass = "flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition dark:border-slate-700 dark:bg-slate-800";

// what became of a sent report
const OUTCOME = {
    SUBMITTED: { label: "En attente de validation", style: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
    APPROVED:  { label: "Validé", style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

function SentList() {
    const [sent, setSent] = useState(null); // null = still loading
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        let cancelled = false;
        apiClient.get("/api/v1/task/mine/sent")
            .then(({ data }) => { if (!cancelled) { setSent(data ?? []); setLoadError(null); } })
            .catch((err) => {
                console.log("Error while fetching the sent reports", err);
                if (!cancelled) { setLoadError(serverMessage(err, "Vos rapports envoyés n'ont pas pu être chargés. Vérifiez votre connexion et réessayez.")); setSent([]); }
            });
        return () => { cancelled = true; };
    }, [attempt]);

    if (sent === null) return <ListSkeleton />;
    if (loadError) return <ErrorBanner message={loadError} onRetry={() => { setSent(null); setAttempt((n) => n + 1); }} />;
    if (sent.length === 0)
        return <EmptyState icon="📄" title="Aucun rapport envoyé" hint="Vos rapports envoyés s'affichent ici, avec leur validation." />;

    return (
        <ul className="space-y-2">
            {sent.map((task) => {
                const outcome = OUTCOME[task.status] ?? { label: task.status, style: "bg-slate-100 text-slate-600" };
                const check = task.taskType === "VERIFICATION";
                const body = (
                    <div className="min-w-0 flex-1">
                        <h2 className="font-medium text-slate-900 dark:text-slate-100">{task.title}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${outcome.style}`}>
                                {outcome.label}{task.status === "APPROVED" && task.reviewerName ? ` par ${task.reviewerName}` : ""}
                            </span>
                            {task.equipmentId && <span>Équipement : {task.equipmentId}</span>}
                            <span>Envoyé : {task.submittedAt ? formatDateTime(task.submittedAt) : "—"}</span>
                            {task.closedAt && <span>Validé : {formatDateTime(task.closedAt)}</span>}
                            {task.submissionStatus === "NON_CONFORME" && <span className="font-medium text-red-700 dark:text-red-400">Non conforme</span>}
                        </div>
                        {task.followUp && <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200"><span className="font-medium">Suite donnée :</span> {task.followUp}</p>}
                    </div>
                );
                return (
                    <li key={task.id}>
                        {task.submissionId ? (
                            <Link to={`/tasks/rapport/${task.submissionId}`} className={`${cardClass} hover:border-slate-400 dark:hover:border-slate-500`}>
                                {body}
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                            </Link>
                        ) : (
                            <div className={cardClass}>
                                {body}
                                {/* a check's report is on its alert, which he may no longer see once closed: its PDF */}
                                {check && <CheckPdfButton taskId={task.id} />}
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

// one of his sent reports, read-only: the answers, what became of it and the task's history
export function MySentReport() {
    const { submissionId } = useParams();
    return (
        <Layout active="tasks">
            <Link to="/tasks?vue=envoyes" className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                ← Mes rapports envoyés
            </Link>
            <div className="mt-4">
                <ReportView submissionId={submissionId}>{() => null}</ReportView>
            </div>
        </Layout>
    );
}

const Tasks = () => {
    const notice = useLocation().state?.notice;
    const [tasks, setTasks] = useState(null); // null = still loading
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [params, setParams] = useSearchParams();
    const sentView = params.get("vue") === "envoyes";

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const fetchMyTasks = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/task/mine");
                setLoadError(null);
                setTasks([...(data.tasks ?? [])].sort(byPriority));
            }
            catch (err) {
                console.log("Error while fetching tasks", err);
                setLoadError(serverMessage(err, "Les tâches n'ont pas pu être chargées. Vérifiez votre connexion et réessayez."));
                setTasks([]);
            }
        };
        fetchMyTasks();
    }, [attempt]);

    const onRetry = () => {
        setTasks(null);
        setAttempt((n) => n + 1);
    };

    const loading = tasks === null;

    return (
    <Layout active="tasks">
        <PageHeader title="Mes tâches" subtitle="Ouvrez une tâche pour l'accepter, poser une question ou remplir son rapport." />

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm dark:border-slate-700" role="group" aria-label="Tâches affichées">
            {[[false, "En cours"], [true, "Envoyés"]].map(([sent, label]) => (
                <button key={label} type="button" onClick={() => setParams(sent ? { vue: "envoyes" } : {}, { replace: true })} aria-pressed={sentView === sent}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${sentView === sent
                        ? "bg-[#1A75BC] text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}>
                    {label}{!sent && tasks?.length ? ` · ${tasks.length}` : ""}
                </button>
            ))}
        </div>

        {sentView ? <div className="mt-4"><SentList /></div> : (
        <div className="mt-4">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && tasks.length === 0 && (
                <EmptyState icon="🧰" title="Aucune tâche en cours" hint="Les tâches que l'on vous assigne arrivent ici." />
            )}

            {!loading && tasks.length > 0 && (
            <ul className="space-y-2">
                {tasks.map((task) => {
                const status = TASK_STATUS[task.status];
                return (
                <li key={task.id}>
                    <Link to={`/tasks/${task.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="font-medium text-slate-900 dark:text-slate-100">{task.title}</h2>
                                <PriorityBadge priority={task.priority} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                {task.equipmentId && <span>Équipement : {task.equipmentId}</span>}
                                {task.location && <span>Emplacement : {task.location}</span>}
                                <span>Échéance : {task.dueDate ? formatDay(task.dueDate) : "Sans échéance"}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status?.style}`}>{status?.label ?? task.status}</span>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </Link>
                </li>)
                })}
            </ul>
            )}
        </div>
        )}
    </Layout>)
}

export default Tasks;
