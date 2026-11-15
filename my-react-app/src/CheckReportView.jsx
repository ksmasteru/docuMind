// A check report as it is read (levée de doute): the manager on the alert page (AlertDetail.jsx), the
// technician on his alert (FieldAlerts.jsx). The conclusion first, then the system's readings against
// the site's, each point with its photos, the free sections, and what comes next.
//
// The check itself comes from useCheck (checkReport.js): GET /api/v1/checks/:taskId.
import { AlertTriangle, Camera, Clock, Hand, OctagonX } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthPhoto } from "./AuthPhoto";
import {
    ARRIVAL_STATE, CANNOT_HANDLE_REASON, CHECK_RESULT, CHECK_VERDICT, FALSE_ALARM_CAUSE, INCONCLUSIVE_REASON, readingTone,
} from "./alertContent";
import { Tag } from "./CheckReportParts";
import { formatDateTime } from "./managerUtils";
import { MicroLabel } from "./dashboard/primitives";
import { TONE, num } from "./dashboard/tokens";


// literal classes, so Tailwind generates them
const EDGE = { ok: "border-ok", crit: "border-crit", warn: "border-warn", offline: "border-offline", neutral: "border-border" };
const FRAME = { ok: "border-ok/30", crit: "border-crit/30", warn: "border-warn/30", offline: "border-offline/30", neutral: "border-border" };

const hours = (seconds) => (seconds >= 3600 ? `${Math.floor(seconds / 3600)} h ${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}` : `${Math.max(1, Math.round(seconds / 60))} min`);

function Photos({ ids }) {
    if (!ids?.length) return null;
    return (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ids.map((id, i) => <AuthPhoto key={id} imageId={id} alt={`Photo ${i + 1}`} className="aspect-square w-full" />)}
        </div>
    );
}

// report: one round (check.reports[i]); check: its task and points
export function CheckReportView({ check, report }) {
    const verdict = CHECK_VERDICT[report.verdict];
    const why = report.verdict === "FALSE_ALARM" ? FALSE_ALARM_CAUSE[report.falseAlarmCause]
        : report.verdict === "INCONCLUSIVE" ? INCONCLUSIVE_REASON[report.inconclusiveReason] : null;
    const points = Object.fromEntries(check.points.map((p) => [p.id, p]));
    const measures = report.results.filter((r) => r.kind === "MEASURE");

    return (
        <div className="space-y-4">
            {/* the conclusion */}
            <div className={cn("rounded-sm border px-3 py-2.5", TONE[verdict.tone].soft, FRAME[verdict.tone])}>
                <p className={cn("flex flex-wrap items-center gap-2 text-sm font-semibold", TONE[verdict.tone].text)}>
                    {verdict.label}
                    {why && <span className="font-normal text-foreground">· {why}</span>}
                </p>
                {report.urgentStop && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-crit"><OctagonX className="size-4" aria-hidden="true" /> Arrêt immédiat recommandé</p>
                )}
                {report.comment && <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{report.comment}</p>}
            </div>

            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Par <span className="font-medium text-foreground">{check.technicianName ?? check.technicianEmail}</span>{check.selfAssigned ? " (à son initiative)" : ""}</span>
                <span>Envoyé le {formatDateTime(new Date(report.submittedAt).toISOString())}</span>
                {report.round > 1 && <span>Version {report.round}</span>}
                {report.arrivalState && <span>Pompe {ARRIVAL_STATE[report.arrivalState].toLowerCase()} à l'arrivée</span>}
                {check.workedSeconds > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden="true" /> {hours(check.workedSeconds)} sur place</span>}
            </p>

            {/* the system's readings against the site's: a reading within limits points at the sensor */}
            {measures.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="py-1.5 pr-3 font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">Mesure</th>
                                <th className="py-1.5 pr-3 text-right font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">Système</th>
                                <th className="py-1.5 pr-3 text-right font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">Sur place</th>
                                <th className="hidden py-1.5 text-right font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle sm:table-cell">Seuils</th>
                            </tr>
                        </thead>
                        <tbody>
                            {measures.map((r) => {
                                const p = points[r.pointId] ?? {};
                                const tone = readingTone(r.reading, p.warnLimit, p.critLimit);
                                return (
                                    <tr key={r.pointId} className="border-b border-border last:border-0">
                                        <td className="py-1.5 pr-3 text-foreground">
                                            {r.label}
                                            {/* on a phone, the limits under the label rather than in their own column */}
                                            {p.warnLimit != null && <span className="block font-data text-[11px] text-subtle sm:hidden">seuils {num(p.warnLimit, 1)} / {num(p.critLimit, 1)} {r.unit}</span>}
                                        </td>
                                        <td className="whitespace-nowrap py-1.5 pr-3 text-right font-data tabular-nums text-muted-foreground">{p.twinValue != null ? `${num(p.twinValue, 1)} ${r.unit ?? ""}` : "—"}</td>
                                        <td className={cn("whitespace-nowrap py-1.5 pr-3 text-right font-data font-semibold tabular-nums", tone ? TONE[tone].text : "text-subtle")}>
                                            {r.reading != null ? `${num(r.reading, 1)} ${r.unit ?? ""}` : "non relevé"}
                                        </td>
                                        <td className="hidden whitespace-nowrap py-1.5 text-right font-data text-xs tabular-nums text-muted-foreground sm:table-cell">
                                            {p.warnLimit != null ? `${num(p.warnLimit, 1)} / ${num(p.critLimit, 1)}` : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {report.results.length > 0 && (
                <div>
                    <MicroLabel as="h3" className="mb-2">Points vérifiés · {report.results.length}</MicroLabel>
                    <ol className="space-y-3">
                        {report.results.map((r, i) => {
                            const result = CHECK_RESULT[r.result];
                            return (
                                <li key={r.pointId ?? i} className={cn("border-l-2 pl-3", EDGE[result.tone])}>
                                    <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                                        <span className="font-medium">{r.label}</span>
                                        <Tag tone={result.tone}>{result.label}</Tag>
                                        {r.reading != null && <span className="font-data text-xs tabular-nums text-muted-foreground">{num(r.reading, 1)} {r.unit}</span>}
                                    </p>
                                    {r.comment && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{r.comment}</p>}
                                    <Photos ids={r.photos} />
                                </li>
                            );
                        })}
                    </ol>
                </div>
            )}

            {report.sections.length > 0 && (
                <div className="space-y-3">
                    <MicroLabel as="h3" className="flex items-center gap-1.5"><Camera className="size-3.5" aria-hidden="true" /> Photos et constats</MicroLabel>
                    {report.sections.map((s, i) => (
                        <div key={i}>
                            {s.title && <p className="text-sm font-medium text-foreground">{s.title}</p>}
                            {s.comment && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{s.comment}</p>}
                            <Photos ids={s.photos} />
                        </div>
                    ))}
                </div>
            )}

            {report.verdict === "CONFIRMED" && report.canHandle != null && (
                <div className="rounded-sm border border-border px-3 py-2.5 text-sm">
                    {report.canHandle ? (
                        <>
                            <p className="flex items-center gap-1.5 font-medium text-foreground"><Hand className="size-4 text-primary" aria-hidden="true" /> Peut s'en charger</p>
                            {report.handleMessage && <p className="mt-1 whitespace-pre-line text-foreground">« {report.handleMessage} »</p>}
                            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                {report.estimatedHours != null && <span>Durée estimée : {report.estimatedHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h</span>}
                                {report.partsNeeded && <span>Pièces et outillage : {report.partsNeeded}</span>}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="flex items-center gap-1.5 font-medium text-foreground"><AlertTriangle className="size-4 text-warn" aria-hidden="true" /> Ne peut pas s'en charger · {CANNOT_HANDLE_REASON[report.cannotHandleReason]}</p>
                            {report.cannotHandleComment && <p className="mt-1 whitespace-pre-line text-muted-foreground">{report.cannotHandleComment}</p>}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
