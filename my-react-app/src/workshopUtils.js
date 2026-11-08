// Labels and helpers of the workshop pages (Workshop.jsx, WorkshopRequest.jsx, WorkshopIntervention.jsx),
// the web side of the backend's InterventionController. The loop itself is in fix_workshop.md.

// StepStatus on the backend: the PDF's status table
export const STEP_STATUS = {
    A_TRAITER:  { label: "À traiter",            style: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
    EN_COURS:   { label: "En cours",             style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    EN_ATTENTE: { label: "En attente",           style: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    BLOQUE:     { label: "Bloqué / Quarantaine", style: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
    A_CORRIGER: { label: "À corriger",           style: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
    VALIDE:     { label: "Validé",               style: "bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]" },
};

// the technician's task on step 8 / 16 (TaskStatus on the backend), with the PDF's labels where
// they match (fix_workshop.md, "Step statuses"); same styles as STEP_STATUS
export const TASK_STATUS = {
    ASSIGNED:  { label: "À traiter",                 style: STEP_STATUS.A_TRAITER.style },
    STARTED:   { label: "En cours",                  style: STEP_STATUS.EN_COURS.style },
    BLOCKED:   { label: "En attente",                style: STEP_STATUS.EN_ATTENTE.style },
    RETURNED:  { label: "À corriger",                style: STEP_STATUS.A_CORRIGER.style },
    SUBMITTED: { label: "Rapport envoyé",            style: STEP_STATUS.VALIDE.style },
    APPROVED:  { label: "Validé",                    style: STEP_STATUS.VALIDE.style },
    DECLINED:  { label: "Refusée par le technicien", style: STEP_STATUS.BLOQUE.style },
    REJECTED:  { label: "Rejetée",                   style: STEP_STATUS.BLOQUE.style },
    CANCELED:  { label: "Annulée",                   style: STEP_STATUS.BLOQUE.style },
};

// QuoteStatus on the backend: the devis prepared at step 10
export const QUOTE_STATUS = {
    DRAFT:    { label: "Brouillon", style: STEP_STATUS.A_TRAITER.style },
    SENT:     { label: "Envoyé",    style: STEP_STATUS.EN_COURS.style },
    ACCEPTED: { label: "Accepté",   style: STEP_STATUS.VALIDE.style },
    REFUSED:  { label: "Refusé",    style: STEP_STATUS.BLOQUE.style },
    CANCELED: { label: "Annulé",    style: STEP_STATUS.BLOQUE.style },
};

// InterventionStatus: only shown once the intervention is closed
export const INTERVENTION_STATUS = {
    EN_COURS: { label: "En cours", style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    TERMINEE: { label: "Terminée", style: "bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]" },
    ANNULEE:  { label: "Annulée",  style: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

// UserRole of the workshop, as the PDF names them
export const ROLE_LABEL = {
    SALES: "Client / Sales",
    BUSINESS_OPS: "Business Operations Manager",
    CONTRACT_ADMIN: "Contract Admin",
    PROJECT_LEAD: "Chef de projet / Préparateur",
    WORKSHOP_LEAD: "Pumps Maintenance Lead",
    HSE: "HSE",
    STOREKEEPER: "Magasinier",
    QUALITY: "Quality & Reliability Team",
    BILLING: "Responsable facturation",
    USER: "Technicien",
};

// one line of the history: what the InterventionAction did
export const ACTION_TEXT = {
    CREATE: "a créé la demande",
    TAKE: "a pris en charge",
    VALIDATE: "a validé",
    CANCEL: "a annulé l'intervention",
    RETURN: "a renvoyé le rapport au technicien",
};

// what a technician's report is, from its task's step (InterventionDetails.tasks[].step)
export const REPORT_KIND = {
    DEMONTAGE_EXPERTISE: "Rapport de démontage",
    MONTAGE_ESSAIS: "Rapport de montage",
};

// the intervention's last report of a step ("DEMONTAGE_EXPERTISE"), from its tasks: the newest task
// of that step that has one, and its newest version. null if none was sent
export const latestReportOf = (details, stepCode) => {
    const tasks = (details?.tasks ?? []).filter((t) => t.step?.code === stepCode && t.reports.length > 0);
    const last = tasks[tasks.length - 1];
    return last ? last.reports[last.reports.length - 1].submissionId : null;
};

// the steps where the technician's report is reviewed (WorkshopReport.jsx): after step 8 / 16
export const REVIEW_STEPS = ["VALIDER_RAPPORT", "CONTROLE_FINAL"];

// the steps worked on their own page while their content is to come (WorkshopPendingStep.jsx):
// /atelier/:id/etape/:slug. to: who the intervention goes to after "Valider"
export const PENDING_STEPS = {
    DISPONIBILITE_PDR: {
        slug: "pdr", title: "Disponibilité des pièces de rechange", card: "Vérification des pièces",
        soon: "La vérification de la disponibilité des pièces de rechange arrivera prochainement.",
        to: "au magasinier",
    },
    SORTIE_PIECES: {
        slug: "sortie-pieces", title: "Sortie des pièces", card: "Sortie du magasin",
        soon: "La sortie des pièces du magasin arrivera prochainement.",
        to: "au contrôle qualité",
    },
    CONTROLE_QUALITE_PDR: {
        slug: "controle-qualite", title: "Contrôle qualité des pièces", card: "Contrôle des pièces",
        soon: "Le contrôle qualité des pièces de rechange arrivera prochainement.",
        to: "au Pumps Maintenance Lead pour autoriser le montage",
    },
};
export const pendingStepRoute = (interventionId, code) => `/atelier/${interventionId}/etape/${PENDING_STEPS[code].slug}`;

// "Alerte #12" or "Client"
export const originLabel = (intervention) =>
    intervention.origin === "ALERT" ? `Alerte #${intervention.alertNumber}` : "Demande client";

// "1 · Compléter la demande"
export const stepLabel = (step) => `${step.number} · ${step.label}`;

// a manager sending a pump from an alert case (AlertDetail.jsx): the request form, pre-filled.
// For navigate(workshopRequestRoute(…)).
export const workshopRequestRoute = (pumpId, fault, urgent, alertNumber) =>
    `/atelier/nouvelle?${new URLSearchParams({ equipement: pumpId, panne: fault ?? "", ...(urgent ? { urgent: "1" } : {}), alerte: alertNumber })}`;

export const inputClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
