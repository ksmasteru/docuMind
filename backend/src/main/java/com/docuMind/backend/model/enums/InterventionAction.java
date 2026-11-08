package com.docuMind.backend.model.enums;

// what someone did to an intervention: the buttons of a step, and the creation.
// The service lists the ones the caller may press (availableActions), so the page only draws those.
// The later ones are declared now for the check constraint (see UserRole); the service refuses them for now.
public enum InterventionAction {
    CREATE,     // not a button: the manager or Sales created the request
    TAKE,       // "Prendre en charge": A_TRAITER / A_CORRIGER -> EN_COURS, the caller becomes the assignee
    VALIDATE,   // "Valider": EN_COURS -> VALIDE, the next step is A_TRAITER in its role's queue
    CANCEL,     // "Refuser / Annuler": the intervention is ANNULEE, comment required, canCancel steps only

    // later
    RETURN,     // "Renvoyer": the refuseTo step becomes A_CORRIGER, comment required
    WAIT,       // "Mettre en attente": EN_COURS -> EN_ATTENTE, reason required
    RESUME,     // "Reprendre": EN_ATTENTE -> EN_COURS
    BLOCK,      // "Bloquer": EN_COURS -> BLOQUE, canBlock steps only
    UNBLOCK     // "Lever": BLOQUE -> EN_COURS (WORKSHOP_LEAD, à valider)
}
