// The vocabulary of the team pages (Technicians.jsx, TechnicianProfile.jsx): a task's state,
// why it moved, and how a step of its timeline reads. Same rule as the console (dashboard/tokens.js):
// what runs normally stays neutral, color is kept for what needs someone, never color alone.
import { Ban, CircleCheck, CircleDashed, CircleX, FileClock, OctagonPause, PlayCircle, Undo2 } from "lucide-react";

// tone: a key of dashboard/tokens.js TONE
export const TASK_STATE = {
    ASSIGNED:  { label: "Assignée",    tone: "neutral", icon: CircleDashed },
    STARTED:   { label: "En cours",    tone: "neutral", icon: PlayCircle },
    BLOCKED:   { label: "Bloquée",     tone: "warn",    icon: OctagonPause },
    RETURNED:  { label: "À corriger",  tone: "warn",    icon: Undo2 },
    SUBMITTED: { label: "À valider",   tone: "standby", icon: FileClock },
    APPROVED:  { label: "Approuvée",   tone: "ok",      icon: CircleCheck },
    DECLINED:  { label: "Refusée",     tone: "offline", icon: CircleX },
    CANCELED:  { label: "Annulée",     tone: "offline", icon: Ban },
    REJECTED:  { label: "Rejetée",     tone: "crit",    icon: CircleX },
};

export const ACTIVE_STATES = ["ASSIGNED", "STARTED", "BLOCKED", "RETURNED"];

// the history's filters; test(task) says whether a task is shown
export const HISTORY_FILTERS = [
    { value: "ALL",      label: "Toutes",              test: () => true },
    { value: "ACTIVE",   label: "En cours",            test: (t) => ACTIVE_STATES.includes(t.status) },
    { value: "REVIEW",   label: "À valider",           test: (t) => t.status === "SUBMITTED" },
    { value: "APPROVED", label: "Approuvées",          test: (t) => t.status === "APPROVED" },
    { value: "RETURNED", label: "Renvoyées",           test: (t) => t.returns > 0 },
    { value: "CLOSED",   label: "Refusées · annulées", test: (t) => ["DECLINED", "CANCELED", "REJECTED"].includes(t.status) },
];

// StatusReason on the backend
export const REASON_LABEL = {
    ON_LEAVE: "En congé",
    WRONG_TASK: "Mauvaise tâche",
    NO_ISSUE_FOUND: "Aucun problème constaté",
    MISSING_PART: "Pièce manquante",
    NO_ACCESS: "Accès impossible",
    SAFETY_ISSUE: "Problème de sécurité",
    MISSING_INFO: "Informations manquantes",
    WRONG_MEASUREMENT: "Mesure erronée",
    INCOMPLETE_WORK: "Travail incomplet",
    WRONG_ASSIGNMENT: "Mauvaise affectation",
    DUPLICATE: "Doublon",
    OTHER: "Autre",
};

// SubmissionStatus: what the report found
export const REPORT_STATUS = {
    CONFORME:     { label: "Conforme",     tone: "ok" },
    NON_CONFORME: { label: "Non conforme", tone: "crit" },
    VALIDATED:    { label: "Validé",       tone: "ok" },
    DRAFT:        { label: "Brouillon",    tone: "neutral" },
};

// one step of a task's timeline, as a sentence: "Renvoyée pour correction"
export function eventLabel(event) {
    if (event.eventType === "REASSIGNED") return "Réassignée";
    if (event.eventType === "COMMENTED") return "Commentaire";
    switch (event.toStatus) {
        case "ASSIGNED":  return event.fromStatus ? "Remise à faire" : "Assignée";
        case "STARTED":   return event.fromStatus === "BLOCKED" || event.fromStatus === "RETURNED" ? "Reprise" : "Démarrée";
        case "BLOCKED":   return "Bloquée";
        case "SUBMITTED": return "Rapport envoyé";
        case "RETURNED":  return "Renvoyée pour correction";
        case "APPROVED":  return "Approuvée";
        case "DECLINED":  return "Refusée";
        case "CANCELED":  return "Annulée";
        case "REJECTED":  return "Rejetée";
        default:          return event.toStatus ?? "—";
    }
}

// "Hicham Essaquy" -> "HE", "ali" -> "A"
export const initials = (name) =>
    (name ?? "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

// 0.6667 -> "67 %"; null (nothing to measure yet) -> "—"
export const percent = (ratio) => (ratio == null ? "—" : `${Math.round(ratio * 100)} %`);

// the query (?equipement=…&alerte=…) a pump or an alert sends to the Techniciens page, kept on the
// way to the profile and to the assign form
export const ORDER_PARAMS = ["equipement", "alerte"];

export function orderQuery(searchParams, extra = {}) {
    const params = new URLSearchParams();
    Object.entries(extra).forEach(([key, value]) => value && params.set(key, value));
    ORDER_PARAMS.forEach((key) => searchParams.get(key) && params.set(key, searchParams.get(key)));
    const query = params.toString();
    return query ? `?${query}` : "";
}
