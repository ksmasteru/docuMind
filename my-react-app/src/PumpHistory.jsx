// The pump page's Historique panel: every intervention made on the pump, newest first.
//
//   history ← GET /api/v1/task/equipment/{equipmentId}?page=0&size=20
//             { tasks: [{ id, title, taskType, priority, status, technicianEmail, createdAt,
//                         firstStartedAt, submittedAt, closedAt, workedSeconds, latestSubmissionId,
//                         statusReason, statusComment, submissionStatus? }],
//               page, totalPages, totalElements }
//             (TaskRepository.findByEquipmentIdOrderByCreatedAtDesc, one page at a time)
//
// When the request fails (the endpoint isn't there yet, the server is down…), the panel simply says
// there is no history for now.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "./apiClient";
import { PriorityBadge, SectionLabel } from "./managerUi";
import { TASK_TYPES, TASK_TYPE_LABEL, formatDay, formatWorked, humanize, localIso, plural } from "./managerUtils";

const PAGE_SIZE = 20;

// where an intervention ended up (TaskStatus); dot: the timeline's marker
const OUTCOME = {
    APPROVED:  { label: "Approuvée",         dot: "bg-[#0ca30c]", style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    SUBMITTED: { label: "Rapport à valider", dot: "bg-[#1A75BC]", style: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
    RETURNED:  { label: "À corriger",        dot: "bg-[#d03b3b]", style: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    REJECTED:  { label: "Rejetée",           dot: "bg-[#d03b3b]", style: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    CANCELED:  { label: "Annulée",           dot: "bg-slate-400", style: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
    DECLINED:  { label: "Refusée",           dot: "bg-slate-400", style: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
    ASSIGNED:  { label: "Assignée",          dot: "bg-slate-400", style: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
    STARTED:   { label: "En cours",          dot: "bg-[#fab219]", style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    BLOCKED:   { label: "Bloquée",           dot: "bg-[#ec835a]", style: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
};

const CONFORMITY = {
    CONFORME:     { label: "Conforme",     style: "text-emerald-700 dark:text-emerald-400" },
    NON_CONFORME: { label: "Non conforme", style: "font-medium text-red-700 dark:text-red-400" },
};

// the date an intervention is filed under: when it ended, else when it was last moved on
const dateOf = (task) => task.closedAt ?? task.submittedAt ?? task.firstStartedAt ?? task.createdAt;
const dayOf = (iso) => (iso ? formatDay(localIso(new Date(iso))) : "—");

// read-only: no taskId, so the report page shows no approve / return buttons
const reportLink = (task) => `/review/${task.latestSubmissionId}?${new URLSearchParams({ title: task.title ?? "" })}`;

function Entry({ task }) {
    const outcome = OUTCOME[task.status] ?? { label: humanize(task.status), dot: "bg-slate-400", style: "bg-slate-100 text-slate-600" };
    const conformity = CONFORMITY[task.submissionStatus];
    const when = dateOf(task);
    return (
        <li className="relative grid grid-cols-[5.5rem_1fr] gap-4 pb-5 last:pb-0">
            <p className="pt-0.5 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{when ? dayOf(when) : "En cours"}</p>
            <div className="relative border-l border-slate-200 pl-5 dark:border-slate-700">
                <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-800 ${outcome.dot}`} aria-hidden="true" />
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {task.taskType && (
                            <span className="rounded-full bg-[#1A75BC]/10 px-2 py-0.5 text-xs font-semibold text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">
                                {TASK_TYPE_LABEL[task.taskType] ?? task.taskType}
                            </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${outcome.style}`}>{outcome.label}</span>
                        {task.priority && <PriorityBadge priority={task.priority} />}
                    </div>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{task.technicianEmail ?? "—"}</span>
                    {task.workedSeconds > 0 && <span>Temps passé : {formatWorked(task.workedSeconds)}</span>}
                    {task.createdAt && <span>Assignée le {dayOf(task.createdAt)}</span>}
                    {!task.createdAt && task.dueDate && <span>Échéance : {dayOf(`${task.dueDate}T00:00:00`)}</span>}
                    {conformity && <span className={conformity.style}>{conformity.label}</span>}
                </p>
                {task.statusComment && (
                    <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs italic text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                        « {task.statusComment} »
                    </p>
                )}
                {task.latestSubmissionId && (
                    <Link to={reportLink(task)} className="mt-1.5 inline-block text-xs font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                        Voir le rapport →
                    </Link>
                )}
            </div>
        </li>
    );
}

// Rendered with key={pumpId}, so another pump starts from page 0.
export function HistoryPanel({ pump }) {
    const [page, setPage] = useState(0);
    const [history, setHistory] = useState(null); // { tasks, hasMore, total }; null = still loading
    const [type, setType] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const loadHistory = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/task/equipment/${encodeURIComponent(pump.pumpId)}`, { params: { page, size: PAGE_SIZE } });
                if (cancelled) return;
                setHistory((current) => ({
                    tasks: [...(page > 0 ? current?.tasks ?? [] : []), ...(data.tasks ?? [])],
                    hasMore: data.page + 1 < data.totalPages,
                    total: data.totalElements ?? data.tasks?.length ?? 0,
                }));
            }
            catch (err) {
                console.log("Error while fetching the pump's history", err);
                // whatever went wrong, the panel shows an empty history (pages already loaded stay)
                if (!cancelled) setHistory((current) => current ?? { tasks: [], hasMore: false, total: 0 });
            }
        };
        loadHistory();
        return () => { cancelled = true; };
    }, [pump.pumpId, page]);

    const all = history?.tasks;
    const shown = all?.filter((t) => !type || t.taskType === type);
    const approved = all?.filter((t) => t.status === "APPROVED").length ?? 0;
    const worked = all?.reduce((sum, t) => sum + (t.workedSeconds ?? 0), 0) ?? 0;
    const last = all?.map(dateOf).filter(Boolean).sort().at(-1);
    const total = history?.total ?? all?.length ?? 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <SectionLabel>Historique des interventions</SectionLabel>
                {all?.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {total} {plural(total, "intervention")} · {approved} {plural(approved, "approuvée")}
                        {worked > 0 && <> · {formatWorked(worked)} passées</>}
                        {last && <> · dernière le {dayOf(last)}</>}
                    </p>
                )}
            </div>

            {all?.length > 0 && (
                <div role="radiogroup" aria-label="Type d'intervention" className="flex flex-wrap gap-1.5">
                    {[{ value: null, label: "Toutes" }, ...TASK_TYPES].map(({ value, label }) => (
                        <button key={label} type="button" role="radio" aria-checked={type === value} onClick={() => setType(value)}
                            className={`rounded-full px-3 py-1 text-xs transition ${
                                type === value
                                    ? "bg-[#1A75BC]/10 font-semibold text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]"
                                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                            }`}>
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {!history && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>}
            {all && shown.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {all.length === 0 ? "Aucun historique pour le moment." : "Aucune intervention de ce type."}
                </p>
            )}
            {shown?.length > 0 && <ol className="pt-1">{shown.map((task) => <Entry key={task.id} task={task} />)}</ol>}

            {history?.hasMore && (
                <button type="button" onClick={() => setPage((p) => p + 1)}
                    className="w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                    Charger plus
                </button>
            )}
        </div>
    );
}
