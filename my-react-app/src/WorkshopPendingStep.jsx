// The steps whose work isn't defined yet, each on its own page (/atelier/:id/etape/:slug), opened once
// the step is taken (WorkshopIntervention.jsx's "Prendre en charge" leads here). The page says the work
// is coming; "Valider" passes the intervention on to the next step.
//   12 Disponibilité PDR (Chef de projet) → 13 Sortie des pièces (Magasinier) → 14 Contrôle qualité PDR
//   (Quality) → 15 Autoriser montage (Pumps Maintenance Lead)
//
//   details ← GET  /api/v1/interventions/:id          (availableActions, quoteId)
//   take    → POST /api/v1/interventions/:id/actions  ({ action: TAKE }), if the page is opened before taking it
//   valider → POST /api/v1/interventions/:id/actions  ({ action: VALIDATE })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Hourglass } from "lucide-react";
import { apiClient } from "./apiClient";
import { Card, ErrorBanner, ListSkeleton } from "./managerUi";
import { serverMessage } from "./managerUtils";
import { UrgentBadge } from "./Workshop";
import { PENDING_STEPS, ROLE_LABEL, STEP_STATUS, stepLabel } from "./workshopUtils";

const WorkshopPendingStep = () => {
    const { id, slug } = useParams();
    // the step this page is for
    const [code, page] = Object.entries(PENDING_STEPS).find(([, p]) => p.slug === slug) ?? [null, null];
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

    // back to the queue: the intervention has left the Chef de projet's steps
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
    const onThisStep = code !== null && details.currentStep.code === code;
    const stepStatus = STEP_STATUS[details.stepStatus];

    return (
    <Layout active="workshop">
        {backLink}

        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{page?.title ?? "Étape"}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                {details.number} · {details.equipmentId} · {stepLabel(details.currentStep)}
                {details.urgent && <UrgentBadge />}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stepStatus?.style}`}>{stepStatus?.label}</span>
            </p>
        </header>

        <div className="mt-6 space-y-6">
            <Card title={page?.card ?? "Étape"}>
                <div className="flex flex-col items-center px-4 py-8 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">
                        <Hourglass className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="mt-3 font-medium text-slate-900 dark:text-slate-100">Bientôt disponible</p>
                    <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
                        {page?.soon} En attendant, validez cette étape pour transmettre l'intervention {page?.to}.
                    </p>
                    {details.quoteId && (
                        <Link to={`/atelier/${id}/devis/${details.quoteId}`}
                            className="mt-4 text-sm font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                            Voir les pièces du devis
                        </Link>
                    )}
                </div>

                {actionError && (
                    <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                        {actionError}
                    </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                    {!onThisStep && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Cette intervention n'est plus à cette étape.</p>
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
            </Card>
        </div>
    </Layout>)
}

export default WorkshopPendingStep;
