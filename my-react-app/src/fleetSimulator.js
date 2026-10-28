// A simulated digital-twin feed for the manager dashboard, until the real twin is connected.
//
// Every tick, each pump that is online sends one reading in the shape proposed for the twin:
//   { pumpId, ts, state, metrics: { flow_m3h, pressure_bar, speed_rpm, power_kw, vibration_mms, bearing_temp_c } }
// The dashboard reads it through useFleet(). When the backend streams the twin (SSE), only this
// file's source should change: the snapshot it hands to the pages stays the same.
//
// Pump ids (model-site-number) stand in for the twin's own ids, which tasks' equipmentId will
// have to match.
import { useSyncExternalStore } from "react";

const TICK_MS = 5000;
const HISTORY_POINTS = 120; // 10 min of total flow, and of each pump's readings, at one point per tick

// a pump that sent nothing for this long is offline, whatever its last state was
export const OFFLINE_AFTER_MS = 2 * 60 * 1000;

// ISO 10816-3 vibration zones for large pumps: C (restricted) from 4.5 mm/s, D (damage) from 7.1
const VIBRATION_WARN = 4.5;
const VIBRATION_CRIT = 7.1;
const BEARING_WARN = 75;
const BEARING_CRIT = 85;

// the limits above per metric, for the pump page's charts
export const LIMITS = {
    vibration_mms: { warn: VIBRATION_WARN, crit: VIBRATION_CRIT },
    bearing_temp_c: { warn: BEARING_WARN, crit: BEARING_CRIT },
};

// PHOVA's worksites (User.worksite on the backend)
export const SITES = [
    { code: "J", name: "Jorf" },
    { code: "S", name: "Safi" },
];

// nominal flow (m³/h) per PumpType on the backend
export const NOMINAL_FLOW = { OTW: 450, OTC: 300, OTS: 250, PHB2: 600, PHB3: 800, PHH: 200, HDX: 350 };

// the fleet as the twin would describe it; state is where each pump starts
const FLEET = [
    ["J", "OTW", "RUNNING"], ["J", "OTW", "RUNNING"], ["J", "PHB3", "RUNNING"], ["J", "PHB3", "RUNNING"],
    ["J", "PHB2", "STANDBY"], ["J", "HDX", "RUNNING"], ["J", "PHB3", "RUNNING", "degrading"], ["J", "OTC", "MAINTENANCE"],
    ["J", "HDX", "RUNNING"], ["J", "OTC", "STANDBY"], ["J", "PHB3", "OFFLINE"], ["J", "OTW", "RUNNING"],
    ["S", "OTS", "RUNNING"], ["S", "OTS", "RUNNING"], ["S", "PHH", "RUNNING"], ["S", "PHH", "STANDBY"],
    ["S", "PHB2", "RUNNING"], ["S", "PHB2", "FAULT"], ["S", "OTW", "RUNNING"], ["S", "HDX", "RUNNING", "hot"],
    ["S", "HDX", "RUNNING"], ["S", "OTC", "RUNNING"], ["S", "OTW", "MAINTENANCE"], ["S", "OTW", "RUNNING"],
];

// seeded so the fleet looks the same on every load
function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const random = mulberry32(2026);
const between = (min, max) => min + random() * (max - min);
// moves a value a little, pulled back toward its target so it never drifts away
const drift = (value, target, spread) => value + (target - value) * 0.2 + between(-spread, spread);
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
// 6.35 -> "6,35", for the alert messages
const fr = (value) => value.toLocaleString("fr-FR");

function stoppedMetrics() {
    return { flow_m3h: 0, pressure_bar: 0, speed_rpm: 0, power_kw: 0,
        vibration_mms: round(between(0.1, 0.3)), bearing_temp_c: round(between(28, 32)) };
}

function runningMetrics(pump, previous) {
    const nominal = NOMINAL_FLOW[pump.model];
    const prev = previous?.flow_m3h ? previous : null;
    const flow = drift(prev?.flow_m3h ?? nominal * 0.92, nominal * 0.92, nominal * 0.02);
    let vibration = drift(prev?.vibration_mms ?? 2.2, 2.2, 0.15);
    let bearing = drift(prev?.bearing_temp_c ?? 60, 60, 0.8);
    // the two pumps the story is about: one whose bearing wears, one running hot
    if (pump.trouble === "degrading") vibration = Math.min((prev?.vibration_mms ?? 5.8) + between(0, 0.012), 7.6);
    if (pump.trouble === "hot") bearing = drift(prev?.bearing_temp_c ?? 77, 78, 0.6);
    return {
        flow_m3h: round(flow),
        pressure_bar: round(drift(prev?.pressure_bar ?? 8, 8, 0.15), 2),
        speed_rpm: Math.round(drift(prev?.speed_rpm ?? 1480, 1480, 4)),
        power_kw: round(flow * 0.29 + between(-2, 2)),
        vibration_mms: round(vibration, 2),
        bearing_temp_c: round(bearing),
    };
}

// one twin message per online pump; an offline pump keeps its last reading and its old ts.
// readings: the pump's own last 10 minutes, for its page
function readingFor(pump, ts) {
    if (pump.offline) return pump;
    // a standby pump is started now and then, and a running one stopped, as operators would
    let state = pump.state;
    if (!pump.trouble && state === "RUNNING" && random() < 0.0008) state = "STANDBY";
    else if (state === "STANDBY" && random() < 0.002) state = "RUNNING";
    const metrics = state === "RUNNING" ? runningMetrics(pump, pump.metrics) : stoppedMetrics();
    const runningHours = pump.runningHours + (state === "RUNNING" ? TICK_MS / 3600000 : 0);
    const readings = [...pump.readings, { ts, ...metrics }].slice(-HISTORY_POINTS);
    return { ...pump, ts, state, metrics, runningHours, readings };
}

// what the alerts list shows, worst first; `since` is kept from the first tick an alert was seen,
// or taken from the pump's week when the alert was already on before the feed started
function alertsFor(pumps, now, previous) {
    const firstSeen = new Map(previous.map((a) => [a.id, a.since]));
    const alerts = [];
    const raise = (pump, kind, severity, message) => {
        const id = `${pump.pumpId}:${kind}`;
        alerts.push({ id, pumpId: pump.pumpId, site: pump.siteName, severity, message, since: firstSeen.get(id) ?? pump.since?.[kind] ?? now });
    };
    for (const pump of pumps) {
        if (now - pump.ts > OFFLINE_AFTER_MS) {
            raise(pump, "offline", "warning", `Aucune donnée depuis ${Math.round((now - pump.ts) / 60000)} min`);
            continue;
        }
        if (pump.state === "FAULT") raise(pump, "fault", "critical", "Arrêt sur défaut");
        const { vibration_mms: vib, bearing_temp_c: temp } = pump.metrics;
        if (vib >= VIBRATION_CRIT) raise(pump, "vibration", "critical", `Vibrations à ${fr(vib)} mm/s, seuil ${fr(VIBRATION_CRIT)}`);
        else if (vib >= VIBRATION_WARN) raise(pump, "vibration", "warning", `Vibrations en hausse, ${fr(vib)} mm/s`);
        if (temp >= BEARING_CRIT) raise(pump, "bearing", "critical", `Palier à ${fr(temp)} °C, seuil ${BEARING_CRIT}`);
        else if (temp >= BEARING_WARN) raise(pump, "bearing", "warning", `Palier chaud, ${fr(temp)} °C`);
    }
    const rank = { critical: 0, warning: 1 };
    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.since - b.since);
}

const HOUR = 3600 * 1000;
const WEEK_HOURS = 7 * 24;

// The pump's last 7 days, one reading an hour up to `end` (where the live feed starts), told by its
// story: steady for most, on and off for a standby pump, the wear on the degrading one, the heat on
// the hot one, a vibration spike before the faulty one tripped. since: when each alert the pump has
// at the start began, read from that week.
function weekTrend(pump, scenario, end) {
    const nominal = NOMINAL_FLOW[pump.model];
    const faultAt = end - 3.3 * HOUR;
    const stoppedAt = end - 30 * HOUR; // for maintenance
    const trend = [];
    const since = {};
    for (let i = 0; i <= WEEK_HOURS; i++) {
        const ts = end - (WEEK_HOURS - i) * HOUR;
        if (ts > pump.ts) break; // an offline pump's data stops at its last reading
        const t = i / WEEK_HOURS; // 0 a week ago, 1 now
        const hour = new Date(ts).getHours();
        const running =
            scenario === "FAULT" ? ts < faultAt
            : scenario === "MAINTENANCE" ? ts < stoppedAt
            : scenario === "STANDBY" ? Math.floor(i / 24) % 2 === 0 && hour >= 6 && hour < 16
            : true;
        if (!running) {
            const { flow_m3h, pressure_bar, vibration_mms, bearing_temp_c } = stoppedMetrics();
            trend.push({ ts, flow_m3h, pressure_bar, vibration_mms, bearing_temp_c });
            continue;
        }
        let vibration = 2.2 + between(-0.15, 0.15);
        let bearing = 60 + between(-1, 1);
        if (pump.trouble === "degrading") vibration = 2.2 + 3.6 * t ** 2.2 + between(-0.1, 0.1);
        if (pump.trouble === "hot") bearing = 61 + 16 * t ** 1.8 + between(-0.5, 0.5);
        if (scenario === "FAULT" && ts > faultAt - 6 * HOUR) vibration = 2.4 + 6.5 * ((ts - (faultAt - 6 * HOUR)) / (6 * HOUR)) ** 2;
        trend.push({
            ts,
            flow_m3h: round(nominal * 0.92 * (1 + 0.04 * Math.sin((2 * Math.PI * hour) / 24)) + between(-5, 5)),
            pressure_bar: round(8 + between(-0.15, 0.15), 2),
            vibration_mms: round(vibration, 2),
            bearing_temp_c: round(bearing),
        });
        if (vibration >= VIBRATION_WARN) since.vibration ??= ts;
        if (bearing >= BEARING_WARN) since.bearing ??= ts;
    }
    if (scenario === "FAULT") since.fault = faultAt;
    if (pump.offline) since.offline = pump.ts + OFFLINE_AFTER_MS;
    return { trend, since };
}

// the status a page shows: no recent reading means offline, whatever the last state said
export const effectiveState = (pump, now) => (now - pump.ts > OFFLINE_AFTER_MS ? "OFFLINE" : pump.state);

function buildSnapshot(pumps, history, now, previousAlerts) {
    const counts = { RUNNING: 0, STANDBY: 0, MAINTENANCE: 0, FAULT: 0, OFFLINE: 0 };
    for (const pump of pumps) counts[effectiveState(pump, now)]++;
    return {
        pumps,
        history,
        counts,
        // running or ready to run, out of the whole fleet
        availability: (counts.RUNNING + counts.STANDBY) / pumps.length,
        alerts: alertsFor(pumps, now, previousAlerts),
        updatedAt: now,
        simulated: true,
    };
}

// ---- the store: one shared feed for every page, ticking while someone listens ----

let snapshot = null;
let timer = null;
const listeners = new Set();

function tick(now) {
    const pumps = snapshot.pumps.map((pump) => readingFor(pump, now));
    const flow = pumps.reduce((sum, p) => sum + (p.state === "RUNNING" && !p.offline ? p.metrics.flow_m3h : 0), 0);
    const history = [...snapshot.history, { ts: now, flow: Math.round(flow) }].slice(-HISTORY_POINTS);
    snapshot = buildSnapshot(pumps, history, now, snapshot.alerts);
}

// runs the ticks missed since the last one (the first time: the last 10 minutes), so the
// history has no gap after the feed was paused
function catchUp() {
    const now = Date.now();
    if (!snapshot) {
        const start = now - HISTORY_POINTS * TICK_MS;
        const counters = {};
        const pumps = FLEET.map(([site, model, state, trouble]) => {
            counters[site] = (counters[site] ?? 0) + 1;
            const pumpId = `${model}-${site}-${String(counters[site]).padStart(2, "0")}`;
            const siteName = SITES.find((s) => s.code === site).name;
            const offline = state === "OFFLINE";
            // the asset data the twin would hold with each pump
            const commissioned = 2015 + Math.floor(between(0, 9));
            const pump = {
                pumpId, model, site, siteName, trouble, offline,
                serial: `${model}-${commissioned}-${Math.floor(between(1000, 10000))}`,
                commissionedOn: `${commissioned}-${String(1 + Math.floor(between(0, 12))).padStart(2, "0")}-01`,
                runningHours: Math.round(between(0.45, 0.7) * (2026 - commissioned) * 8760),
                readings: [],
                // an offline pump last reported 14 minutes before the feed started
                state: offline ? "RUNNING" : state,
                ts: offline ? start - 14 * 60 * 1000 : start,
                metrics: offline ? runningMetrics({ model }) : stoppedMetrics(),
            };
            // trend: the hourly week before the live feed, for the alert page
            return { ...pump, ...weekTrend(pump, state, start) };
        });
        snapshot = { pumps, history: [], alerts: [] };
    }
    const last = snapshot.updatedAt ?? now - (HISTORY_POINTS + 1) * TICK_MS;
    const missed = Math.min(Math.floor((now - last) / TICK_MS), HISTORY_POINTS);
    for (let i = missed - 1; i >= 0; i--) tick(now - i * TICK_MS);
}

function subscribe(listener) {
    listeners.add(listener);
    if (!timer) {
        catchUp();
        timer = setInterval(() => {
            tick(Date.now());
            listeners.forEach((l) => l());
        }, TICK_MS);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            clearInterval(timer);
            timer = null;
        }
    };
}

function getSnapshot() {
    if (!snapshot) catchUp();
    return snapshot;
}

// { pumps, history: [{ ts, flow }], counts, availability, alerts, updatedAt, simulated }
export const useFleet = () => useSyncExternalStore(subscribe, getSnapshot);
