// The alert cases ("#12 · PHB3-J-07 · Vibrations élevées"): what the twin raised or a technician
// reported, what the manager decided, and what the field said. They live on the server
// (AlertController, /api/v1/alerts), shared by the manager and the technicians; this module keeps a
// copy for the pages and the same functions they used when the cases lived in the browser.
//
//   { number, key: "PHB3-J-07:vibration", pumpId, site, kind, source: "TWIN" | "FIELD", severity,
//     message, raisedAt, status, priority, clearedAt, resolvedAt,
//     report: { by, byName, equipmentModel, title, description, imageIds } | null   (a FIELD case),
//     verifications: [{ technicianEmail, name, verdict: "CONFIRMED" | "FALSE_ALARM", comment, at }],
//     requests: [{ id, technicianEmail, name, message, status: "PENDING" | "ACCEPTED" | "REFUSED",
//                  at, decidedBy, decidedByName, decidedAt, comment, taskId }],
//     orders: [{ taskId, title, technicianEmail, technicianName, at }], interventions: [{ id, number, at }],
//     events: [{ type, at, by, byName, from, to, text, severity, message }],
//     verification: "TO_CHECK" | "CHECK_ORDERED" | "CONFIRMED" | "FALSE_ALARM" | "INCONCLUSIVE",
//     check: { taskId, technicianEmail, technicianName, taskStatus, statusComment, selfAssigned, assignedAt,
//              submittedAt, round, verdict, falseAlarmCause, inconclusiveReason, urgentStop, canHandle,
//              cannotHandleReason, comment } | null   (the current or last check, levée de doute),
//     closeReason, closeComment }
// Times are in milliseconds. The live alert itself (severity, message right now) stays in useFleet().
import { useSyncExternalStore } from "react";
import { apiClient, getAccessToken } from "./apiClient";

const REFRESH_MS = 15000;    // what the others did (a technician's verdict, the manager's answer) shows within this
const RESYNC_MS = 60000;     // the twin's alerts are sent when they change, and at least this often
const STOP_AFTER_MS = 10000; // between two pages nobody listens for a moment: keep the refresh running

let state = { issues: [], loaded: false, error: null };
const listeners = new Set();
let timer = null;
let stopTimer = null;
let inflight = null;
let lastRefresh = 0;

function emit(next) {
    state = next;
    listeners.forEach((l) => l());
}

const setIssues = (issues) => emit({ issues, loaded: true, error: null });

// one case changed: it keeps its place in the list (a new one goes first)
function upsert(issue) {
    const found = state.issues.some((i) => i.number === issue.number);
    setIssues(found ? state.issues.map((i) => (i.number === issue.number ? issue : i)) : [issue, ...state.issues]);
    return issue;
}

export function refreshAlerts() {
    if (!inflight) {
        lastRefresh = Date.now();
        inflight = apiClient.get("/api/v1/alerts")
            .then(({ data }) => setIssues(data))
            .catch((error) => emit({ ...state, loaded: true, error }))
            .finally(() => { inflight = null; });
    }
    return inflight;
}

const subscribe = (listener) => {
    listeners.add(listener);
    clearTimeout(stopTimer);
    if (!timer) {
        if (Date.now() - lastRefresh > 5000) refreshAlerts();
        timer = setInterval(refreshAlerts, REFRESH_MS);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            stopTimer = setTimeout(() => { clearInterval(timer); timer = null; }, STOP_AFTER_MS);
        }
    };
};

const getState = () => state;

// every case the user may see, newest first
export const useAlertIssues = () => useSyncExternalStore(subscribe, getState).issues;

// the same with how loading went: { issues, loaded, error }
export const useAlertState = () => useSyncExternalStore(subscribe, getState);

// signing in or out: the next user starts from his own cases (AuthContext.jsx)
export function resetAlerts() {
    lastSync = { signature: null, at: 0 };
    lastRefresh = 0;
    emit({ issues: [], loaded: false, error: null });
}

const isOpen = (issue) => issue.status !== "RESOLVED";

// the signed-in user's email, from the session's token: after a reload AuthContext only knows the
// role, and a technician's page needs to know which verdict and request are his
export function sessionEmail() {
    const token = getAccessToken();
    if (!token) return null;
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(payload)).sub ?? null;
    }
    catch {
        return null;
    }
}

// the open case following a live alert, if any
export const openIssueFor = (issues, alertKey) => issues.find((i) => i.key === alertKey && isOpen(i));

// ---- following the live alerts (the pages running the twin call this on every tick) ----

let lastSync = { signature: null, at: 0 };

export function syncAlerts(alerts, now) {
    const signature = alerts.map((a) => `${a.id}:${a.severity}`).sort().join("|");
    if (signature === lastSync.signature && now - lastSync.at < RESYNC_MS) return;
    lastSync = { signature, at: now };
    const body = {
        at: now,
        alerts: alerts.map(({ id, pumpId, site, severity, message, since }) => ({ id, pumpId, site, severity, message, since })),
    };
    apiClient.post("/api/v1/alerts/sync", body)
        .then(({ data }) => setIssues(data))
        .catch((err) => {
            console.log("alerts not synced", err);
            lastSync = { signature: null, at: 0 }; // try again on the next tick
        });
}

// ---- actions: each answers with the case as it is now. The server knows who acts (the token) ----

const act = (request) => request.then(({ data }) => upsert(data));

// the manager
export const setStatus = (number, status) => act(apiClient.post(`/api/v1/alerts/${number}/status`, { status }));
export const setPriority = (number, priority) => act(apiClient.post(`/api/v1/alerts/${number}/priority`, { priority }));
export const addComment = (number, text) => act(apiClient.post(`/api/v1/alerts/${number}/comments`, { text }));

// a work order was created from the case (AssignTask.jsx, after the server answered)
export const linkOrder = (number, order) =>
    act(apiClient.post(`/api/v1/alerts/${number}/orders`, { taskId: order.taskId, title: order.title, technicianEmail: order.technicianEmail }));

// the pump was sent to the workshop from the case (WorkshopRequest.jsx): intervention is { id, number }
export const linkIntervention = (number, intervention) =>
    act(apiClient.post(`/api/v1/alerts/${number}/interventions`, { id: intervention.id, number: intervention.number }));

// a technician's request to intervene: accepted with the task to create, or refused with a reason
export const acceptRequest = (requestId, task) => act(apiClient.post(`/api/v1/alerts/requests/${requestId}/accept`, task));
export const refuseRequest = (requestId, comment) => act(apiClient.post(`/api/v1/alerts/requests/${requestId}/refuse`, { comment }));

// the alert closed, with its reason (AlertCloseReason) and a comment
export const closeAlert = (number, reason, comment) => act(apiClient.post(`/api/v1/alerts/${number}/close`, { reason, comment }));

// the check (levée de doute): sent by the manager ({ technicianEmail, points, priority, dueDate, instructions }),
// canceled, or its report sent back for more details
export const orderCheck = (number, order) => act(apiClient.post(`/api/v1/alerts/${number}/checks`, order));
export const cancelCheck = (number) => act(apiClient.post(`/api/v1/alerts/${number}/check/cancel`));
export const returnCheck = (number, comment) => act(apiClient.post(`/api/v1/alerts/${number}/check/return`, { comment }));

// the field: a technician starts the check himself (answers his check task's id), sends his check
// report, or reports a fault the twin did not see
export const selfCheck = (number, points) =>
    apiClient.post(`/api/v1/alerts/${number}/checks/self`, { points }).then(({ data }) => { upsert(data.alert); return data.taskId; });
export const submitCheck = (taskId, report) => act(apiClient.post(`/api/v1/checks/${taskId}/report`, report));
export const reportFault = (report) => act(apiClient.post("/api/v1/alerts/reports", report));
