import Layout from "./Layout";
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";

// highest first; matches TaskPriority on the backend
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

const PRIORITY_STYLE = {
    URGENT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    HIGH:   "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    NORMAL: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    LOW:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

// StatusReason values meant for decline
const DECLINE_REASONS = [
    { value: "ON_LEAVE",       label: "On leave" },
    { value: "WRONG_TASK",     label: "Wrong task" },
    { value: "NO_ISSUE_FOUND", label: "No issue found" },
];

// by priority, then earliest due date (tasks without a due date last)
const byPriority = (a, b) => {
    const rank = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    if (rank !== 0) return rank;
    if (!a.dueDate) return b.dueDate ? 1 : 0;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
};

// buttons shown under the instructions; only ASSIGNED tasks have actions for now
const AssignedActions = ({ task, onAccepted, onDeclined }) => {

    const [declining, setDeclining] = useState(false);
    const [reason, setReason] = useState(DECLINE_REASONS[0].value);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    // accepting = starting the task on the backend (ASSIGNED -> STARTED)
    const accept = async () => {
        setSending(true);
        setError("");
        try {
            await apiClient.post(`/api/v1/task/${task.id}/start`);
            onAccepted(task.id);
        }
        catch (err) {
            console.log("Error while accepting task", err);
            setError("Couldn't accept the task. Try again.");
        }
        finally {
            setSending(false);
        }
    }

    const decline = async () => {
        setSending(true);
        setError("");
        try {
            await apiClient.post(`/api/v1/task/${task.id}/decline`, { reason, comment: comment.trim() || null });
            onDeclined(task.id);
        }
        catch (err) {
            console.log("Error while declining task", err);
            setError("Couldn't decline the task. Try again.");
            setSending(false);
        }
    }

    const buttonBase = "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50";

    return(
    <div className="mt-4">
        {!declining && (
        <div className="flex justify-end gap-2">
            <button type="button" disabled={sending} onClick={() => setDeclining(true)}
                className={`${buttonBase} border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700`}>
                Decline
            </button>
            <button type="button" disabled={sending} onClick={accept}
                className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`}>
                {sending ? "Accepting…" : "Accept"}
            </button>
        </div>
        )}

        {declining && (
        <div className="space-y-2">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
                Reason
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    {DECLINE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
                Comment (optional)
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <div className="flex justify-end gap-2">
                <button type="button" disabled={sending} onClick={() => setDeclining(false)}
                    className={`${buttonBase} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700`}>
                    Cancel
                </button>
                <button type="button" disabled={sending} onClick={decline}
                    className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}>
                    {sending ? "Declining…" : "Confirm decline"}
                </button>
            </div>
        </div>
        )}

        {error && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}
    </div>)
}

const Tasks = () => {

    const [tasks, setTasks] = useState([]);
    const [status, setStatus] = useState("loading");
    const [openId, setOpenId] = useState(null);

    useEffect(() => {
        const fetchMyTasks = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/task/mine");
                setTasks([...data.tasks].sort(byPriority));
                setStatus("success");
            }
            catch (err) {
                console.log("Error while fetching tasks", err);
                setStatus("error");
            }
        }
        fetchMyTasks();
    }, [])

    const toggle = (id) => setOpenId((current) => current === id ? null : id);

    const markStarted = (id) =>
        setTasks((current) => current.map((t) => t.id === id ? { ...t, status: "STARTED" } : t));

    // a declined task is no longer active, so it leaves the list
    const removeTask = (id) => {
        setTasks((current) => current.filter((t) => t.id !== id));
        setOpenId(null);
    };

    return(
    <Layout active="tasks">
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
     <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My tasks</h1>
    <div className="mt-6">
        {status === "loading" && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading tasks…</p>
        )}

        {status === "success" && tasks.length > 0 && (
        <ul className="space-y-2">
            {tasks.map((task) => {
            const isOpen = openId === task.id;
            return(
            <li key={task.id} className={`rounded-2xl border bg-white dark:bg-slate-800 ${isOpen ? "border-slate-400 dark:border-slate-500" : "border-slate-200 dark:border-slate-700"}`}>
                <button type="button" onClick={() => toggle(task.id)} aria-expanded={isOpen}
                    className="w-full px-4 py-3 text-left">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="font-medium text-slate-900 dark:text-slate-100">{task.title}</h2>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.LOW}`}>
                            {task.priority}
                        </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        <span>Equipment: {task.equipmentId}</span>
                        {task.location && <span>Location: {task.location}</span>}
                        <span>Due: {task.dueDate ?? "—"}</span>
                        <span>Status: {task.status}</span>
                    </div>
                </button>

                {isOpen && (
                <div className="border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-700">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Instructions</h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
                        {task.instructions || "No instructions."}
                    </p>

                    {task.status === "ASSIGNED" && (
                        <AssignedActions task={task} onAccepted={markStarted} onDeclined={removeTask} />
                    )}
                </div>
                )}
            </li>)
            })}
        </ul>
        )}

        {status === "success" && tasks.length === 0 && (
           <p className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
             No tasks assigned to you.
            </p>
        )}

        {status === "error" && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Couldn't load tasks. Try again.
            </p>
        )}

    </div>
    </main>
    </div>
    </Layout>)
}

export default Tasks;
