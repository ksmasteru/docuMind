// The technician's active tasks (Mes tâches). A card opens the task's own page (TaskScreen.jsx):
// Détails · Ask · Rapport, where it is accepted or declined and its report filled in.
//
//   list ← GET /api/v1/task/mine   ({ tasks: [...], tasksCount })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { apiClient } from "./apiClient";
import { EmptyState, ErrorBanner, ListSkeleton, Notice, PageHeader, PriorityBadge } from "./managerUi";
import { byPriority, formatDay, serverMessage } from "./managerUtils";
import { TASK_STATUS } from "./workshopUtils";

const Tasks = () => {
    const notice = useLocation().state?.notice;
    const [tasks, setTasks] = useState(null); // null = still loading
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);

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

        <div className="mt-6">
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
                                <span>Équipement : {task.equipmentId}</span>
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
    </Layout>)
}

export default Tasks;
