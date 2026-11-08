// Step 18 "Valider attachement" (Business Operations Manager): opened once he took the step
// (WorkshopIntervention.jsx's "Prendre en charge" leads here). He reads the intervention's documents
// (démontage report, montage report, devis: each in a new tab), the final file will be generated from here later, and
// "Valider" passes the intervention on to step 19 (Dossier final + livraison, Chef de projet).
//
//   details ← GET  /api/v1/interventions/:id          (tasks and their reports, quoteId, availableActions)
//   take    → POST /api/v1/interventions/:id/actions  ({ action: TAKE }), if the page is opened before taking it
//   valider → POST /api/v1/interventions/:id/actions  ({ action: VALIDATE })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, FileCheck2, FileText, Receipt, Wrench } from "lucide-react";
import { apiClient } from "./apiClient";
import { Card, ErrorBanner, ListSkeleton } from "./managerUi";
import { serverMessage } from "./managerUtils";
import { UrgentBadge } from "./Workshop";
import { ROLE_LABEL, STEP_STATUS, latestReportOf, stepLabel } from "./workshopUtils";

const STEP = "VALIDER_ATTACHEMENT";

const WorkshopAttachment = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [details, setDetails] = useState(null); // null = still loading
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);

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

    const run = async (action, done) => {
        setBusy(true);
        setActionError(null);
        try {
            await apiClient.post(`/api/v1/interventions/${id}/actions`, { action, comment: null });
            done();
        }
        catch (err) {
            console.log(`Error on ${action}`, err);
            setActionError(serverMessage(err, "L'action n'a pas pu être enregistrée. Vérifiez votre connexion et réessayez."));
        }
        finally {
            setBusy(false);
        }
    };

    const take = () => run("TAKE", () => setAttempt((n) => n + 1));

    // back to the queue: the intervention has left the Business Operations Manager's steps
    const validate = () => run("VALIDATE", () => {
        const next = details.nextStep;
        navigate("/atelier", { state: { notice:
            `${details.number} validée. Elle passe à l'étape ${stepLabel(next)} (${ROLE_LABEL[next.role] ?? next.role}).` } });
    });

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

    const actions = details.availableActions ?? [];
    const onThisStep = details.currentStep.code === STEP;
    const stepStatus = STEP_STATUS[details.stepStatus];
    // the latest version of each report, even if a task was replaced or sent back
    const dismantling = latestReportOf(details, "DEMONTAGE_EXPERTISE");
    const mounting = latestReportOf(details, "MONTAGE_ESSAIS");

    const documents = [
        { label: "Rapport de démontage", icon: Wrench, to: dismantling && `/atelier/${id}/rapport/${dismantling}`, missing: "Aucun rapport de démontage" },
        { label: "Rapport de montage", icon: FileText, to: mounting && `/atelier/${id}/rapport/${mounting}`, missing: "Aucun rapport de montage" },
        { label: "Devis", icon: Receipt, to: details.quoteId && `/atelier/${id}/devis/${details.quoteId}`, missing: "Aucun devis validé" },
    ];

    return (
    <Layout active="workshop">
        {backLink}

        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Valider l'attachement</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                {details.number} · {details.equipmentId}{details.client ? ` · ${details.client}` : ""} · {stepLabel(details.currentStep)}
                {details.urgent && <UrgentBadge />}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stepStatus?.style}`}>{stepStatus?.label}</span>
            </p>
        </header>

        <div className="mt-6 space-y-6">
            <Card title="Documents de l'intervention" subtitle="Vérifiez les rapports du technicien et le devis avant de valider.">
                <div className="grid gap-2 sm:grid-cols-3">
                    {documents.map(({ label, icon: Icon, to, missing }) => to ? (
                        // a new tab: this page stays open, with its Valider
                        <Link key={label} to={to} target="_blank" rel="noopener"
                            className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                            <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        </Link>
                    ) : (
                        <span key={label}
                            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400 dark:border-slate-600">
                            {missing}
                        </span>
                    ))}
                </div>
            </Card>

            <Card title="Dossier final">
                {/* later: builds the final file (reports, devis…) */}
                <button type="button" disabled title="Bientôt disponible"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A75BC] px-4 py-2.5 text-sm font-medium text-white opacity-50 sm:w-auto">
                    <FileCheck2 className="h-4 w-4" aria-hidden="true" /> Générer le dossier final
                    <span className="text-xs font-normal">· bientôt</span>
                </button>
            </Card>

            {actionError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {actionError}
                </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                {!onThisStep && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Cette intervention n'est plus à l'étape Valider attachement.</p>
                )}
                {onThisStep && actions.includes("TAKE") && (
                    <button type="button" onClick={take} disabled={busy}
                        className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                        Prendre en charge
                    </button>
                )}
                {onThisStep && actions.includes("VALIDATE") && (
                    <button type="button" onClick={validate} disabled={busy}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">
                        {busy ? "Validation…" : "Valider"}
                    </button>
                )}
                {onThisStep && actions.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Seul le {ROLE_LABEL[details.currentStep.role] ?? details.currentStep.role} qui a pris cette étape en charge peut la valider.
                    </p>
                )}
            </div>
        </div>
    </Layout>)
}

export default WorkshopAttachment;
