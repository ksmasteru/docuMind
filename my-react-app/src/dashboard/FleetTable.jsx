// Every pump on one dense table: state, flow, pressure (on wide screens), vibrations on the ISO
// scale, bearing temperature and the last ten minutes of vibrations. Filtered by site and state,
// sorted by severity unless the manager picks a column. A row opens the pump's sheet.
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LIMITS, SITES, effectiveState } from "../fleetSimulator";
import { plural } from "../managerUtils";
import { Panel, Sparkline, StateGlyph, VibrationGauge } from "./primitives";
import { SEVERITY, STATE, TONE, VIBRATION_SCALE, num, zoneOf } from "./tokens";

// worst first: a critical alert, a warning, then the stopped pumps that need someone, then the rest
const severityRank = (row) =>
    row.alert?.severity === "critical" ? 0
    : row.alert ? 1
    : row.state === "FAULT" ? 2
    : row.state === "OFFLINE" ? 3
    : row.state === "MAINTENANCE" ? 4
    : 5;

// an offline pump has no live value: it sorts after every real reading
const live = (key) => (row) => (row.state === "OFFLINE" ? -1 : row.pump.metrics[key]);

const SORTS = {
    severity:  { by: severityRank, first: 1 },
    pumpId:    { by: (row) => row.pump.pumpId, first: 1 },
    flow:      { by: live("flow_m3h"), first: -1 },
    vibration: { by: live("vibration_mms"), first: -1 },
    bearing:   { by: live("bearing_temp_c"), first: -1 },
};

function compare({ key, dir }) {
    const { by } = SORTS[key];
    return (a, b) => {
        const [x, y] = [by(a), by(b)];
        const order = typeof x === "string" ? x.localeCompare(y) : x - y;
        return order * dir || a.pump.pumpId.localeCompare(b.pump.pumpId);
    };
}

// unit: shown from sm up; on a phone the footer note gives the units
function SortHead({ sortKey, sort, onSort, align = "left", unit, className, children }) {
    const active = sort.key === sortKey;
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
        <TableHead className={cn("h-9 px-1.5 sm:px-2.5", align === "right" && "text-right", className)}
            aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
            <button type="button" onClick={() => onSort(sortKey)}
                className={cn("inline-flex items-center gap-1 rounded-sm font-data text-[10px] font-medium uppercase tracking-[0.06em] outline-none transition-colors sm:tracking-[0.12em] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    align === "right" && "flex-row-reverse", active ? "text-foreground" : "text-subtle")}>
                <span>{children}{unit && <span className="hidden sm:inline"> {unit}</span>}</span>
                <Icon aria-hidden="true" className={cn("size-3", active ? "text-primary" : "opacity-50")} />
            </button>
        </TableHead>
    );
}

const PlainHead = ({ className, children }) => (
    <TableHead className={cn("h-9 px-1.5 font-data sm:px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle", className)}>{children}</TableHead>
);

function AlertChip({ alert }) {
    if (!alert) return <span className="font-data text-xs text-subtle" aria-label="Aucune alerte">—</span>;
    const { label, tone, icon: Icon } = SEVERITY[alert.severity];
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0}
                    className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        TONE[tone].soft, TONE[tone].text)}>
                    <Icon className="size-3" aria-hidden="true" />
                    {alert.severity === "critical" ? "Crit." : "Avert."}
                    <span className="sr-only">{label} : {alert.message}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent>{alert.message}</TooltipContent>
        </Tooltip>
    );
}

function PumpRow({ row, selected, onSelect }) {
    const { pump, state, alert } = row;
    const offline = state === "OFFLINE";
    const running = state === "RUNNING";
    const { flow_m3h: flow, pressure_bar: pressure, vibration_mms: vibration, bearing_temp_c: bearing } = pump.metrics;
    const vibZone = offline ? "neutral" : zoneOf("vibration_mms", vibration);
    const bearingZone = offline ? "neutral" : zoneOf("bearing_temp_c", bearing);
    // the left rail: the selection first, else the alert's severity
    const rail = selected ? "var(--primary)" : alert ? `var(--${SEVERITY[alert.severity].tone})` : null;
    // a stopped pump's zeros recede; a reading past a limit takes the zone's color
    const value = (v, digits, zone = "neutral") =>
        offline ? <span className="text-subtle">—</span>
        : <span className={zone !== "neutral" ? cn("font-semibold", TONE[zone].text) : running ? "text-foreground" : "text-subtle"}>{num(v, digits)}</span>;

    return (
        <TableRow data-state={selected ? "selected" : undefined} onClick={() => onSelect(pump.pumpId)}
            className={cn("group cursor-pointer border-border font-data text-xs tabular-nums sm:text-[13px] hover:bg-accent/50 data-[state=selected]:bg-primary/[0.07]",
                offline && "opacity-80")}>
            <TableCell className="py-2 pl-3 pr-1.5 sm:pl-4 sm:pr-2.5" style={rail ? { boxShadow: `inset 2px 0 0 ${rail}` } : undefined}>
                <StateGlyph state={state} compact />
            </TableCell>
            <TableCell className="px-1.5 py-2 sm:px-2.5">
                {/* the keyboard's way in: the row itself is only a mouse target */}
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(pump.pumpId); }}
                    aria-label={`${pump.pumpId}, ${STATE[state].label}${alert ? `, ${alert.message}` : ""}. Ouvrir le détail`}
                    className="rounded-sm font-medium text-foreground outline-none transition-colors group-hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                    {pump.pumpId}
                </button>
            </TableCell>
            <TableCell className="px-1.5 py-2 sm:px-2.5 text-right">{value(flow, 0)}</TableCell>
            <TableCell className="hidden px-1.5 py-2 sm:px-2.5 text-right 2xl:table-cell">{value(pressure, 1)}</TableCell>
            <TableCell className="px-1.5 py-2 sm:px-2.5 text-right">
                <span className="inline-flex items-center justify-end gap-2.5">
                    {!offline && <VibrationGauge value={vibration} zone={vibZone} className="hidden md:block" />}
                    <span className="w-10">{value(vibration, 2, vibZone)}</span>
                </span>
            </TableCell>
            <TableCell className="px-1.5 py-2 sm:px-2.5 text-right">{value(bearing, 1, bearingZone)}</TableCell>
            <TableCell className="hidden px-1.5 py-2 sm:px-2.5 lg:table-cell">
                <Sparkline values={pump.readings.map((r) => r.vibration_mms)} domain={[0, VIBRATION_SCALE]} width={72}
                    threshold={LIMITS.vibration_mms.warn} tone={vibZone === "neutral" ? "neutral" : vibZone}
                    label={`Vibrations de ${pump.pumpId} sur 10 minutes`} />
            </TableCell>
            {/* beside the alerts panel (xl) the row's rail is enough; the chip comes back when there is room */}
            <TableCell className="hidden py-2 pl-2.5 pr-4 md:table-cell xl:hidden 2xl:table-cell">
                <AlertChip alert={alert} />
            </TableCell>
        </TableRow>
    );
}

const STATE_FILTERS = ["RUNNING", "STANDBY", "MAINTENANCE", "FAULT", "OFFLINE"];

export function FleetPanel({ fleet, selectedId, onSelect, className, style }) {
    const [site, setSite] = useState("ALL");
    const [stateFilter, setStateFilter] = useState("ALL");
    const [alertsOnly, setAlertsOnly] = useState(false);
    const [sort, setSort] = useState({ key: "severity", dir: 1 });
    const { pumps, alerts, updatedAt: now } = fleet;

    const worst = new Map();
    for (const alert of alerts) if (!worst.has(alert.pumpId)) worst.set(alert.pumpId, alert); // alerts come worst first
    const rows = pumps.map((pump) => ({ pump, state: effectiveState(pump, now), alert: worst.get(pump.pumpId) }));
    const inSite = site === "ALL" ? rows : rows.filter((r) => r.pump.site === site);
    const stateCount = (state) => inSite.filter((r) => r.state === state).length;
    const shown = inSite
        .filter((r) => (stateFilter === "ALL" || r.state === stateFilter) && (!alertsOnly || r.alert))
        .sort(compare(sort));
    const filtered = stateFilter !== "ALL" || alertsOnly;

    // a new column sorts its natural way first (highest readings, A→Z); the same one flips
    const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: SORTS[key].first }));
    const reset = () => { setStateFilter("ALL"); setAlertsOnly(false); };
    const siteTab = (code, name, count) => (
        <TabsTrigger key={code} value={code}
            className="h-7 flex-none gap-1.5 rounded-sm px-2.5 text-xs data-[state=active]:border-input data-[state=active]:bg-accent data-[state=active]:shadow-none">
            {name} <span className="font-data text-[11px] text-subtle">{count}</span>
        </TabsTrigger>
    );

    return (
        <Panel id="fleet" label="Parc · digital twin" title="État des pompes" style={style} className={className}
            meta={`${shown.length} sur ${rows.length}`}
            action={
                <Tabs value={site} onValueChange={setSite}>
                    <TabsList aria-label="Site" className="h-8 rounded-md border border-border bg-background p-0.5">
                        {siteTab("ALL", "Tous", rows.length)}
                        {SITES.map((s) => siteTab(s.code, s.name, rows.filter((r) => r.pump.site === s.code).length))}
                    </TabsList>
                </Tabs>
            }
            toolbar={
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <ToggleGroup type="single" value={stateFilter} onValueChange={(v) => setStateFilter(v || "ALL")}
                        spacing={1} size="sm" aria-label="Filtrer par état" className="flex-wrap">
                        <ToggleGroupItem value="ALL" className="h-7 rounded-sm px-2 text-xs data-[state=on]:bg-accent data-[state=on]:text-foreground">
                            Tous
                        </ToggleGroupItem>
                        {STATE_FILTERS.map((state) => {
                            const { short, tone } = STATE[state];
                            const count = stateCount(state);
                            return (
                                <ToggleGroupItem key={state} value={state} disabled={count === 0} aria-label={`${STATE[state].label}, ${count}`}
                                    className="h-7 gap-1.5 rounded-sm px-2 text-xs text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground">
                                    <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONE[tone].fill)} />
                                    {short}
                                    <span className="font-data text-[11px] text-subtle">{count}</span>
                                </ToggleGroupItem>
                            );
                        })}
                    </ToggleGroup>
                    <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
                    <Toggle size="sm" pressed={alertsOnly} onPressedChange={setAlertsOnly}
                        className="h-7 gap-1.5 rounded-sm px-2 text-xs text-muted-foreground data-[state=on]:bg-warn/10 data-[state=on]:text-warn">
                        <BellRing aria-hidden="true" className="size-3.5" /> Avec alerte
                    </Toggle>
                    {sort.key !== "severity" && (
                        <Button variant="link" size="xs" className="ml-auto h-7 px-0 text-xs" onClick={() => setSort({ key: "severity", dir: 1 })}>
                            Trier par gravité
                        </Button>
                    )}
                </div>
            }
            footer={
                <p className="font-data text-[10px] uppercase leading-relaxed tracking-[0.1em] text-subtle">
                    <span className="sm:hidden">Débit m³/h · Vib. mm/s · Palier °C<span aria-hidden="true" className="px-2">·</span></span>
                    Vibrations ISO 10816-3 : zone C ≥ {num(LIMITS.vibration_mms.warn, 1)}, D ≥ {num(LIMITS.vibration_mms.crit, 1)} mm/s
                    <span aria-hidden="true" className="px-2">·</span>Palier : {LIMITS.bearing_temp_c.warn} / {LIMITS.bearing_temp_c.crit} °C
                </p>
            }>
            {shown.length === 0 ? (
                <div className="m-4 rounded-md border border-dashed border-border">
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                        <SearchX className="size-5 text-subtle" aria-hidden="true" />
                        <p className="text-sm font-medium text-foreground">Aucune pompe ne correspond</p>
                        <p className="max-w-xs text-xs text-muted-foreground">
                            {alertsOnly ? "Aucune pompe de cette sélection n'a d'alerte ouverte." : "Aucune pompe dans cet état sur ce site."}
                        </p>
                        {filtered && <Button variant="outline" size="sm" className="mt-2" onClick={reset}>Réinitialiser les filtres</Button>}
                    </div>
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                            <SortHead sortKey="severity" sort={sort} onSort={onSort} className="pl-3 sm:pl-4">État</SortHead>
                            <SortHead sortKey="pumpId" sort={sort} onSort={onSort}>Pompe</SortHead>
                            <SortHead sortKey="flow" sort={sort} onSort={onSort} align="right" unit="m³/h">Débit</SortHead>
                            <PlainHead className="hidden text-right 2xl:table-cell">Press. bar</PlainHead>
                            <SortHead sortKey="vibration" sort={sort} onSort={onSort} align="right" unit="mm/s">Vib.</SortHead>
                            <SortHead sortKey="bearing" sort={sort} onSort={onSort} align="right" unit="°C">Palier</SortHead>
                            <PlainHead className="hidden lg:table-cell">Vib. 10 min</PlainHead>
                            <PlainHead className="hidden pr-4 md:table-cell xl:hidden 2xl:table-cell">Alerte</PlainHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shown.map((row) => (
                            <PumpRow key={row.pump.pumpId} row={row} selected={row.pump.pumpId === selectedId}
                                onSelect={onSelect} />
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="sr-only" aria-live="polite">
                {`${shown.length} ${plural(shown.length, "pompe affichée", "pompes affichées")}`}
            </p>
        </Panel>
    );
}
