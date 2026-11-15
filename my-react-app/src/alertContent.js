// What the alert pages say about an alert: its name, the metric its chart shows, and the fixed
// description and recommendation for its kind (vibration, bearing, fault, offline: the kinds
// fleetSimulator.js raises). Fixed text for now; the assistant could write them from the manuals later.
import { LIMITS } from "./fleetSimulator";
import { METRICS } from "./pumpStates";

const fr = (value) => value.toLocaleString("fr-FR");

// a case's status, from the manager's decisions (alertStore.js)
export const ISSUE_STATUS = {
    NEW:          { label: "Nouvelle",        style: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
    ACKNOWLEDGED: { label: "Prise en compte", style: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
    IN_PROGRESS:  { label: "En cours",        style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    RESOLVED:     { label: "Résolue",         style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

// pump, live: the pump's twin data and its current reading; issue: the case (alertStore.js)
export const ALERT_KINDS = {
    vibration: {
        title: "Vibrations élevées",
        metric: "vibration_mms",
        description: (pump) => [
            `Des vibrations élevées sont mesurées sur ${pump.pumpId} : ${fr(pump.metrics.vibration_mms)} mm/s, pour un seuil d'alerte à ${fr(LIMITS.vibration_mms.warn)} mm/s et un seuil critique à ${fr(LIMITS.vibration_mms.crit)} mm/s (ISO 10816-3).`,
            "La hausse est progressive sur plusieurs jours. Cet écart par rapport au fonctionnement habituel peut indiquer un défaut qui s'installe : roulement usé, désalignement, balourd ou desserrage.",
        ],
        recommendation: [
            "Inspecter visuellement la pompe, l'accouplement et les paliers : jeu, usure, desserrage.",
            "Vérifier l'état et la quantité de lubrifiant des roulements ; compléter ou remplacer si nécessaire.",
            "Contrôler l'alignement pompe-moteur et le serrage des fixations (massif, boulons d'ancrage).",
            "Si l'usure d'un roulement est confirmée, planifier son remplacement.",
        ],
        // what the check on site looks at (levée de doute): checks only, no repair
        checks: [
            "Vibrations au toucher et bruit anormal (roulements, accouplement)",
            "Jeu, usure ou desserrage visibles sur l'accouplement et les paliers",
            "Serrage des fixations : massif, boulons d'ancrage",
            "Lubrifiant des roulements : niveau et état",
        ],
    },
    bearing: {
        title: "Palier chaud",
        metric: "bearing_temp_c",
        description: (pump) => [
            `La température du palier de ${pump.pumpId} atteint ${fr(pump.metrics.bearing_temp_c)} °C, pour un seuil d'alerte à ${LIMITS.bearing_temp_c.warn} °C et un seuil critique à ${LIMITS.bearing_temp_c.crit} °C.`,
            "Un palier qui chauffe lentement signale souvent un problème de lubrification, une charge anormale ou un roulement qui se dégrade.",
        ],
        recommendation: [
            "Vérifier le niveau et l'état du lubrifiant : un excès de graisse chauffe autant qu'un manque.",
            "Contrôler le refroidissement du palier, s'il en a un.",
            "Vérifier le point de fonctionnement de la pompe (vanne de refoulement, débit) et l'alignement.",
            "Mesurer les vibrations au palier pour écarter un roulement dégradé.",
        ],
        checks: [
            "Lubrifiant du palier : niveau et état (excès ou manque)",
            "Refroidissement du palier, s'il en a un",
            "Vanne de refoulement et débit : point de fonctionnement normal ?",
            "Bruit ou vibration anormale au palier",
        ],
    },
    fault: {
        title: "Arrêt sur défaut",
        metric: "vibration_mms",
        description: (pump, issue) => [
            `${pump.pumpId} s'est arrêtée sur défaut le ${new Date(issue.raisedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Le digital twin ne précise pas la cause.`,
            "Les vibrations ont fortement augmenté dans les heures précédant l'arrêt.",
        ],
        recommendation: [
            "Relever le défaut affiché sur l'armoire de commande avant tout redémarrage.",
            "Vérifier la protection moteur (relais thermique, disjoncteur) et l'alimentation.",
            "Contrôler que la pompe tourne librement à la main, sans point dur.",
            "Ne redémarrer qu'une fois la cause identifiée.",
        ],
        checks: [
            "La pompe est-elle réellement à l'arrêt ?",
            "Défaut affiché sur l'armoire de commande (le noter)",
            "Protection moteur : relais thermique, disjoncteur",
            "La pompe tourne-t-elle librement à la main, sans point dur ?",
        ],
    },
    offline: {
        title: "Perte de communication",
        metric: "flow_m3h",
        description: (pump) => [
            `Le digital twin ne reçoit plus de données de ${pump.pumpId}.`,
            "La pompe peut très bien fonctionner : c'est la remontée d'informations qui est coupée (capteur, passerelle ou réseau du site).",
        ],
        recommendation: [
            "Vérifier l'alimentation et le câblage du capteur ou de la passerelle.",
            "Contrôler la connexion réseau du site.",
            "Faire constater sur place l'état réel de la pompe.",
        ],
        checks: [
            "État réel de la pompe : en marche, débit visible ?",
            "Alimentation et câblage du capteur ou de la passerelle",
            "Voyants de la passerelle et connexion réseau du site",
        ],
    },
    // a fault a technician reported on site (FieldAlerts.jsx): no metric, his own words
    field: {
        title: "Panne signalée",
        metric: null,
        description: (pump, issue) => [
            `${issue.report?.byName ?? "Un technicien"} a signalé une panne sur ${issue.pumpId}${issue.report?.equipmentModel ? ` (${issue.report.equipmentModel})` : ""} : ${issue.report?.title ?? issue.message}.`,
            ...(issue.report?.description ? [issue.report.description] : []),
        ],
        recommendation: [
            "Lire le rapport du technicien et ses photos.",
            "Décider : ordre de travail sur site, envoi en atelier, ou surveillance.",
        ],
        checks: [],
    },
};

// the title of a case: a report's own title, else its kind's
export const caseTitle = (issue) => issue.report?.title ?? ALERT_KINDS[issue.kind]?.title ?? issue.message ?? "Alerte";

// a technician's verdict after checking the pump (AlertVerdict)
export const VERDICT = {
    CONFIRMED:   { label: "Confirmée",     verb: "a confirmé l'alerte sur place", tone: "crit" },
    FALSE_ALARM: { label: "Fausse alerte", verb: "a signalé une fausse alerte",   tone: "ok" },
};

// a request to intervene, as the manager answered it (AlertRequestStatus)
export const REQUEST_STATUS = {
    PENDING:  { label: "En attente", tone: "warn" },
    ACCEPTED: { label: "Acceptée",   tone: "ok" },
    REFUSED:  { label: "Refusée",    tone: "offline" },
};

// ---------- the check before acting (levée de doute) ----------

const METRIC_INFO = Object.fromEntries(METRICS.map(([key, label, unit]) => [key, { label, unit }]));

// The points a check suggests for an alert (CheckOrder.jsx, FieldAlerts.jsx): a photo of the pump, the
// reading the alert is about (with what the twin reads now and its limits), then the kind's checks.
// pump: the twin's pump (useFleet), null when it isn't in the fleet
export function suggestedPoints(issue, pump) {
    const kind = ALERT_KINDS[issue.kind];
    const points = [{ label: "Photo d'ensemble de la pompe", kind: "STATE", photoRequired: true }];
    const metric = kind?.metric && issue.kind !== "offline" && issue.kind !== "fault" ? kind.metric : null;
    if (metric) {
        const info = METRIC_INFO[metric];
        const limits = LIMITS[metric];
        points.push({
            label: `${info?.label === "Palier" ? "Température du palier" : info?.label ?? metric} : relevé sur place`,
            kind: "MEASURE", unit: info?.unit ?? null,
            twinValue: pump?.metrics?.[metric] ?? null,
            warnLimit: limits?.warn ?? null, critLimit: limits?.crit ?? null,
        });
    }
    (kind?.checks ?? []).forEach((label) => points.push({ label, kind: "STATE" }));
    // it comes back after a false alarm: one point about what was found then
    const repeat = repeatPoint(issue.recurrence);
    if (repeat) points.push(repeat);
    return points.map((p) => ({ unit: null, twinValue: null, warnLimit: null, critLimit: null, photoRequired: false, custom: false, ...p }));
}

// "le 10/11"
const shortDay = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

// the point a repeat adds, from the cause of the false alarm it follows (null when none or no cause)
function repeatPoint(recurrence) {
    if (!recurrence?.cause) return null;
    const when = recurrence.closedAt ? `le ${shortDay(recurrence.closedAt)}` : "la dernière fois";
    if (recurrence.cause === "SENSOR_FAULT")
        return { label: `Capteur : état, fixation, câblage (jugé défaillant ${when}, alerte #${recurrence.number})`, kind: "STATE", photoRequired: true };
    if (recurrence.cause === "PUMP_OK")
        return { label: `Comparer avec le relevé fait ${when} (alerte #${recurrence.number})`, kind: "STATE" };
    return { label: `Conditions de marche par rapport à ${when === "la dernière fois" ? "la dernière fois" : when.replace("le ", "celles du ")} (alerte #${recurrence.number})`, kind: "STATE" };
}

// what a repeat says, in one line: "Déjà classée fausse alerte le 10/11 par Ali (#12, capteur défaillant)";
// by: name who checked it
export function repeatSummary(recurrence, { by = false } = {}) {
    if (!recurrence) return null;
    const cause = { SENSOR_FAULT: "capteur défaillant", PUMP_OK: "pompe en bon état", OPERATING_CONDITIONS: "conditions de marche normales" }[recurrence.cause];
    return `Déjà classée fausse alerte${recurrence.closedAt ? ` le ${shortDay(recurrence.closedAt)}` : ""}`
        + (by && recurrence.technicianName ? ` par ${recurrence.technicianName}` : "")
        + ` (#${recurrence.number}${cause ? `, ${cause}` : ""})`
        + (recurrence.count > 1 ? ` · ${recurrence.count} fausses alertes en 30 jours` : "");
}

// where the check stands on an alert (AlertVerification)
export const VERIFICATION_STATE = {
    TO_CHECK:      { label: "À vérifier",            short: "À vérifier",   tone: "warn" },
    CHECK_ORDERED: { label: "Vérification en cours", short: "En vérif.",    tone: "standby" },
    CONFIRMED:     { label: "Confirmée sur place",   short: "Confirmée",    tone: "crit" },
    FALSE_ALARM:   { label: "Fausse alerte ?",       short: "Fausse ?",     tone: "ok" },
    INCONCLUSIVE:  { label: "Non concluante",        short: "Non concl.",   tone: "warn" },
};

// a check report's conclusion (CheckVerdict)
export const CHECK_VERDICT = {
    CONFIRMED:    { label: "Alerte confirmée", hint: "Le défaut est bien là.",                     tone: "crit" },
    FALSE_ALARM:  { label: "Fausse alerte",    hint: "Rien d'anormal sur la pompe.",               tone: "ok" },
    INCONCLUSIVE: { label: "Non concluant",    hint: "Impossible de conclure pour l'instant.",     tone: "warn" },
};

export const FALSE_ALARM_CAUSE = {
    PUMP_OK:              "Pompe en bon état, mesure normale sur place",
    SENSOR_FAULT:         "Capteur ou transmission défaillant",
    OPERATING_CONDITIONS: "Conditions d'exploitation normales (démarrage, essai…)",
};

export const INCONCLUSIVE_REASON = {
    NO_ACCESS:    "Pas d'accès à la pompe",
    MISSING_TOOL: "Il manque un outil ou un appareil de mesure",
    PUMP_STOPPED: "Pompe à l'arrêt pour une autre raison",
    OTHER:        "Autre",
};

export const CANNOT_HANDLE_REASON = {
    SKILLS:        "Compétence (électricien, spécialiste…)",
    TOOLS_LIFTING: "Outillage ou levage",
    PARTS:         "Pièces à commander d'abord",
    WORKSHOP:      "La pompe doit partir en atelier",
    OTHER:         "Autre",
};

export const ARRIVAL_STATE = {
    RUNNING:    "En marche",
    STOPPED:    "À l'arrêt",
    LOCKED_OUT: "Consignée",
};

export const CHECK_RESULT = {
    OK:            { label: "Conforme",       tone: "ok" },
    ANOMALY:       { label: "Anomalie",       tone: "crit" },
    NOT_CHECKABLE: { label: "Non vérifiable", tone: "offline" },
};

// why an alert was closed (AlertCloseReason)
export const CLOSE_REASON = {
    FALSE_ALARM:             "Fausse alerte confirmée",
    FIXED:                   "Réparée",
    REPAIRED_BY_THIRD_PARTY: "Réparée par un tiers",
    PLANNED_SHUTDOWN:        "Planifiée au prochain arrêt",
    RISK_ACCEPTED:           "Risque accepté",
    OTHER:                   "Autre",
};

// a measure against the twin's limits: "ok" | "warn" | "crit" | null
export const readingTone = (value, warn, crit) =>
    value == null ? null : crit != null && value >= crit ? "crit" : warn != null && value >= warn ? "warn" : "ok";
