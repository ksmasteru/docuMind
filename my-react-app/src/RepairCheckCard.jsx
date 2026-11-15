// In a work order made from an alert (TaskScreen, Détails tab): what the check on site found
// (levée de doute), for the technician sent to repair, who is often not the one who checked.
// What to look at first (the points in anomaly, the readings past their limits) with their photos,
// what the checker said about the repair, then the full report and its PDF.
//
//   check ← GET /api/v1/checks/for/:taskId   (useCheckBehind; nothing shown when the alert has no check report)
import { useState } from "react";
import { ChevronDown, ChevronUp, OctagonX } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthPhoto } from "./AuthPhoto";
import { CANNOT_HANDLE_REASON, CHECK_RESULT, CHECK_VERDICT, readingTone } from "./alertContent";
import { CheckPdfButton, Tag } from "./CheckReportParts";
import { CheckReportView } from "./CheckReportView";
import { useCheckBehind } from "./checkReport";
import { formatDateTime } from "./managerUtils";
import { TONE, num } from "./dashboard/tokens";

// 3 → "3", 2.5 → "2,5": an estimate in hours, without trailing zeros
const hoursOf = (h) => h.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const shell = "rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800";

export default function RepairCheckCard({ taskId }) {
    const { check, error } = useCheckBehind(taskId);
    const [full, setFull] = useState(false);

    if (error) return <p className={cn(shell, "text-sm text-muted-foreground")}>{error}</p>;
    if (check === undefined) return <div className={cn(shell, "h-24 animate-pulse")} aria-hidden="true" />;
    const report = check?.reports?.[0];
    if (!report) return null;

    const verdict = CHECK_VERDICT[report.verdict];
    const points = Object.fromEntries(check.points.map((p) => [p.id, p]));
    const toneOf = (r) => readingTone(r.reading, points[r.pointId]?.warnLimit, points[r.pointId]?.critLimit);
    // what to look at first: a point in anomaly, or a reading past its limits
    const first = report.results.filter((r) => r.result === "ANOMALY" || (r.kind === "MEASURE" && ["warn", "crit"].includes(toneOf(r))));
    const photos = first.flatMap((r) => r.photos).slice(0, 6);
    const name = check.technicianName ?? check.technicianEmail;

    return (
        <section className={shell} aria-labelledby="check-behind">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 id="check-behind" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Constaté lors de la levée de doute</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Par {name}, le {formatDateTime(new Date(report.submittedAt).toISOString())} · alerte #{check.alertNumber}
                    </p>
                </div>
                <Tag tone={verdict.tone}>{verdict.label}</Tag>
            </div>

            {report.urgentStop && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-crit"><OctagonX className="size-4" aria-hidden="true" /> Arrêt immédiat recommandé</p>
            )}
            {report.comment && <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">« {report.comment} »</p>}

            <h3 className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">À regarder d'abord</h3>
            {first.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Aucune anomalie relevée sur les points vérifiés : lisez son commentaire et ses photos.</p>
            ) : (
                <ul className="mt-1.5 space-y-2">
                    {first.map((r, i) => {
                        const point = points[r.pointId] ?? {};
                        const tone = r.result === "ANOMALY" ? "crit" : toneOf(r);
                        return (
                            <li key={r.pointId ?? i} className={cn("border-l-2 pl-2.5 text-sm", tone === "crit" ? "border-crit" : "border-warn")}>
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-900 dark:text-slate-100">
                                    <span className="font-medium">{r.label}</span>
                                    {r.result === "ANOMALY" && <Tag tone={CHECK_RESULT.ANOMALY.tone}>{CHECK_RESULT.ANOMALY.label}</Tag>}
                                </p>
                                {r.reading != null && (
                                    <p className="font-data text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                        <span className={cn("font-semibold", TONE[tone].text)}>{num(r.reading, 1)} {r.unit}</span> sur place
                                        {point.twinValue != null && <> · {num(point.twinValue, 1)} {r.unit} au système</>}
                                        {point.critLimit != null && <> · critique à {num(point.critLimit, 1)}</>}
                                    </p>
                                )}
                                {r.comment && <p className="mt-0.5 whitespace-pre-line text-slate-600 dark:text-slate-300">{r.comment}</p>}
                            </li>
                        );
                    })}
                </ul>
            )}
            {photos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                    {photos.map((id, i) => <AuthPhoto key={id} imageId={id} alt={`Photo ${i + 1} de la levée de doute`} className="aspect-square w-full" />)}
                </div>
            )}

            {report.canHandle === true && (report.estimatedHours != null || report.partsNeeded) && (
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-medium">Prévu :</span>
                    {report.estimatedHours != null && <> {hoursOf(report.estimatedHours)} h de travail</>}
                    {report.estimatedHours != null && report.partsNeeded && " ·"}
                    {report.partsNeeded && <> {report.partsNeeded}</>}
                </p>
            )}
            {report.canHandle === false && (
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-medium">{name} ne pouvait pas s'en charger :</span> {CANNOT_HANDLE_REASON[report.cannotHandleReason]?.toLowerCase()}
                    {report.cannotHandleComment && <> — {report.cannotHandleComment}</>}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-start gap-2">
                <button type="button" onClick={() => setFull((v) => !v)} aria-expanded={full}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                    {full ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                    {full ? "Masquer le rapport" : "Voir tout le rapport"}
                </button>
                <CheckPdfButton taskId={check.taskId} />
            </div>
            {full && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700"><CheckReportView check={check} report={report} /></div>}
        </section>
    );
}
