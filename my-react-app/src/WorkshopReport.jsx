// The technician's report on a workshop intervention, read at its review step (9 Valider rapport,
// 17 Contrôle final) by the Workshop Lead: the manager's review page (ReviewReport.jsx) for the
// workshop. Valider approves the task and passes the intervention on; Renvoyer sends the report
// back to the technician (step 8 / 16, À corriger).
// guide: shown between the header and the report; step 17's page (/atelier/:id/controle-final) passes
// the final-check guidance (FinalCheckGuide.jsx).
// /atelier/:id/rapport/:submissionId opens one given report of the intervention (the démontage report
// after step 15, an earlier version sent back…): read-only unless it's the one waiting for review.
//
//   details ← GET  /api/v1/interventions/:id          (task.submissionId, availableActions)
//   report  ← ReportView                              (GET /api/v1/submissions/{submissionId}, preview, pdf)
//   take    → POST /api/v1/interventions/:id/actions  ({ action: TAKE })
//   decide  → POST /api/v1/interventions/:id/actions  ({ action: VALIDATE }) or ({ action: RETURN, comment })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { ErrorBanner, ListSkeleton } from "./managerUi";
import { serverMessage } from "./managerUtils";
import { ReportView, ReviewDecision } from "./ReviewReport";
import { REPORT_KIND, ROLE_LABEL, STEP_STATUS, TASK_STATUS, stepLabel } from "./workshopUtils";

const WorkshopReport = ({ guide = null }) => {
    const { id, submissionId } = useParams();
    const navigate = useNavigate();
    const [details, setDetails] = useState(null); // null = still loading
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [taking, setTaking] = useState(false);
    const [takeError, setTakeError] = useState(null);

    // attempt: bumped by Retry, and once the step is taken
    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/interventions/${id}`);
                setLoadError(null);
                setDetails(data);
            }
            catch (err) {
                console.log("Error while fetching the intervention", err);
                setLoadError(serverMessage(err, "L'intervention n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
            }
        };
        load();
    }, [id, attempt]);

    const action = (name, comment) => apiClient.post(`/api/v1/interventions/${id}/actions`, { action: name, comment: comment ?? null });

    const take = async () => {
        setTaking(true);
        setTakeError(null);
        try {
            await action("TAKE");
            setAttempt((n) => n + 1);
        }
        catch (err) {
            console.log("Error while taking the step", err);
            setTakeError(serverMessage(err, "L'étape n'a pas pu être prise en charge. Réessayez."));
        }
        finally {
            setTaking(false);
        }
    };

    // ReviewDecision's send: "approve" validates the step (and the task), "return" sends it back
    const send = async (decision, comment) => {
        if (decision === "approve") {
            await action("VALIDATE");
            const next = details.nextStep;
            navigate("/atelier", { state: { notice:
                `${details.number} : rapport validé. L'intervention passe à l'étape ${stepLabel(next)} (${ROLE_LABEL[next.role] ?? next.role}).` } });
        }
        else {
            await action("RETURN", comment);
            navigate("/atelier", { state: { notice:
                `${details.number} : rapport renvoyé à ${details.task.technicianEmail} pour correction.` } });
        }
    };

    const backLink = (
        <Link to={`/atelier/${id}`} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            ← {details?.number ?? "Intervention"}
        </Link>
    );

    if (details === null) {
        return (
        <Layout active="workshop">
            {backLink}
            <div className="mt-4">{loadError ? <ErrorBanner message={loadError} onRetry={() => setAttempt((n) => n + 1)} /> : <ListSkeleton />}</div>
        </Layout>)
    }

    const task = details.task;
    const actions = details.availableActions ?? [];
    // the report shown: the one asked for, else the current task's last one
    const shownId = submissionId ?? task?.submissionId;
    const reviewing = !!shownId && shownId === task?.submissionId;
    // which task and version it is, from the intervention's list
    const shownTask = (details.tasks ?? []).find((t) => t.reports.some((r) => r.submissionId === shownId));
    const shownReport = shownTask?.reports.find((r) => r.submissionId === shownId);
    // the decision only on the report waiting for review
    const canDecide = reviewing && actions.includes("VALIDATE") && actions.includes("RETURN");
    const stepStatus = STEP_STATUS[details.stepStatus];

    return (
    <Layout active="workshop">
        {backLink}

        {/* where the intervention is, and what this user can do about the report */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900 dark:text-slate-100">{details.number} · {details.equipmentId}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stepStatus?.style}`}>{stepStatus?.label}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{stepLabel(details.currentStep)}</p>
            {task && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>Tâche « {task.title} » · {task.technicianEmail}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TASK_STATUS[task.status]?.style}`}>
                        {TASK_STATUS[task.status]?.label ?? task.status}
                    </span>
                </p>
            )}
            {reviewing && actions.includes("TAKE") && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <button type="button" onClick={take} disabled={taking}
                        className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                        {taking ? "Prise en charge…" : "Prendre en charge"}
                    </button>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Prenez l'étape en charge pour valider ou renvoyer le rapport.</p>
                </div>
            )}
            {takeError && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{takeError}</p>}
        </div>

        {guide && <div className="mt-6">{guide}</div>}

        <div className="mt-6">
            {guide && shownId && (
                <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Rapport de montage du technicien</h2>
            )}
            {!guide && shownTask && (
                <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                    {REPORT_KIND[shownTask.step?.code] ?? "Rapport"} · version {shownReport.version} · {shownTask.technicianEmail}
                    {!reviewing && " · lecture seule"}
                </p>
            )}
            {shownId ? (
                <ReportView key={shownId} submissionId={shownId}>
                    {() => canDecide && (
                        <ReviewDecision send={send} approveLabel="Valider le rapport"
                            confirmText={`Valider le rapport ? La tâche « ${task.title} » sera clôturée et l'intervention passera à l'étape ${stepLabel(details.nextStep)}.`} />
                    )}
                </ReportView>
            ) : (
                <p className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Le technicien n'a pas encore envoyé de rapport.
                </p>
            )}
        </div>
    </Layout>)
}

export default WorkshopReport;
