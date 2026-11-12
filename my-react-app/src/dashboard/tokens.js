// The control console's vocabulary: how a pump state, an alert severity and a reading's zone
// look. High-performance HMI rules: a normal pump stays neutral, color is kept for what needs the
// manager, and a color never comes alone (always an icon or a label with it).
import { CircleCheck, CirclePause, OctagonAlert, TriangleAlert, WifiOff, Wrench } from "lucide-react";
import { LIMITS } from "../fleetSimulator";
import { useTheme } from "../ThemeContext";

// the Tailwind classes of each tone, written out so the build finds them
export const TONE = {
    neutral: { text: "text-foreground",       fill: "bg-foreground/45", rail: "bg-border",  soft: "bg-foreground/5" },
    ok:      { text: "text-ok",               fill: "bg-ok",            rail: "bg-ok",      soft: "bg-ok/10" },
    standby: { text: "text-standby",          fill: "bg-standby",       rail: "bg-standby", soft: "bg-standby/10" },
    warn:    { text: "text-warn",             fill: "bg-warn",          rail: "bg-warn",    soft: "bg-warn/10" },
    crit:    { text: "text-crit",             fill: "bg-crit",          rail: "bg-crit",    soft: "bg-crit/10" },
    offline: { text: "text-offline",          fill: "bg-offline",       rail: "bg-offline", soft: "bg-offline/10" },
};

// short: the table's column, where space is tight
export const STATE = {
    RUNNING:     { label: "En marche",   short: "Marche",   tone: "ok",      icon: CircleCheck },
    STANDBY:     { label: "En réserve",  short: "Réserve",  tone: "standby", icon: CirclePause },
    MAINTENANCE: { label: "Maintenance", short: "Maint.",   tone: "warn",    icon: Wrench },
    FAULT:       { label: "En défaut",   short: "Défaut",   tone: "crit",    icon: OctagonAlert },
    OFFLINE:     { label: "Hors ligne",  short: "Hors l.",  tone: "offline", icon: WifiOff },
};

export const SEVERITY = {
    critical: { label: "Critique",      tone: "crit", icon: OctagonAlert },
    warning:  { label: "Avertissement", tone: "warn", icon: TriangleAlert },
};

// a reading's zone against the twin's limits (ISO 10816-3 for vibrations, the bearing's own)
export const zoneOf = (metric, value) => {
    const limit = LIMITS[metric];
    if (!limit || value == null) return "neutral";
    return value >= limit.crit ? "crit" : value >= limit.warn ? "warn" : "neutral";
};

// the vibration gauge's full scale, a little past the damage limit
export const VIBRATION_SCALE = 9;

const nf = (digits) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formats = [nf(0), nf(1), nf(2)];
// 1234.5 -> "1 234,5"; null -> "—"
export const num = (value, digits = 0) => (value == null || Number.isNaN(value) ? "—" : formats[digits].format(value));
export const pct = (ratio, digits = 1) => `${num(ratio * 100, digits)} %`;
export const clock = (ts, seconds = false) =>
    new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });

// the chart colors, as hex: recharts writes them into SVG attributes, where a CSS variable is not
// reliable. Keep them equal to the tokens in index.css, light and dark.
const CHART_THEME = {
    light: {
        series: "#1a75bc",   // --primary
        grid: "#eceff2",     // a step under --border, so the grid recedes behind the data
        axis: "#e1e4e8",     // --border
        tick: "#5d6773",     // --subtle
        surface: "#ffffff",  // --card
        warn: "#8a5c00",
        crit: "#cf222e",
    },
    dark: {
        series: "#5bc6e8",
        grid: "#1d232a",
        axis: "#262d35",
        tick: "#7d8792",
        surface: "#11151a",
        warn: "#eaa63f",
        crit: "#f47272",
    },
};
const CHART_FONT = "JetBrains Mono Variable, ui-monospace, monospace";

// the chart colors of the current theme
export const useChart = () => {
    const { isDark } = useTheme();
    return { ...CHART_THEME[isDark ? "dark" : "light"], font: CHART_FONT };
};
