// Shared by the manager pages (Technicians, Orders, Review, AssignTask, ReviewReport):
// the same badges, sort order and date formats as the mobile app's Tâche / Ordres / Revue tabs.

// highest first; matches TaskPriority on the backend
export const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export const PRIORITY_LABEL = { URGENT: "Urgente", HIGH: "Haute", NORMAL: "Normale", LOW: "Basse" };

export const PRIORITY_STYLE = {
    URGENT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    HIGH:   "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    NORMAL: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    LOW:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

// TaskType on the backend
export const TASK_TYPES = [
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "PREVENTIVE",  label: "Préventive" },
    { value: "CORRECTIVE",  label: "Corrective" },
];

export const TASK_TYPE_LABEL = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t.label]));

// fallback for a value missing from a label map: "IN_PROGRESS" -> "In progress"
export const humanize = (value) =>
    value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ") : "—";

// by priority, then earliest due date (tasks without a due date last)
export const byPriority = (a, b) => {
    const rank = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    if (rank !== 0) return rank;
    if (!a.dueDate) return b.dueDate ? 1 : 0;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
};

// Date -> "YYYY-MM-DD" in the browser's timezone (toISOString() would use UTC and could shift the day)
export const localIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "2026-10-25" -> "25 oct. 2026", read as a local date for the same reason
export const formatDay = (iso) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
};

// ISO instant -> "24 oct. 2026 à 17:40" in the browser's timezone
export const formatDateTime = (iso) =>
    iso
        ? new Date(iso).toLocaleString("fr-FR", {
              year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })
        : "—";

// 9000 -> "2 h 30", 900 -> "15 min"
export const formatWorked = (seconds) => {
    if (seconds == null) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
};

// Starting a work order on a pump (pump page, dashboard alert): the manager picks the technician on
// the Technicians page, which shows the notice, then the assign form opens with the pump as its
// equipment. alertNumber: the alert case the order answers, linked to it once created.
// For navigate(...newOrderRoute(…)).
export const newOrderRoute = (pumpId, site, reason, alertNumber) => [
    `/technicians?${new URLSearchParams({ equipement: pumpId, ...(alertNumber ? { alerte: alertNumber } : {}) })}`,
    { state: { notice: `Nouvel ordre de travail pour ${pumpId} (${site})${reason ? ` : ${reason}` : ""}. Choisissez le technicien : la pompe sera déjà renseignée comme équipement.` } },
];

// the server says why it refuses (403 for a technician, "user x is not a technician"…)
export const serverMessage = (err, fallback) => err.response?.data?.message || fallback;

export const buttonBase = "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50";

// an active order's status (TaskStatus on the backend); blocked and returned orders stand out
export const ORDER_STATUS = {
    ASSIGNED: { label: "Assigné",     style: "text-slate-500 dark:text-slate-400" },
    STARTED:  { label: "En cours",    style: "text-emerald-700 dark:text-emerald-400" },
    BLOCKED:  { label: "Bloqué",      style: "font-medium text-orange-700 dark:text-orange-400" },
    RETURNED: { label: "À corriger",  style: "font-medium text-red-700 dark:text-red-400" },
};

// an active order past its due date (the due date itself is still on time)
export const isOverdue = (order) => Boolean(order.dueDate && order.dueDate < localIso(new Date()));

// milliseconds -> "à l'instant", "12 min", "3 h 05", "2 j"
export const formatAgo = (ms) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
    return `${Math.floor(hours / 24)} j`;
};

// the same, read as a past moment: "à l'instant", "il y a 12 min"
export const ago = (ms) => (ms < 60000 ? "à l'instant" : `il y a ${formatAgo(ms)}`);

// French plural: 0 and 1 take the singular. plural(3, "ordre ouvert", "ordres ouverts")
export const plural = (n, singular, pluralForm = `${singular}s`) => (n > 1 ? pluralForm : singular);

// 12900 -> "12,9 k"
export const compact = (value) => new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

// The chart colors of the dashboards, light and dark picked separately (dataviz palette checks):
// the PHOVA blue as the single series, darkened from #5BC6E8 on dark so it stays inside the
// readable lightness band; recessive gray for the grid and axes.
const CHART_COLORS = {
    light: { series: "#1A75BC", grid: "#e2e8f0", axis: "#cbd5e1", muted: "#64748b", surface: "#ffffff" },
    dark:  { series: "#2B9BD3", grid: "#334155", axis: "#475569", muted: "#94a3b8", surface: "#1e293b" },
};
export const chartColors = (isDark) => CHART_COLORS[isDark ? "dark" : "light"];
