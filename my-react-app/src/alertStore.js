// The alert cases ("#12 · PHB3-J-07 · Vibrations élevées"): what the manager decides about an alert
// the twin raised, and what happened to it. Kept in the browser (localStorage) until the backend
// has its Alert / AlertEvent tables; the functions below are the API those will offer.
//
// A case is opened the first time a live alert is seen, and follows it: it records when the alert
// got worse or went back to normal, the manager's status / priority changes and comments, and the
// work orders created from it. The live alert itself (severity, message) stays in useFleet().
//
//   { number, key: "PHB3-J-07:vibration", pumpId, site, kind, severity, raisedAt,
//     status, priority, clearedAt, resolvedAt, orders: [{ taskId, title, technicianEmail, at }],
//     events: [{ type, at, by?, from?, to?, text?, severity?, message? }] }
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "greensense.alertCases.v1";
const SEVERITY_RANK = { warning: 1, critical: 2 };

// the default priority of a new case, from its severity (TaskPriority values)
const PRIORITY_FOR = { critical: "HIGH", warning: "NORMAL" };

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved?.issues) return saved;
    }
    catch { /* private window or blocked storage: start empty */ }
    return { nextNumber: 1, issues: [] };
}

let state = load();
const listeners = new Set();

function commit(next) {
    state = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* the cases still live for this tab */ }
    listeners.forEach((l) => l());
}

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

// every case, newest first
export const useAlertIssues = () => useSyncExternalStore(subscribe, () => state).issues;

// changes one case through fn (which returns the new case)
const update = (number, fn) =>
    commit({ ...state, issues: state.issues.map((issue) => (issue.number === number ? fn(issue) : issue)) });

const isOpen = (issue) => issue.status !== "RESOLVED";

// the open case following a live alert, if any
export const openIssueFor = (issues, alertKey) => issues.find((i) => i.key === alertKey && isOpen(i));

// ---- following the live alerts (AppShell calls this on every twin tick) ----

export function syncAlerts(alerts, now) {
    let { nextNumber } = state;
    let changed = false;
    const issues = [...state.issues];

    for (const alert of alerts) {
        const index = issues.findIndex((i) => i.key === alert.id && isOpen(i));
        if (index === -1) {
            // a case resolved while its alert was still on covers it until the alert clears
            if (issues.some((i) => i.key === alert.id && i.resolvedAt >= alert.since)) continue;
            issues.unshift({
                number: nextNumber++,
                key: alert.id,
                pumpId: alert.pumpId,
                site: alert.site,
                kind: alert.id.split(":")[1],
                severity: alert.severity,
                raisedAt: alert.since,
                status: "NEW",
                priority: PRIORITY_FOR[alert.severity],
                clearedAt: null,
                resolvedAt: null,
                orders: [],
                events: [{ type: "raised", at: alert.since, severity: alert.severity, message: alert.message }],
            });
            changed = true;
            continue;
        }
        const issue = issues[index];
        const events = [];
        let { severity, clearedAt } = issue;
        if (SEVERITY_RANK[alert.severity] > SEVERITY_RANK[severity]) {
            events.push({ type: "escalated", at: now, from: severity, to: alert.severity, message: alert.message });
            severity = alert.severity;
        }
        if (clearedAt) {
            events.push({ type: "reactivated", at: now, message: alert.message });
            clearedAt = null;
        }
        if (events.length) {
            issues[index] = { ...issue, severity, clearedAt, events: [...issue.events, ...events] };
            changed = true;
        }
    }

    // an open case whose alert is gone: the reading is back within limits
    const live = new Set(alerts.map((a) => a.id));
    issues.forEach((issue, index) => {
        if (isOpen(issue) && !issue.clearedAt && !live.has(issue.key)) {
            issues[index] = { ...issue, clearedAt: now, events: [...issue.events, { type: "cleared", at: now }] };
            changed = true;
        }
    });

    if (changed) commit({ nextNumber, issues });
}

// ---- the manager's actions; by: who did it (an email, or the role after a reload) ----

export function setStatus(number, status, by) {
    update(number, (issue) => issue.status === status ? issue : {
        ...issue,
        status,
        resolvedAt: status === "RESOLVED" ? Date.now() : null,
        events: [...issue.events, { type: "status", at: Date.now(), by, from: issue.status, to: status }],
    });
}

export function setPriority(number, priority, by) {
    update(number, (issue) => issue.priority === priority ? issue : {
        ...issue,
        priority,
        events: [...issue.events, { type: "priority", at: Date.now(), by, from: issue.priority, to: priority }],
    });
}

export function addComment(number, text, by) {
    update(number, (issue) => ({ ...issue, events: [...issue.events, { type: "comment", at: Date.now(), by, text }] }));
}

// a work order was created from the case (AssignTask.jsx, after the server answered): the case is
// now being worked on
export function linkOrder(number, order, by) {
    update(number, (issue) => {
        const at = Date.now();
        const starts = ["NEW", "ACKNOWLEDGED"].includes(issue.status);
        const events = [{ type: "order", at, by, text: order.title, to: order.technicianEmail }];
        if (starts) events.push({ type: "status", at, by, from: issue.status, to: "IN_PROGRESS" });
        return {
            ...issue,
            status: starts ? "IN_PROGRESS" : issue.status,
            orders: [...issue.orders, { ...order, at }],
            events: [...issue.events, ...events],
        };
    });
}
