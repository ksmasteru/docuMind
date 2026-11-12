// One pump, opened from the fleet table or an alert: its live readings against their limits, the
// last ten minutes of vibrations and bearing temperature, its open alerts and its asset data, with
// the manager's next steps (a work order, the full pump page).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, ClipboardPlus, Copy, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LIMITS, NOMINAL_FLOW, effectiveState } from "../fleetSimulator";
import { METRICS } from "../pumpStates";
import { ago, formatAgo, formatDay } from "../managerUtils";
import { MicroLabel, StateGlyph } from "./primitives";
import { SEVERITY, TONE, clock, num, useChart, zoneOf } from "./tokens";

const DIGITS = { flow_m3h: 0, pressure_bar: 2, speed_rpm: 0, power_kw: 1, vibration_mms: 2, bearing_temp_c: 1 };

function ChartTip({ active, payload, unit, digits }) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
        <div className="rounded-sm border border-border bg-background px-2 py-1 font-data text-[11px] shadow-md">
            <span className="text-subtle">{clock(point.ts, true)}</span>{" "}
            <span className="text-foreground">{num(payload[0].value, digits)} {unit}</span>
        </div>
    );
}

// one reading over the last ten minutes, with its warning and damage limits
function LimitChart({ readings, metric, unit, digits, label }) {
    const CHART = useChart();
    const { warn, crit } = LIMITS[metric];
    const values = readings.map((r) => r[metric]);
    const top = Math.max(crit * 1.1, ...values);
    return (
        <figure>
            <figcaption className="flex items-baseline justify-between">
                <MicroLabel as="span">{label} · 10 min</MicroLabel>
                <span className="font-data text-[10px] text-subtle">
                    <span className="text-warn">— {num(warn, 1)}</span> <span className="text-crit">— {num(crit, 1)}</span> {unit}
                </span>
            </figcaption>
            <div className="mt-2 h-24">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={readings} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
                        <YAxis width={34} domain={[0, Math.ceil(top)]} tickCount={3} axisLine={false} tickLine={false}
                            tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.font }} />
                        <ReferenceLine y={warn} stroke={CHART.warn} strokeOpacity={0.6} strokeDasharray="3 3" />
                        <ReferenceLine y={crit} stroke={CHART.crit} strokeOpacity={0.6} strokeDasharray="3 3" />
                        <Tooltip cursor={{ stroke: CHART.axis }} isAnimationActive={false}
                            content={<ChartTip unit={unit} digits={digits} />} />
                        {/* live data: no animation, or the line would redraw on every tick */}
                        <Line dataKey={metric} type="monotone" stroke={CHART.series} strokeWidth={1.5} dot={false}
                            isAnimationActive={false} activeDot={{ r: 3, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </figure>
    );
}

function PumpDetail({ pump, fleet, onCreateOrder }) {
    const now = fleet.updatedAt;
    const state = effectiveState(pump, now);
    const offline = state === "OFFLINE";
    const alerts = fleet.alerts.filter((a) => a.pumpId === pump.pumpId);

    const copyId = () =>
        navigator.clipboard.writeText(pump.pumpId)
            .then(() => toast.success(`${pump.pumpId} copié`, { description: "À coller comme équipement d'un ordre de travail." }))
            .catch(() => toast.error("Copie impossible", { description: "Le navigateur a refusé l'accès au presse-papiers." }));

    return (
        <>
            <SheetHeader className="gap-0 border-b border-border px-5 pb-4 pt-5">
                <MicroLabel>Pompe · {pump.siteName}</MicroLabel>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pr-8">
                    <SheetTitle className="font-data text-xl font-medium tracking-tight">{pump.pumpId}</SheetTitle>
                    <StateGlyph state={state} />
                </div>
                <SheetDescription className="mt-1 text-xs">
                    Modèle {pump.model} · nominal {num(NOMINAL_FLOW[pump.model])} m³/h · dernière mesure {ago(now - pump.ts)}
                </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {offline && (
                    <p className="flex items-start gap-2 rounded-sm border border-border bg-offline/10 px-3 py-2 text-xs text-muted-foreground">
                        <WifiOff className="mt-px size-3.5 shrink-0 text-offline" aria-hidden="true" />
                        Plus de données depuis {formatAgo(now - pump.ts)}. Les valeurs ci-dessous sont les dernières reçues.
                    </p>
                )}

                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3">
                    {METRICS.map(([key, name, unit]) => {
                        const zone = offline ? "neutral" : zoneOf(key, pump.metrics[key]);
                        return (
                            <div key={key} className="bg-popover px-3 py-2.5">
                                <MicroLabel as="dt">{name}</MicroLabel>
                                <dd className={cn("mt-1 font-data text-lg tabular-nums leading-none",
                                    offline ? "text-subtle" : zone === "neutral" ? "text-foreground" : cn("font-semibold", TONE[zone].text))}>
                                    {num(pump.metrics[key], DIGITS[key])}
                                    <span className="ml-1 text-[11px] font-normal text-subtle">{unit}</span>
                                </dd>
                            </div>
                        );
                    })}
                </dl>

                {pump.readings.length > 1 ? (
                    <div className="space-y-5">
                        <LimitChart readings={pump.readings} metric="vibration_mms" unit="mm/s" digits={2} label="Vibrations" />
                        <LimitChart readings={pump.readings} metric="bearing_temp_c" unit="°C" digits={1} label="Palier" />
                    </div>
                ) : (
                    <p className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                        Aucune mesure en direct depuis l'ouverture de la page.
                    </p>
                )}

                <section aria-label="Alertes de la pompe">
                    <MicroLabel>Alertes ouvertes · {alerts.length}</MicroLabel>
                    {alerts.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">Aucune : la pompe est dans ses limites.</p>
                    ) : (
                        <ul className="mt-2 space-y-1.5">
                            {alerts.map((a) => {
                                const { tone, icon: Icon, label } = SEVERITY[a.severity];
                                return (
                                    <li key={a.id} className={cn("flex items-start gap-2 rounded-sm px-2.5 py-2 text-xs", TONE[tone].soft)}>
                                        <Icon className={cn("mt-px size-3.5 shrink-0", TONE[tone].text)} aria-hidden="true" />
                                        <span className="text-foreground"><span className="sr-only">{label} : </span>{a.message}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section aria-label="Fiche de l'équipement">
                    <MicroLabel>Équipement</MicroLabel>
                    <dl className="mt-2 divide-y divide-border text-xs">
                        {[
                            ["N° de série", pump.serial],
                            ["Mise en service", formatDay(pump.commissionedOn)],
                            ["Heures de marche", `${num(pump.runningHours)} h`],
                        ].map(([term, value]) => (
                            <div key={term} className="flex justify-between gap-4 py-1.5">
                                <dt className="text-muted-foreground">{term}</dt>
                                <dd className="font-data tabular-nums text-foreground">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>

            <SheetFooter className="flex-row flex-wrap gap-2 border-t border-border px-5 py-4">
                <Button size="sm" onClick={() => onCreateOrder(pump.pumpId, pump.siteName, alerts[0]?.message)}>
                    <ClipboardPlus aria-hidden="true" /> Créer un ordre de travail
                </Button>
                <Button size="sm" variant="outline" asChild className="border-border bg-transparent">
                    <Link to={`/pumps?pompe=${pump.pumpId}`}>Fiche complète <ArrowUpRight aria-hidden="true" /></Link>
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={copyId} aria-label={`Copier ${pump.pumpId}`} className="ml-auto text-muted-foreground">
                    <Copy aria-hidden="true" />
                </Button>
            </SheetFooter>
        </>
    );
}

// pumpId: the open pump, null when closed. The last one stays rendered while the sheet slides out.
export function PumpSheet({ fleet, pumpId, onClose, onCreateOrder }) {
    const [shownId, setShownId] = useState(pumpId);
    if (pumpId && pumpId !== shownId) setShownId(pumpId);
    const pump = fleet.pumps.find((p) => p.pumpId === (pumpId ?? shownId));

    return (
        <Sheet open={Boolean(pumpId)} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full gap-0 border-border bg-popover p-0 font-ui text-foreground sm:max-w-md">
                {pump && <PumpDetail pump={pump} fleet={fleet} onCreateOrder={onCreateOrder} />}
            </SheetContent>
        </Sheet>
    );
}
