package com.docuMind.backend.model.enums;

import java.util.Arrays;
import java.util.List;

// The workshop loop's steps, in order: the steps table of fix_workshop.md.
// Each step says who acts on it, where "Renvoyer" sends the intervention back (null: no step before it,
// or a technician's step, which goes back through its task's RETURNED), and whether it may be
// blocked (safety) or cancelled (a final no).
// All 20 are declared now for the same reason as UserRole: the column's check constraint.
public enum WorkshopStep {
    // 01 Traitement de la demande
    COMPLETER_DEMANDE    (UserRole.SALES,          "Compléter la demande",              null,                  false, true),
    ACCEPTER_DEMANDE     (UserRole.BUSINESS_OPS,   "Accepter la demande",               COMPLETER_DEMANDE,     false, true),
    CONFIRMER_CONTRAT    (UserRole.CONTRACT_ADMIN, "Confirmer contrat / commande",      COMPLETER_DEMANDE,     false, false),
    // 02 Réception, décontamination et sécurité
    ENREGISTRER_RECEPTION(UserRole.PROJECT_LEAD,   "Enregistrer réception",             CONFIRMER_CONTRAT,     false, false),
    RECEPTION_CONFORME   (UserRole.WORKSHOP_LEAD,  "Réception conforme",                ENREGISTRER_RECEPTION, true,  true),
    ANALYSE_RISQUES      (UserRole.HSE,            "Analyse des risques",               ENREGISTRER_RECEPTION, true,  false),
    // 03 Démontage et expertise
    AFFECTER_EQUIPE      (UserRole.WORKSHOP_LEAD,  "Affecter équipe",                   ANALYSE_RISQUES,       false, false),
    DEMONTAGE_EXPERTISE  (UserRole.USER,           "Démontage + rapport d'expertise",   null,                  false, false),
    // 04 Besoins PDR et chiffrage
    VALIDER_RAPPORT      (UserRole.WORKSHOP_LEAD,  "Valider rapport",                   DEMONTAGE_EXPERTISE,   false, false),
    VALIDER_BESOINS_DEVIS(UserRole.PROJECT_LEAD,   "Valider besoins + envoyer devis",   VALIDER_RAPPORT,       false, false),
    // 05 Disponibilité et préparation des PDR
    ACCORD_DEVIS         (UserRole.SALES,          "Accord client sur devis",           VALIDER_BESOINS_DEVIS, false, true),
    DISPONIBILITE_PDR    (UserRole.PROJECT_LEAD,   "Disponibilité PDR",                 ACCORD_DEVIS,          false, false),
    SORTIE_PIECES        (UserRole.STOREKEEPER,    "Sortie des pièces",                 DISPONIBILITE_PDR,     false, false),
    CONTROLE_QUALITE_PDR (UserRole.QUALITY,        "Contrôle qualité PDR",              SORTIE_PIECES,         false, false),
    // 06 Montage et essais
    AUTORISER_MONTAGE    (UserRole.WORKSHOP_LEAD,  "Autoriser montage + affecter",      CONTROLE_QUALITE_PDR,  false, false),
    MONTAGE_ESSAIS       (UserRole.USER,           "Montage + essais",                  null,                  false, false),
    // 07 Contrôle final et validation
    CONTROLE_FINAL       (UserRole.WORKSHOP_LEAD,  "Contrôle final",                    MONTAGE_ESSAIS,        false, false),
    VALIDER_ATTACHEMENT  (UserRole.BUSINESS_OPS,   "Valider attachement",               CONTROLE_FINAL,        false, false),
    // 08 Dossier final, livraison et clôture
    DOSSIER_FINAL        (UserRole.PROJECT_LEAD,   "Dossier final + livraison",         VALIDER_ATTACHEMENT,   false, false),
    FACTURATION          (UserRole.BILLING,        "Facturation",                       DOSSIER_FINAL,         false, false);

    private final UserRole role;
    private final String label;
    private final WorkshopStep refuseTo;
    private final boolean canBlock;
    private final boolean canCancel;

    WorkshopStep(UserRole role, String label, WorkshopStep refuseTo, boolean canBlock, boolean canCancel)
    {
        this.role = role;
        this.label = label;
        this.refuseTo = refuseTo;
        this.canBlock = canBlock;
        this.canCancel = canCancel;
    }

    public UserRole getRole()          { return role; }
    public String getLabel()           { return label; }
    public WorkshopStep getRefuseTo()  { return refuseTo; }
    public boolean canBlock()          { return canBlock; }
    public boolean canCancel()         { return canCancel; }

    // 1 for the first step, as in fix_workshop.md
    public int number()                { return ordinal() + 1; }

    // the technician's steps run as a TaskModel, not with the step buttons
    public boolean isTask()            { return role == UserRole.USER; }

    // the step after this one, null after FACTURATION
    public WorkshopStep next()
    {
        WorkshopStep[] steps = values();
        return ordinal() + 1 < steps.length ? steps[ordinal() + 1] : null;
    }

    // the steps a role acts on with the step buttons (the technician's tasks are left out)
    public static List<WorkshopStep> forRole(UserRole role)
    {
        return Arrays.stream(values()).filter(step -> step.role == role && !step.isTask()).toList();
    }
}
