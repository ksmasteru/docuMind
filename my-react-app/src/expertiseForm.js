import { COMPLETE_FORM_TITLE, DISMANTLING_FORM_TITLE, MOUNTING_FORM_TITLE } from "./expertiseComplet";

// The pump expertise report. Technicians choose between two versions of it (Forms.jsx): the
// short one, a photo and two dictated fields, and the full one, whose title is also the one the
// mobile app's expertise build opens (EXPERTISE_FORM_TITLE, constants/app-variant).
// Both are matched on the template's title. The full paper report is a third form (expertiseComplet.js),
// and its démontage and montage parts a fourth and a fifth.
export const EXPERTISE_FORM_TITLE = "Rapport d'expertise";
export const QUICK_FORM_TITLE = "Rapport d'expertise rapide";

// what a technician can pick, in this order; a form not active on the server isn't offered
export const TECHNICIAN_FORMS = [
  { title: QUICK_FORM_TITLE, hint: "Une photo, le constat et les pièces à changer, dictés au micro." },
  { title: EXPERTISE_FORM_TITLE, hint: "Le rapport au démontage, point par point, avec les photos." },
  {
    title: COMPLETE_FORM_TITLE,
    hint: "Tout le rapport papier : pièce par pièce, contrôles, pièces et montage. Son PDF reprend la mise en page PHOVA.",
  },
  {
    title: DISMANTLING_FORM_TITLE,
    hint: "Le rapport papier jusqu'aux pièces, sans le montage : ce que l'on remplit au démontage en atelier.",
  },
  {
    title: MOUNTING_FORM_TITLE,
    hint: "Les informations générales, les pièces changées, la pompe assemblée et les contrôles du montage.",
  },
];

// titles compared loosely so a stray space or capital on the server doesn't hide it
export const sameText = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();

// The full report filled in one section at a time (InspectionForm's SectionWizard), one card each.
// The server's template has no sections, so they're laid out here and matched on each question's
// French label: the same template has a different id on each server. A question no section
// names goes to an "Autres points" card, so a label changed on the server never hides it.
// meta: the card also holds the sheet's own fields (emplacement, date, vérificateur).
const EXPERTISE_SECTIONS = [
  { title: "Informations générales", meta: true, labels: ["Client", "Fluide pompé"] },
  { title: "Pompe à la réception", labels: ["Photo de la pompe à la réception"] },
  { title: "Corps de la pompe", labels: ["Corps de la pompe"] },
  { title: "Roue", labels: ["Roue", "Photo de la roue"] },
  { title: "Arbre et roulements", labels: ["Arbre", "Roulements"] },
  { title: "Garniture mécanique", labels: ["Garniture mécanique", "Photo de la garniture mécanique démontée"] },
  {
    title: "Constat et pièces",
    labels: ["Constat d'expertise au démontage (dictée vocale)", "Pièces à changer ou à réparer (dictée vocale)"],
  },
];

// the forms laid out like the paper report (InspectionForm's isComplete): the full one and its two parts
const COMPLETE_LAYOUT_TITLES = [COMPLETE_FORM_TITLE, DISMANTLING_FORM_TITLE, MOUNTING_FORM_TITLE];
export const usesCompleteLayout = (title) => COMPLETE_LAYOUT_TITLES.some((t) => sameText(title, t));

// the sections a template is shown in, or null for the one-page sheet
export const sectionsFor = (title) => (sameText(title, EXPERTISE_FORM_TITLE) ? EXPERTISE_SECTIONS : null);

// every version of the report (full, rapide, démontage, montage…) gets the pump vocabulary for dictation (InspectionForm.jsx)
export const isExpertiseTitle = (title) =>
  !!title?.trim().toLowerCase().startsWith(EXPERTISE_FORM_TITLE.toLowerCase()) || usesCompleteLayout(title);
