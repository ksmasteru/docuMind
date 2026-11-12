// The fleet's total flow over the last ten minutes (the pumps running), with its range.
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { MicroLabel, Panel } from "./primitives";
import { clock, num, pct, useChart } from "./tokens";

function FlowTip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
        <div className="rounded-sm border border-border bg-popover px-2.5 py-1.5 font-data text-[11px] shadow-md">
            <p className="text-subtle">{clock(point.ts, true)}</p>
            <p className="mt-0.5 text-foreground">{num(point.flow)} m³/h</p>
        </div>
    );
}

const Stat = ({ label, value }) => (
    <div className="bg-card px-4 py-2.5">
        <MicroLabel as="dt">{label}</MicroLabel>
        <dd className="mt-0.5 font-data text-sm tabular-nums text-foreground">{value}</dd>
    </div>
);

export function FlowPanel({ fleet, className, style }) {
    const CHART = useChart();
    const { history } = fleet;
    const flows = history.map((h) => h.flow);
    const current = flows.at(-1) ?? 0;
    const first = flows[0] ?? current;
    const change = first ? (current - first) / first : 0;
    const avg = flows.length ? flows.reduce((a, b) => a + b, 0) / flows.length : 0;

    return (
        <Panel id="flow" label="Hydraulique" title="Débit total" meta="pompes en marche · 10 min" style={style} className={className}
            action={
                <p className="text-right">
                    <span className="font-data text-xl font-medium tabular-nums text-foreground">{num(current)}</span>
                    <span className="ml-1 text-xs text-subtle">m³/h</span>
                    <span className={cn("ml-3 font-data text-xs tabular-nums", Math.abs(change) < 0.01 ? "text-muted-foreground" : change > 0 ? "text-ok" : "text-warn")}>
                        {change >= 0 ? "+" : "−"}{pct(Math.abs(change))}
                    </span>
                </p>
            }>
            <div className="h-52 px-2 pt-3 sm:h-60">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={CHART.grid} />
                        <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
                            tickFormatter={(ts) => clock(ts)} minTickGap={56} tickLine={false} axisLine={{ stroke: CHART.axis }}
                            tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.font }} />
                        <YAxis width={52} tickFormatter={(v) => num(v)} axisLine={false} tickLine={false} tickCount={4}
                            domain={[(min) => Math.floor((min * 0.98) / 100) * 100, (max) => Math.ceil((max * 1.02) / 100) * 100]}
                            tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.font }} />
                        <Tooltip cursor={{ stroke: CHART.tick, strokeDasharray: "2 3" }} isAnimationActive={false} content={<FlowTip />} />
                        {/* live data: no animation, or the curve would redraw on every tick */}
                        <Area type="monotone" dataKey="flow" stroke={CHART.series} strokeWidth={1.5} fill={CHART.series} fillOpacity={0.07}
                            isAnimationActive={false} dot={false}
                            activeDot={{ r: 3.5, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-px border-t border-border bg-border">
                <Stat label="Min" value={`${num(flows.length ? Math.min(...flows) : 0)} m³/h`} />
                <Stat label="Moyenne" value={`${num(avg)} m³/h`} />
                <Stat label="Max" value={`${num(flows.length ? Math.max(...flows) : 0)} m³/h`} />
            </dl>
        </Panel>
    );
}
