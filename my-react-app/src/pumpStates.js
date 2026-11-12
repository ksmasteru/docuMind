// What the fleet pages (dashboard, pump page) show for a pump's state and an alert's severity,
// and where a pump model's photo comes from.
import { CircleCheck, CirclePause, OctagonAlert, TriangleAlert, WifiOff, Wrench } from "lucide-react";

// Status colors are the theme's status tokens (index.css: --ok, --standby, --warn, --crit), light
// or dark with the toggle; each always shows with its icon and label, never as color alone.
// text-background: the floor's color, readable on every status fill in both themes.
// phrase: the state inside a sentence ("la pompe est en maintenance")
export const PUMP_STATES = {
    RUNNING:     { label: "En marche",   phrase: "en marche",      icon: CircleCheck,  fill: "bg-ok text-background" },
    STANDBY:     { label: "En réserve",  phrase: "en réserve",     icon: CirclePause,  fill: "bg-standby text-background" },
    MAINTENANCE: { label: "Maintenance", phrase: "en maintenance", icon: Wrench,       fill: "bg-warn text-background" },
    FAULT:       { label: "En défaut",   phrase: "en défaut",      icon: OctagonAlert, fill: "bg-crit text-background" },
    OFFLINE:     { label: "Hors ligne",  phrase: "hors ligne",     icon: WifiOff,      fill: "bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-100" },
};

export const SEVERITY = {
    critical: { label: "Critique",      icon: OctagonAlert,  style: "bg-crit/10 text-crit" },
    warning:  { label: "Avertissement", icon: TriangleAlert, style: "bg-warn/10 text-warn" },
};

// a pump's readings, in the order the pages list them: [key in the twin's metrics, label, unit]
export const METRICS = [
    ["flow_m3h", "Débit", "m³/h"],
    ["pressure_bar", "Pression", "bar"],
    ["speed_rpm", "Vitesse", "tr/min"],
    ["power_kw", "Puissance", "kW"],
    ["vibration_mms", "Vibrations", "mm/s"],
    ["bearing_temp_c", "Palier", "°C"],
];

// Each model's photo, served from public/. The names are written exactly as the files are:
// the production servers are case-sensitive even if the Mac isn't. A model without a photo
// (HDX for now) shows a placeholder.
const PHOTOS = {
    OTC: "/OTC.PNG",
    OTW: "/OTW.png",
    OTS: "/ots.png",
    PHB2: "/phb2.png",
    PHB3: "/phb3.png",
    PHH: "/phh.png",
};

export const pumpPhoto = (model) => PHOTOS[model];
