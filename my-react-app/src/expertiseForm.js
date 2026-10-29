// The pump expertise report. Technicians choose between two versions of it (Forms.jsx): the
// short one, a photo and two dictated fields, and the full one, whose title is also the one the
// mobile app's expertise build opens (EXPERTISE_FORM_TITLE, constants/app-variant).
// Both are matched on the template's title.
export const EXPERTISE_FORM_TITLE = "Rapport d'expertise";
export const QUICK_FORM_TITLE = "Rapport d'expertise rapide";

// what a technician can pick, in this order; a form not active on the server isn't offered
export const TECHNICIAN_FORMS = [
  { title: QUICK_FORM_TITLE, hint: "Une photo, le constat et les pièces à changer, dictés au micro." },
  { title: EXPERTISE_FORM_TITLE, hint: "Le rapport complet au démontage, point par point, avec les photos." },
];

// titles compared loosely so a stray space or capital on the server doesn't hide it
export const sameText = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();

// every version of the report (full, rapide…) gets the pump vocabulary for dictation (InspectionForm.jsx)
export const isExpertiseTitle = (title) =>
  !!title?.trim().toLowerCase().startsWith(EXPERTISE_FORM_TITLE.toLowerCase());
