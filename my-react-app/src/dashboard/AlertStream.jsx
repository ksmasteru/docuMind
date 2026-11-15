// The live alerts beside the fleet, worst first: who, what, since when, and the alert case it
// opened. The faults technicians reported join them, and each line says where its check (levée de
// doute) stands and whether someone asks to intervene. A new alert slides in. The body opens the
// pump's sheet; the actions send the check (or, once confirmed, start a work order) or open the case.
import { Link } from "react-router-dom";
import { ArrowUpRight, CircleCheck, ClipboardCheck, ClipboardPlus, Hand, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ISSUE_STATUS, VERIFICATION_STATE } from "../alertContent";
import { openIssueFor } from "../alertStore";
import { LIMITS } from "../fleetSimulator";
import { formatAgo, plural } from "../managerUtils";
import { Panel, PanelEmpty } from "./primitives";
import { SEVERITY, TONE, num } from "./tokens";

// where the case's check stands, who has it, and the requests waiting
function CheckSign({ issue }) {
    if (!issue) return null;
    const state = VERIFICATION_STATE[issue.verification] ?? VERIFICATION_STATE.TO_CHECK;
    const who = issue.verification === "CHECK_ORDERED" ? issue.check?.technicianName : null;
    const waiting = (issue.requests ?? []).filter((r) => r.status === "PENDING").length;
    return (
        <>
            <span className={cn("font-data text-[10px] uppercase tracking-[0.1em]", TONE[state.tone].text)}>
                {state.label}{who ? ` · ${who}` : ""}
            </span>
            {waiting > 0 && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-warn/10 px-1 font-data text-[10px] uppercase tracking-[0.1em] text-warn">
                    <Hand className="size-3" aria-hidden="true" /> {waiting} {plural(waiting, "demande")}
                </span>
            )}
            {/* back after a false alarm (AlertService.sync): still to check, the check knows it */}
            {issue.recurrence && (
                <span title={`Déjà classée fausse alerte (#${issue.recurrence.number})`}
                    className="inline-flex items-center gap-1 rounded-sm bg-warn/10 px-1 font-data text-[10px] uppercase tracking-[0.1em] text-warn">
                    <Repeat className="size-3" aria-hidden="true" /> Récidive
                </span>
            )}
        </>
    );
}

function AlertItem({ alert, issue, now, onSelect, onCreateOrder }) {
    const { label, tone, icon: Icon } = SEVERITY[alert.severity];
    const age = now - alert.since;
    return (
        <li className="console-enter relative border-b border-border last:border-b-0">
            <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-0.5", TONE[tone].rail)} />
            <button type="button" onClick={() => onSelect(alert.pumpId)}
                className="block w-full px-4 pb-1.5 pt-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex items-center gap-2">
                    <Icon className={cn("size-3.5 shrink-0", TONE[tone].text)} aria-hidden="true" />
                    <span className="font-data text-[13px] font-medium text-foreground">{alert.pumpId}</span>
                    <span className="text-[11px] text-subtle">{alert.site}</span>
                    <span className="ml-auto font-data text-[11px] tabular-nums text-subtle">
                        {age < 60000 ? "à l'instant" : formatAgo(age)}
                    </span>
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{alert.message}</span>
            </button>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2.5">
                <span className={cn("font-data text-[10px] font-semibold uppercase tracking-[0.12em]", TONE[tone].text)}>{label}</span>
                {alert.reportedBy && <span className="text-[11px] text-muted-foreground">signalée par {alert.reportedBy}</span>}
                {issue && (
                    <span className="font-data text-[10px] uppercase tracking-[0.1em] text-subtle">
                        #{issue.number} · {ISSUE_STATUS[issue.status]?.label ?? issue.status}
                    </span>
                )}
                <CheckSign issue={issue} />
                <span className="ml-auto flex gap-1">
                    {/* nobody acts before the check: send it first; a work order once it's confirmed */}
                    {issue?.verification === "TO_CHECK" && issue.status !== "RESOLVED" && (
                        <Button variant="ghost" size="xs" asChild className="text-muted-foreground hover:text-foreground">
                            <Link to={`/alerts/${issue.number}/verification`}><ClipboardCheck aria-hidden="true" /> Levée de doute</Link>
                        </Button>
                    )}
                    {issue?.verification === "CONFIRMED" && (
                        <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-foreground"
                            onClick={() => onCreateOrder(alert, issue)}>
                            <ClipboardPlus aria-hidden="true" /> Ordre de travail
                        </Button>
                    )}
                    {/* the case is opened on the tick after the alert appears */}
                    {issue && (
                        <Button variant="outline" size="xs" asChild className="border-border bg-transparent">
                            <Link to={`/alerts/${issue.number}`}>
                                Dossier <ArrowUpRight aria-hidden="true" />
                            </Link>
                        </Button>
                    )}
                </span>
            </div>
        </li>
    );
}

const RANK = { critical: 0, warning: 1 };

export function AlertsPanel({ fleet, issues, onSelect, onCreateOrder, className, style }) {
    const { updatedAt: now } = fleet;
    // the twin's alerts, then the open faults technicians reported, in the same shape, worst first
    const reported = issues.filter((i) => i.source === "FIELD" && i.status !== "RESOLVED").map((i) => ({
        id: i.key, pumpId: i.pumpId, site: i.site, severity: i.severity, since: i.raisedAt,
        message: i.report?.title ?? i.message, reportedBy: i.report?.byName ?? i.report?.by,
    }));
    const alerts = [...fleet.alerts, ...reported].sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.since - b.since);
    const critical = alerts.filter((a) => a.severity === "critical").length;
    return (
        <Panel id="alerts" label="Twin et terrain" title="Alertes en direct" style={style} className={className}
            meta={alerts.length ? `${alerts.length} · ${critical} ${plural(critical, "critique")}` : "aucune"}
            action={
                <Button variant="link" size="xs" asChild className="h-auto px-0 text-xs">
                    <Link to="/alerts">Tous les dossiers →</Link>
                </Button>
            }>
            {alerts.length === 0 ? (
                <PanelEmpty icon={CircleCheck} title="Toutes les pompes sont dans leurs limites"
                    hint={`Une alerte s'ouvre dès ${num(LIMITS.vibration_mms.warn, 1)} mm/s de vibrations ou ${LIMITS.bearing_temp_c.warn} °C au palier.`} />
            ) : (
                // as tall as the fleet table on wide screens, scrolling inside
                <ul aria-label="Alertes, les plus graves d'abord"
                    className="max-h-[480px] overflow-y-auto overscroll-contain xl:absolute xl:inset-0 xl:max-h-none">
                    {alerts.map((alert) => (
                        <AlertItem key={alert.id} alert={alert} now={now} issue={openIssueFor(issues, alert.id)}
                            onSelect={onSelect} onCreateOrder={onCreateOrder} />
                    ))}
                </ul>
            )}
        </Panel>
    );
}
