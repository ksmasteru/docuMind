// The dashboard's maintenance panels, from GreenSense's own data (the same endpoints as the
// Orders, Review and Technicians pages): the open work orders, each technician's load, and the
// reports waiting for review.
import { Link } from "react-router-dom";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleCheck, OctagonAlert } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { Card, ChartTooltip, PriorityBadge } from "./managerUi";
import { ORDER_STATUS, ago, byPriority, chartColors, formatDay, isOverdue, plural } from "./managerUtils";

const ViewAll = ({ to, children = "Tout voir" }) => (
    <Link to={to} className="shrink-0 text-xs font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">{children} →</Link>
);

const PanelSkeleton = ({ rows = 4 }) => (
    <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700/50" />)}
    </div>
);

// the technician's name when the technicians list has it, else the email
const nameOf = (names, email) => names.get(email) ?? email ?? "Non assigné";

// ---- work orders ----

// why an order needs the manager: blocked or returned first, then late
const attentionReason = (order) =>
    order.status === "BLOCKED" ? "Bloqué"
    : order.status === "RETURNED" ? "À corriger"
    : isOverdue(order) ? `En retard depuis le ${formatDay(order.dueDate)}`
    : null;

export function OrdersCard({ orders, names, className }) {
    const needsAttention = (orders ?? []).filter(attentionReason).sort(byPriority);

    return (
        <Card title="Ordres de travail" subtitle="Assignés par vous, encore ouverts" action={<ViewAll to="/orders" />} className={className}>
            {!orders ? <PanelSkeleton /> : <>
                <dl className="grid grid-cols-2 gap-2">
                    {Object.entries(ORDER_STATUS).map(([status, { label, style }]) => (
                        <div key={status} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/40">
                            <dt className={`text-xs ${style}`}>{label}</dt>
                            <dd className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                                {orders.filter((o) => o.status === status).length}
                            </dd>
                        </div>
                    ))}
                </dl>

                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    À traiter · {needsAttention.length}
                </h3>
                {needsAttention.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <CircleCheck className="h-4 w-4 text-[#0ca30c]" aria-hidden="true" /> Aucun ordre bloqué ni en retard.
                    </p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {needsAttention.slice(0, 4).map((order) => (
                            <li key={order.id} className="flex items-start justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{order.title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        <span className="font-medium text-orange-700 dark:text-orange-400">{attentionReason(order)}</span>
                                        {" · "}{nameOf(names, order.technicianEmail)}
                                    </p>
                                </div>
                                <PriorityBadge priority={order.priority} />
                            </li>
                        ))}
                    </ul>
                )}
            </>}
        </Card>
    );
}

// ---- technician workload ----

export function WorkloadCard({ orders, technicians, names, className }) {
    const { isDark } = useTheme();
    const c = chartColors(isDark);

    // every technician, idle ones included: they can take the next alert
    const load = new Map((technicians ?? []).map((t) => [t.email, 0]));
    for (const order of orders ?? []) load.set(order.technicianEmail, (load.get(order.technicianEmail) ?? 0) + 1);
    const rows = [...load].map(([email, count]) => ({ name: nameOf(names, email), count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const idle = rows.filter((r) => r.count === 0).length;

    return (
        <Card title="Charge des techniciens" className={className}
            subtitle={rows.length ? `Ordres ouverts par technicien${idle ? ` · ${idle} ${plural(idle, "disponible")}` : ""}` : "Ordres ouverts par technicien"}
            action={<ViewAll to="/technicians">Assigner</ViewAll>}>
            {!orders ? <PanelSkeleton rows={5} />
            : rows.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Aucun technicien pour l'instant.</p>
            : (
                <div style={{ height: rows.length * 36 + 8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
                            <XAxis type="number" hide allowDecimals={false} domain={[0, (max) => Math.max(max, 1)]} />
                            <YAxis type="category" dataKey="name" width={130} axisLine={{ stroke: c.axis }} tickLine={false}
                                tick={{ fill: c.muted, fontSize: 12 }} />
                            <Tooltip cursor={{ fill: c.grid, fillOpacity: 0.5 }} isAnimationActive={false}
                                content={<ChartTooltip format={(p) => ({
                                    title: p.name,
                                    value: `${p.count} ${plural(p.count, "ordre ouvert", "ordres ouverts")}`,
                                })} />} />
                            {/* no animation: the data reloads every minute and the bars would grow again each time */}
                            <Bar dataKey="count" fill={c.series} barSize={16} radius={[0, 4, 4, 0]} minPointSize={2} isAnimationActive={false}>
                                <LabelList dataKey="count" position="right" fill={c.muted} fontSize={12} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}

// ---- review queue ----

const CONFORMITY = {
    CONFORME:     { label: "Conforme",      style: "text-emerald-700 dark:text-emerald-400" },
    NON_CONFORME: { label: "Non conforme",  style: "font-medium text-red-700 dark:text-red-400", icon: OctagonAlert },
};

// the report page needs the submission id, and the task for its approve / return buttons
const reportLink = (task) =>
    task.submissionId
        ? `/review/${task.submissionId}?${new URLSearchParams({ taskId: task.taskId, title: task.title ?? "" })}`
        : "/review";

// now: the dashboard's clock (the twin's last tick), so the "sent … ago" times move with it
export function ReviewCard({ reviews, names, now, className }) {
    return (
        <Card title="En attente de validation" className={className}
            subtitle={reviews?.length ? `${reviews.length} ${plural(reviews.length, "rapport")}, du plus ancien au plus récent` : "Rapports envoyés par vos techniciens"}
            action={<ViewAll to="/review" />}>
            {!reviews ? <PanelSkeleton />
            : reviews.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <CircleCheck className="h-4 w-4 text-[#0ca30c]" aria-hidden="true" /> Vous êtes à jour.
                </p>
            ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {reviews.slice(0, 5).map((task) => {
                        const conformity = CONFORMITY[task.submissionStatus];
                        const ConformityIcon = conformity?.icon;
                        return (
                            <li key={task.taskId}>
                                <Link to={reportLink(task)} className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                                            {conformity && (
                                                <span className={`flex items-center gap-1 ${conformity.style}`}>
                                                    {ConformityIcon && <ConformityIcon className="h-3 w-3" aria-hidden="true" />}
                                                    {conformity.label}
                                                </span>
                                            )}
                                            {conformity && "·"} {nameOf(names, task.technicianEmail)} · {task.equipmentId}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                        {task.submittedAt ? ago(now - new Date(task.submittedAt)) : "—"}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
