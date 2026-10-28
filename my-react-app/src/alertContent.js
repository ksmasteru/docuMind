// What the alert pages say about an alert: its name, the metric its chart shows, and the fixed
// description and recommendation for its kind (vibration, bearing, fault, offline: the kinds
// fleetSimulator.js raises). Fixed text for now; the assistant could write them from the manuals later.
import { LIMITS } from "./fleetSimulator";

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
    },
};
