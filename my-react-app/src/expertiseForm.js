// The pump expertise report, the one form technicians get for now (Forms.jsx opens it on its
// own) and whose dictation uses its own vocabulary (InspectionForm.jsx). Matched on the
// template's title, like the mobile app's EXPERTISE_FORM_TITLE (constants/app-variant).
export const EXPERTISE_FORM_TITLE = "Rapport d'expertise";

// titles compared loosely so a stray space or capital on the server doesn't hide it
export const sameText = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();
