// One task, the web side of the mobile app's task screen: three tabs, Détails · Ask · Rapport.
// On a phone the tabs sit in a bar at the bottom and the site's top bar is hidden; from md up
// the top bar is back and the tabs sit under the task's header.
//
//   task    ← GET  /api/v1/task/mine               (the active tasks; this one is found by id)
//   accept  → POST /api/v1/task/:id/start          (ASSIGNED → STARTED)
//   decline → POST /api/v1/task/:id/decline        ({ reason, comment })
//   resume  → POST /api/v1/task/:id/start          (BLOCKED / RETURNED → STARTED: back to work, or to correct the report)
//   report  → ReportForm with taskId               (POST /api/v1/submissions marks the task SUBMITTED)
//   ask     → AskChat                              (not linked to the task yet, no sources yet)
//
// The three tabs stay mounted: switching tabs keeps the conversation and the report's answers.
// While a phone's keyboard is open the bottom bar steps aside and the field typed in stays in view
// (keepFocusVisible.js).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ClipboardCheck, Info, MessageSquareText, Timer, Wrench } from "lucide-react";
import { TopBar } from "./Layout";
import AskChat from "./AskChat";
import ReportForm from "./ReportForm";
import { apiClient } from "./apiClient";
import { ErrorBanner, ListSkeleton, PriorityBadge } from "./managerUi";
import { buttonBase, formatDay, serverMessage } from "./managerUtils";
import { TASK_STATUS } from "./workshopUtils";

const TABS = [
    { key: "details", label: "Détails", icon: Info },
    { key: "ask",     label: "Ask",     icon: MessageSquareText },
    { key: "rapport", label: "Rapport", icon: ClipboardCheck },
];

// StatusReason values meant for decline
const DECLINE_REASONS = [
    { value: "ON_LEAVE",       label: "En congé" },
    { value: "WRONG_TASK",     label: "Tâche erronée" },
    { value: "NO_ISSUE_FOUND", label: "Aucun problème constaté" },
];

// 42 → "0:42", 3725 → "1:02:05"
const formatElapsed = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const TaskScreen = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tab = TABS.some((t) => t.key === params.get("onglet")) ? params.get("onglet") : "details";
    const openTab = (key) => setParams(key === "details" ? {} : { onglet: key }, { replace: true });

    const [task, setTask] = useState(null);      // null = still loading
    const [missing, setMissing] = useState(false); // not among the active tasks
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/task/mine");
                const found = (data.tasks ?? []).find((t) => t.id === id);
                setLoadError(null);
                setMissing(!found);
                setTask(found ?? null);
            }
            catch (err) {
                console.log("Error while fetching the task", err);
                setLoadError(serverMessage(err, "La tâche n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
            }
        };
        load();
    }, [id, attempt]);

    const retry = () => {
        setLoadError(null);
        setAttempt((n) => n + 1);
    };

    const elapsed = useElapsed(task);

    // accepted, or resumed after a block / a returned report
    const accepted = () => setTask((t) => ({ ...t, status: "STARTED", statusComment: null, activeSince: new Date().toISOString() }));
    const declined = () => navigate("/tasks", { state: { notice: `« ${task.title} » a été refusée.` } });
    // the report is sent: the timer stops, the task is done on the technician's side
    const submitted = () => setTask((t) => ({
        ...t, status: "SUBMITTED",
        workedSeconds: elapsed, activeSince: null,
    }));

    const backLink = (
        <Link to="/tasks" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Mes tâches
        </Link>
    );

    if (task === null) {
        return (
        <Frame>
            <div className="mx-auto w-full max-w-2xl px-4 py-6">
                {backLink}
                <div className="mt-4">
                    {loadError ? <ErrorBanner message={loadError} onRetry={retry} />
                    : missing ? (
                        <p className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Cette tâche n'est plus dans vos tâches actives : son rapport a été envoyé, ou elle a été refusée ou annulée.
                        </p>
                    ) : <ListSkeleton />}
                </div>
            </div>
        </Frame>)
    }

    const status = TASK_STATUS[task.status];

    return (
    <Frame>
        {/* the task's header, always on screen */}
        <header className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="mx-auto w-full max-w-6xl px-4 pt-3">
                {backLink}
                <h1 className="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{task.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 pb-3 md:pb-0">
                    <Chip><Wrench className="h-3.5 w-3.5" aria-hidden="true" /> {task.equipmentId}</Chip>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status?.style}`}>{status?.label ?? task.status}</span>
                    {(task.status === "STARTED" || elapsed > 0) && (
                        <Chip><Timer className="h-3.5 w-3.5" aria-hidden="true" /> <span className="tabular-nums">{formatElapsed(elapsed)}</span></Chip>
                    )}
                    <PriorityBadge priority={task.priority} />
                </div>

                {/* md and up: the tabs under the header */}
                <nav className="-mb-px mt-3 hidden gap-6 md:flex" aria-label="Onglets de la tâche">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button key={key} type="button" onClick={() => openTab(key)} aria-current={tab === key ? "page" : undefined}
                            className={`flex items-center gap-2 border-b-2 pb-2.5 text-sm transition ${
                                tab === key
                                    ? "border-[#1A75BC] font-medium text-slate-900 dark:border-[#5BC6E8] dark:text-slate-100"
                                    : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                            }`}>
                            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                        </button>
                    ))}
                </nav>
            </div>
        </header>

        {/* the tab's content; the chat fills the height, the others scroll */}
        <div className="relative min-h-0 flex-1">
            <section hidden={tab !== "details"} className="h-full overflow-y-auto" data-keyboard-room>
                <div className="mx-auto w-full max-w-2xl px-4 py-5">
                    <DetailsTab task={task} onAccepted={accepted} onDeclined={declined} onOpenReport={() => openTab("rapport")} />
                </div>
            </section>

            <section hidden={tab !== "ask"} className="h-full bg-white dark:bg-slate-900">
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
                    <p className="mx-4 mt-3 flex shrink-0 items-center gap-1.5 self-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                        Réponses tirées de la documentation
                    </p>
                    <div className="min-h-0 flex-1">
                        <AskChat compact dictation
                            emptyTitle={`Une question sur ${task.equipmentId} ?`}
                            emptyHint="Écrivez-la ou dictez-la, en langage courant."
                            placeholder="Votre question…" />
                    </div>
                </div>
            </section>

            <section hidden={tab !== "rapport"} className="h-full overflow-y-auto" data-keyboard-room>
                <div className="mx-auto w-full max-w-6xl px-4 py-5">
                    <ReportTab task={task} onSubmitted={submitted} onAccept={() => openTab("details")} />
                </div>
            </section>
        </div>

        {/* phone: the tabs at the bottom, like the mobile app */}
        <nav className="shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-700 dark:bg-slate-800"
            aria-label="Onglets de la tâche" data-hide-on-keyboard>
            <div className="grid grid-cols-3">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button key={key} type="button" onClick={() => openTab(key)} aria-current={tab === key ? "page" : undefined}
                        className={`flex flex-col items-center gap-0.5 py-2 text-xs transition ${
                            tab === key ? "font-medium text-[#1A75BC] dark:text-[#5BC6E8]" : "text-slate-500 dark:text-slate-400"
                        }`}>
                        <Icon className="h-5 w-5" aria-hidden="true" /> {label}
                    </button>
                ))}
            </div>
        </nav>
    </Frame>)
}

// the whole screen's height: the site's top bar from md up, then the page
const Frame = ({ children }) => (
    <div className="flex h-[100dvh] flex-col bg-slate-50 dark:bg-slate-900">
        <div className="hidden shrink-0 md:block"><TopBar active="tasks" /></div>
        {children}
    </div>
);

const Chip = ({ children }) => (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
        {children}
    </span>
);

// seconds worked on the task, ticking while a work period runs
const useElapsed = (task) => {
    const [now, setNow] = useState(() => Date.now());
    const running = !!task?.activeSince;
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [running]);
    if (!task) return 0;
    const current = running ? Math.max(0, Math.floor((now - Date.parse(task.activeSince)) / 1000)) : 0;
    return (task.workedSeconds ?? 0) + current;
};

const Row = ({ label, children }) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
        <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="text-right text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
);

const DetailsTab = ({ task, onAccepted, onDeclined, onOpenReport }) => (
    <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
            <dl className="divide-y divide-slate-100 dark:divide-slate-700">
                <Row label="Équipement">{task.equipmentId}</Row>
                {task.location && <Row label="Emplacement">{task.location}</Row>}
                <Row label="Échéance">{task.dueDate ? formatDay(task.dueDate) : "Sans échéance"}</Row>
                <Row label="Priorité"><PriorityBadge priority={task.priority} /></Row>
            </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Instructions</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
                {task.instructions || "Aucune instruction."}
            </p>
        </div>

        {task.status === "ASSIGNED" && <AssignedActions task={task} onAccepted={onAccepted} onDeclined={onDeclined} />}

        {task.status === "STARTED" && task.templateId && (
            <button type="button" onClick={onOpenReport}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A75BC] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0F2A49]">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Remplir le rapport
            </button>
        )}

        {(task.status === "BLOCKED" || task.status === "RETURNED") && <ResumeAction task={task} onResumed={onAccepted} />}
    </div>
);

// a blocked task, or a report sent back to be corrected: why, and Reprendre (→ STARTED)
const ResumeAction = ({ task, onResumed }) => {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const returned = task.status === "RETURNED";

    const resume = async () => {
        setSending(true);
        setError("");
        try {
            await apiClient.post(`/api/v1/task/${task.id}/start`);
            onResumed();
        }
        catch (err) {
            console.log("Error while resuming task", err);
            setError(serverMessage(err, "La tâche n'a pas pu être reprise. Réessayez."));
            setSending(false);
        }
    };

    return (
    <div className={`rounded-2xl border px-4 py-3 ${returned
        ? "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950"
        : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"}`}>
        <p className={`text-sm font-medium ${returned ? "text-orange-800 dark:text-orange-300" : "text-amber-800 dark:text-amber-300"}`}>
            {returned ? "Votre rapport a été renvoyé pour correction." : "Cette tâche est en attente."}
        </p>
        {task.statusComment && (
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">« {task.statusComment} »</p>
        )}
        <button type="button" disabled={sending} onClick={resume}
            className={`${buttonBase} mt-3 w-full bg-emerald-600 py-2.5 text-white hover:bg-emerald-700`}>
            {sending ? "Reprise…" : returned ? "Reprendre et corriger le rapport" : "Reprendre la tâche"}
        </button>
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>)
};

// Accepter / Refuser, for a task not started yet
const AssignedActions = ({ task, onAccepted, onDeclined }) => {
    const [declining, setDeclining] = useState(false);
    const [reason, setReason] = useState(DECLINE_REASONS[0].value);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    // accepting = starting the task on the backend (ASSIGNED → STARTED)
    const accept = async () => {
        setSending(true);
        setError("");
        try {
            await apiClient.post(`/api/v1/task/${task.id}/start`);
            onAccepted();
        }
        catch (err) {
            console.log("Error while accepting task", err);
            setError(serverMessage(err, "La tâche n'a pas pu être acceptée. Réessayez."));
        }
        finally {
            setSending(false);
        }
    };

    const decline = async () => {
        setSending(true);
        setError("");
        try {
            await apiClient.post(`/api/v1/task/${task.id}/decline`, { reason, comment: comment.trim() || null });
            onDeclined();
        }
        catch (err) {
            console.log("Error while declining task", err);
            setError(serverMessage(err, "La tâche n'a pas pu être refusée. Réessayez."));
            setSending(false);
        }
    };

    const fieldClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

    return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        {!declining ? (
            <>
            <p className="text-sm text-slate-600 dark:text-slate-300">Acceptez la tâche pour lancer le chronomètre et remplir le rapport.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={sending} onClick={() => setDeclining(true)}
                    className={`${buttonBase} border border-slate-300 py-2.5 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700`}>
                    Refuser
                </button>
                <button type="button" disabled={sending} onClick={accept}
                    className={`${buttonBase} bg-emerald-600 py-2.5 text-white hover:bg-emerald-700`}>
                    {sending ? "Acceptation…" : "Accepter"}
                </button>
            </div>
            </>
        ) : (
            <div className="space-y-2">
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                    Motif
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
                        {DECLINE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </label>
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                    Commentaire (facultatif)
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={fieldClass} />
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" disabled={sending} onClick={() => setDeclining(false)}
                        className={`${buttonBase} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700`}>
                        Annuler
                    </button>
                    <button type="button" disabled={sending} onClick={decline}
                        className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}>
                        {sending ? "Refus…" : "Confirmer le refus"}
                    </button>
                </div>
            </div>
        )}
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>)
};

// The task's form. The server only takes the report of a started task, so it opens once the
// task is accepted, and stays on screen (with its PDF) once sent.
const ReportTab = ({ task, onSubmitted, onAccept }) => {
    // SUBMITTED: sent from this page, the form stays with its PDF
    const opened = task.status === "STARTED" || task.status === "SUBMITTED";

    if (!task.templateId)
        return <Message>Aucun rapport n'est demandé pour cette tâche.</Message>;

    if (!opened)
        return (
        <Message>
            {task.status === "ASSIGNED" ? (
                <>Acceptez d'abord la tâche pour remplir son rapport.{" "}
                <button type="button" onClick={onAccept} className="font-medium text-[#1A75BC] underline dark:text-[#5BC6E8]">Voir les détails</button></>
            ) : <>Reprenez d'abord la tâche pour remplir son rapport.{" "}
                <button type="button" onClick={onAccept} className="font-medium text-[#1A75BC] underline dark:text-[#5BC6E8]">Voir les détails</button></>}
        </Message>);

    return <ReportForm id={task.templateId} taskId={task.id} initialEquipment={task.equipmentId ?? ""} onSubmitted={onSubmitted} />;
};

const Message = ({ children }) => (
    <p className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {children}
    </p>
);

export default TaskScreen;
