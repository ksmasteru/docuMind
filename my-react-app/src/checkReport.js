// The plain helpers of the check report (levée de doute), shared by its pages: the fields' classes, the
// photo and section shapes, "what comes next" checked and turned into the API's body, useCheck, which
// reads one check task (GET /api/v1/checks/:taskId), useCheckBehind, the check behind a work order
// (GET /api/v1/checks/for/:taskId), and the PDF download (GET /api/v1/checks/:taskId/pdf).
// The components are in CheckReportParts.jsx.
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";
import { serverMessage } from "./managerUtils";

export const inputClass = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
export const labelClass = "block text-sm font-medium text-foreground";

// the server's ids, the ones that finished uploading
export const photoIds = (photos) => photos.filter((p) => p.id).map((p) => p.id);
// photos the server already has (an earlier round, a draft), in the picker's shape
export const knownPhotos = (ids) => (ids ?? []).map((id) => ({ key: id, id }));
let counter = 0;
export const newKey = () => `k${Date.now()}-${counter++}`;

export const emptyNext = { canHandle: null, handleMessage: "", estimatedHours: "", partsNeeded: "", cannotHandleReason: null, cannotHandleComment: "" };

// what's missing in "what comes next", in the technician's words
export function nextStepProblems(next) {
    if (next.canHandle === null) return ["Dites si vous pouvez vous en charger."];
    if (next.canHandle === false && !next.cannotHandleReason) return ["Dites pourquoi vous ne pouvez pas vous en charger."];
    if (next.canHandle === false && next.cannotHandleReason === "OTHER" && !next.cannotHandleComment.trim()) return ["Précisez pourquoi vous ne pouvez pas vous en charger."];
    return [];
}

// the API's shape: { canHandle, handleMessage, estimatedHours, partsNeeded, cannotHandleReason, cannotHandleComment }
export const nextStepBody = (next) => ({
    canHandle: next.canHandle,
    handleMessage: next.canHandle ? next.handleMessage.trim() || null : null,
    estimatedHours: next.canHandle && next.estimatedHours !== "" ? Number(next.estimatedHours) : null,
    partsNeeded: next.canHandle ? next.partsNeeded.trim() || null : null,
    cannotHandleReason: next.canHandle === false ? next.cannotHandleReason : null,
    cannotHandleComment: next.canHandle === false ? next.cannotHandleComment.trim() || null : null,
});

export const sectionsBody = (sections) => sections.map((s) => ({ title: s.title.trim() || null, comment: s.comment.trim() || null, photos: photoIds(s.photos) }))
    .filter((s) => s.title || s.comment || s.photos.length);


// reload: anything that changes when the report does (a new round, a decision)
export function useCheck(taskId, reload) {
    const [state, setState] = useState({ check: null, error: null, taskId: null });
    useEffect(() => {
        if (!taskId) return undefined;
        let cancelled = false;
        apiClient.get(`/api/v1/checks/${taskId}`)
            .then(({ data }) => !cancelled && setState({ check: data, error: null, taskId }))
            .catch((err) => !cancelled && setState({ check: null, error: serverMessage(err, "Le rapport n'a pas pu être chargé."), taskId }));
        return () => { cancelled = true; };
    }, [taskId, reload]);
    return state.taskId === taskId ? state : { check: null, error: null };
}

// the check that confirmed the alert a work order was made from: { check: null } when it has none (204)
export function useCheckBehind(taskId) {
    const [state, setState] = useState({ check: undefined, error: null, taskId: null });
    useEffect(() => {
        if (!taskId) return undefined;
        let cancelled = false;
        apiClient.get(`/api/v1/checks/for/${taskId}`)
            .then(({ data, status }) => !cancelled && setState({ check: status === 204 || !data ? null : data, error: null, taskId }))
            .catch((err) => !cancelled && setState({ check: null, error: serverMessage(err, "Le rapport de levée de doute n'a pas pu être chargé."), taskId }));
        return () => { cancelled = true; };
    }, [taskId]);
    // check: undefined while it loads
    return state.taskId === taskId ? state : { check: undefined, error: null };
}

// one round of the report as a PDF (the latest without a round), saved under the server's name
// ("levee-de-doute-HDX-S-08-12-11-2026.pdf")
export async function downloadCheckPdf(taskId, round) {
    const response = await apiClient.get(`/api/v1/checks/${taskId}/pdf`, { responseType: "blob", params: round ? { round } : {} });
    const disposition = response.headers["content-disposition"] ?? "";
    const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? "levee-de-doute.pdf";
    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
