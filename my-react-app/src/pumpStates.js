// What the fleet pages (dashboard, pump page) show for a pump's state and an alert's severity,
// and where a pump model's photo comes from.
import { CircleCheck, CirclePause, OctagonAlert, TriangleAlert, WifiOff, Wrench } from "lucide-react";

// Status colors are the reserved status palette (good / warning / critical), standby the PHOVA
// blue; each always shows with its icon and label, never as color alone.
// phrase: the state inside a sentence ("la pompe est en maintenance")
export const PUMP_STATES = {
    RUNNING:     { label: "En marche",   phrase: "en marche",      icon: CircleCheck,  fill: "bg-[#0ca30c] text-white" },
    STANDBY:     { label: "En réserve",  phrase: "en réserve",     icon: CirclePause,  fill: "bg-[#1A75BC] text-white dark:bg-[#2B9BD3]" },
    MAINTENANCE: { label: "Maintenance", phrase: "en maintenance", icon: Wrench,       fill: "bg-[#fab219] text-slate-950" },
    FAULT:       { label: "En défaut",   phrase: "en défaut",      icon: OctagonAlert, fill: "bg-[#d03b3b] text-white" },
    OFFLINE:     { label: "Hors ligne",  phrase: "hors ligne",     icon: WifiOff,      fill: "bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-100" },
};

export const SEVERITY = {
    critical: { label: "Critique",      icon: OctagonAlert,  style: "bg-[#d03b3b]/10 text-[#d03b3b] dark:bg-[#d03b3b]/20 dark:text-[#f08a8a]" },
    warning:  { label: "Avertissement", icon: TriangleAlert, style: "bg-[#fab219]/15 text-amber-700 dark:bg-[#fab219]/15 dark:text-[#fab219]" },
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
