// One workshop intervention: the request, where it is in the loop, its history, and the buttons the
// signed-in user may press on the current step (the server lists them: availableActions).
// Sales completes the request here (step 1), each workshop role then validates its step; the manager
// who sent the pump follows it from the alert. At step 7 / 15 the Workshop Lead assigns the technician
// (WorkshopAssign.jsx); the technician's step (8 / 16) then shows his task, and the review step
// (9 / 17) his report: "Examiner le rapport" opens it (WorkshopReport.jsx), where it is validated or sent back.
// At step 10 the Chef de projet who took it generates the devis (WorkshopQuote.jsx); steps 12–14 are
// worked on their own page (WorkshopPendingStep.jsx, PENDING_STEPS): taking one opens it, it has the "Valider".
// Step 17 (Contrôle final) opens the final-check page: guidance, then the montage report and the decision.
// Step 18 (Valider attachement) opens the documents page (WorkshopAttachment.jsx).
//
//   devis   → POST /api/v1/quotes                       ({ interventionId } → QuoteDetails, the open draft)
//
//   details ← GET  /api/v1/interventions/:id
//   save    → PUT  /api/v1/interventions/:id/request   (Sales, step 1 taken)
//   button  → POST /api/v1/interventions/:id/actions   ({ action: TAKE | VALIDATE | CANCEL, comment }; RETURN from WorkshopReport.jsx)
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { tabsFor } from "./roleTabs";
import { Card, ErrorBanner, ListSkeleton, Notice } from "./managerUi";
import { formatDateTime, serverMessage } from "./managerUtils";
import { Field } from "./WorkshopRequest";
import { UrgentBadge } from "./Workshop";
import DossierButton from "./DossierButton";
import { ACTION_TEXT, INTERVENTION_STATUS, PENDING_STEPS, REPORT_KIND, REVIEW_STEPS, ROLE_LABEL, STEP_STATUS, TASK_STATUS, inputClass, originLabel, pendingStepRoute, stepLabel } from "./workshopUtils";

// "Refuser / Annuler" says what the final no means on each step that has one (canCancel)
const CANCEL_LABEL = {
    COMPLETER_DEMANDE: "Demande non recevable",
    ACCEPTER_DEMANDE: "Refuser la demande",
    RECEPTION_CONFORME: "Retour client",
    ACCORD_DEVIS: "Devis refusé",
};

// the request's fields as the form edits them
const requestOf = (details) => ({
    equipmentId: details.equipmentId ?? "",
    fault: details.fault ?? "",
    urgent: details.urgent,
    client: details.client ?? "",
    customerOrderNumber: details.customerOrderNumber ?? "",
});

const WorkshopIntervention = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    // a workshop role (its Atelier queue), or the manager following the pump they sent
    const inWorkshop = tabsFor(user?.role).includes("workshop");

    const [details, setDetails] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [request, setRequest] = useState(null); // the form, when the user may edit the request
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [notice, setNotice] = useState(location.state?.notice ?? null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelComment, setCancelComment] = useState("");

    // attempt: bumped by Retry, and after each button, to load the intervention again
    useEffect(() => {
        const loadDetails = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/interventions/${id}`);
                setLoadError(null);
                setDetails(data);
                setRequest(data.canEditRequest ? requestOf(data) : null);
            }
            catch (err) {
                console.log("Error while fetching the intervention", err);
                setLoadError(serverMessage(err, "L'intervention n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
            }
        };
        loadDetails();
    }, [id, attempt]);

    const reload = () => setAttempt((n) => n + 1);

    // the form's fields, sent before "Valider" so the step is validated with what is on screen
    const saveRequest = () => apiClient.put(`/api/v1/interventions/${id}/request`, {
        equipmentId: request.equipmentId.trim(),
        fault: request.fault.trim(),
        urgent: request.urgent,
        client: request.client.trim() || null,
        customerOrderNumber: request.customerOrderNumber.trim() || null,
    });

    // runs one call, shows the server's refusal if any; done: what to do once it went through
    const run = async (call, done) => {
        setBusy(true);
        setActionError(null);
        setNotice(null);
        try {
            await call();
            done();
        }
        catch (err) {
            console.log("Error on the intervention", err);
            setActionError(serverMessage(err, "L'action n'a pas pu être enregistrée. Vérifiez votre connexion et réessayez."));
        }
        finally {
            setBusy(false);
        }
    };

    const action = (name, comment) => apiClient.post(`/api/v1/interventions/${id}/actions`, { action: name, comment: comment ?? null });

    // steps 12–14 and 17 have their own page: taking one opens it
    const onTake = () => run(() => action("TAKE"), () => {
        const code = details.currentStep.code;
        if (PENDING_STEPS[code]) navigate(pendingStepRoute(id, code));
        else if (code === "CONTROLE_FINAL") navigate(`/atelier/${id}/controle-final`);
        else if (code === "VALIDER_ATTACHEMENT") navigate(`/atelier/${id}/attachement`);
        else reload();
    });

    const onSave = () => run(saveRequest, () => {
        setNotice("Demande enregistrée.");
        reload();
    });

    // step 10 hands the devis to Sales: no validated devis, no "Valider" (the server refuses it too)
    const quoteMissing = details?.currentStep.code === "VALIDER_BESOINS_DEVIS" && !details.quoteId;

    const onValidate = () => quoteMissing
        ? setActionError("Remplissez le devis et validez-le avant de transmettre : cliquez sur « Générer le devis ».")
        : run(async () => {
        if (request) await saveRequest();
        await action("VALIDATE");
    }, () => {
        const next = details.nextStep;
        const to = next ? ` Elle passe à l'étape ${stepLabel(next)} (${ROLE_LABEL[next.role] ?? next.role}).` : "";
        // only the step's role validates: back to its queue, the intervention has left it
        const done = next ? "validée" : "terminée";
        navigate("/atelier", { state: { notice: `${details.number} ${done}.${to}` } });
    });

    // the draft of the devis, created or the one already open, then its page
    const onQuote = () => run(async () => {
        const { data: quote } = await apiClient.post("/api/v1/quotes", { interventionId: id });
        navigate(`/atelier/${id}/devis/${quote.id}`);
    }, () => {});

    const onCancel = () => run(() => action("CANCEL", cancelComment.trim()), () => {
        setCancelOpen(false);
        setCancelComment("");
        reload();
    });

    const back = !inWorkshop && details?.alertNumber
        ? { to: `/alerts/${details.alertNumber}`, label: `← Alerte #${details.alertNumber}` }
        : { to: "/atelier", label: "← Atelier" };

    if (details === null) {
        return (
        <Layout active={inWorkshop ? "workshop" : "alerts"}>
            {loadError ? <ErrorBanner message={loadError} onRetry={reload} /> : <ListSkeleton />}
        </Layout>)
    }

    const actions = details.availableActions ?? [];
    const stepStatus = STEP_STATUS[details.stepStatus];
    const closed = details.status !== "EN_COURS";
    const update = (field) => (e) => setRequest((r) => ({ ...r, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
    const clientMissing = request ? request.client.trim() === "" : !details.client;
    // 9 / 17: the technician's report is read and decided on its own page
    const reviewStep = REVIEW_STEPS.includes(details.currentStep.code);
    // 12–14 and 18: validated from their own page
    const partsStep = !!PENDING_STEPS[details.currentStep.code];
    const attachmentStep = details.currentStep.code === "VALIDER_ATTACHEMENT";

    return (
    <Layout active={inWorkshop ? "workshop" : "alerts"}>
        <Link to={back.to} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            {back.label}
        </Link>

        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {details.number} · {details.equipmentId}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                {details.urgent && <UrgentBadge />}
                {closed && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${INTERVENTION_STATUS[details.status]?.style}`}>
                        {INTERVENTION_STATUS[details.status]?.label}
                    </span>
                )}
                <span>{originLabel(details)}</span>
                <span>· Créée le {formatDateTime(details.createdAt)} par {details.launchedBy}</span>
            </div>
        </header>

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6 space-y-6">
            <Card title="Étape en cours">
                {closed ? (
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                        {details.status === "ANNULEE" ? "Annulée" : "Terminée"} le {formatDateTime(details.closedAt)}
                        {details.status === "ANNULEE" && <> à l'étape {stepLabel(details.currentStep)}</>}.
                        {details.statusComment && <span className="mt-1 block whitespace-pre-line text-slate-500 dark:text-slate-400">« {details.statusComment} »</span>}
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{stepLabel(details.currentStep)}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stepStatus?.style}`}>{stepStatus?.label}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {ROLE_LABEL[details.currentStep.role] ?? details.currentStep.role}
                            {details.currentStep.role === "USER" ? ""
                                : details.stepAssignee ? ` · pris en charge par ${details.stepAssignee}` : " · personne ne l'a encore pris en charge"}
                        </p>
                        {(details.currentStep.role === "USER" || reviewStep) && details.task && (
                            <div className="mt-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Tâche « {details.task.title} »</p>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TASK_STATUS[details.task.status]?.style}`}>
                                        {TASK_STATUS[details.task.status]?.label ?? details.task.status}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Assignée à {details.task.technicianEmail}</p>
                                {details.task.status === "RETURNED" && details.task.statusComment && (
                                    <p className="mt-1 whitespace-pre-line text-sm text-orange-700 dark:text-orange-400">À corriger : {details.task.statusComment}</p>
                                )}
                                {details.task.submissionId && (
                                    <Link to={`/atelier/${details.id}/rapport`}
                                        className="mt-1 inline-block text-sm font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                                        {details.task.status === "SUBMITTED" ? "Voir le rapport envoyé" : "Voir le dernier rapport"}
                                    </Link>
                                )}
                            </div>
                        )}
                        {details.nextStep && (
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Ensuite : {stepLabel(details.nextStep)} ({ROLE_LABEL[details.nextStep.role] ?? details.nextStep.role})
                            </p>
                        )}
                    </>
                )}

                {/* the validated devis (step 10 on), for every role that follows the file */}
                {details.quoteId && (
                    <Link to={`/atelier/${details.id}/devis/${details.quoteId}`}
                        className="mt-3 inline-block text-sm font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                        Voir le devis
                    </Link>
                )}

                {actionError && (
                    <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                        {actionError}
                    </p>
                )}

                {details.canAssign && !cancelOpen && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <Link to={`/atelier/${details.id}/affecter`}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">
                            Affecter un technicien
                        </Link>
                        <p className="text-sm text-slate-500 dark:text-slate-400">La tâche lui est envoyée et l'étape est validée.</p>
                    </div>
                )}

                {details.canQuote && !cancelOpen && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <button type="button" onClick={onQuote} disabled={busy}
                            className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                            Générer le devis
                        </button>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Les pièces nécessaires, pour le client (Sales).</p>
                    </div>
                )}

                {actions.length > 0 && !cancelOpen && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                        {actions.includes("TAKE") && (
                            <button type="button" onClick={onTake} disabled={busy}
                                className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                                Prendre en charge
                            </button>
                        )}
                        {actions.includes("VALIDATE") && reviewStep && (
                            <Link to={details.currentStep.code === "CONTROLE_FINAL" ? `/atelier/${details.id}/controle-final` : `/atelier/${details.id}/rapport`}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">
                                {details.currentStep.code === "CONTROLE_FINAL" ? "Contrôle final du montage" : "Examiner le rapport"}
                            </Link>
                        )}
                        {actions.includes("VALIDATE") && partsStep && (
                            <Link to={pendingStepRoute(details.id, details.currentStep.code)}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">
                                Ouvrir l'étape
                            </Link>
                        )}
                        {actions.includes("VALIDATE") && attachmentStep && (
                            <Link to={`/atelier/${details.id}/attachement`}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">
                                Ouvrir l'étape
                            </Link>
                        )}
                        {actions.includes("VALIDATE") && !reviewStep && !partsStep && !attachmentStep && (
                            <button type="button" onClick={onValidate} disabled={busy || (details.currentStep.code === "COMPLETER_DEMANDE" && clientMissing)}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">
                                {details.nextStep ? "Valider et transmettre" : "Valider et clôturer"}
                            </button>
                        )}
                        {actions.includes("CANCEL") && (
                            <button type="button" onClick={() => setCancelOpen(true)} disabled={busy}
                                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
                                {CANCEL_LABEL[details.currentStep.code] ?? "Annuler l'intervention"}
                            </button>
                        )}
                        {actions.includes("VALIDATE") && details.currentStep.code === "COMPLETER_DEMANDE" && clientMissing && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Renseignez le client pour valider.</p>
                        )}
                        {actions.includes("VALIDATE") && quoteMissing && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Le devis doit être rempli et validé avant de transmettre.</p>
                        )}
                    </div>
                )}

                {cancelOpen && (
                    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <Field label="Pourquoi ?" required>
                            <textarea value={cancelComment} onChange={(e) => setCancelComment(e.target.value)} disabled={busy} rows={3}
                                placeholder={details.origin === "ALERT" ? "Le manager qui a envoyé la pompe lira ce commentaire" : "Ce qui sera gardé dans l'historique"}
                                className={inputClass} />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCancelOpen(false)} disabled={busy}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                                Retour
                            </button>
                            <button type="button" onClick={onCancel} disabled={busy || cancelComment.trim() === ""}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50">
                                Confirmer l'annulation
                            </button>
                        </div>
                    </div>
                )}
            </Card>

            {(details.tasks ?? []).length > 0 && (
                <Card title="Rapports du technicien">
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {details.tasks.map((t) => (
                            <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        {REPORT_KIND[t.step?.code] ?? "Tâche"} · {t.technicianEmail}
                                    </p>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TASK_STATUS[t.status]?.style}`}>
                                        {TASK_STATUS[t.status]?.label ?? t.status}
                                    </span>
                                </div>
                                {t.reports.length === 0 ? (
                                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Aucun rapport envoyé.</p>
                                ) : (
                                    <ul className="mt-1 space-y-0.5">
                                        {/* newest version first; an older one was sent back for correction */}
                                        {[...t.reports].reverse().map((r) => (
                                            <li key={r.submissionId} className="text-sm">
                                                <Link to={`/atelier/${details.id}/rapport/${r.submissionId}`}
                                                    className="font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                                                    Version {r.version}
                                                </Link>
                                                <span className="text-slate-500 dark:text-slate-400"> · envoyée le {formatDateTime(r.submittedAt)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* from the attachment (step 18) on: the final file, for whoever reads the intervention */}
            {details.currentStep?.number >= 18 && (details.tasks ?? []).some((t) => t.reports.length > 0) && (
                <Card title="Dossier final" subtitle="Avant / après, mesures, devis, rapports de démontage et de montage, historique.">
                    <DossierButton interventionId={details.id} />
                </Card>
            )}

            <Card title="Demande" subtitle={request ? "Complétez la demande avec le client, puis validez-la." : null}>
                {request ? (
                    <div className="space-y-4">
                        <Field label="Équipement" required>
                            <input value={request.equipmentId} onChange={(e) => setRequest((r) => ({ ...r, equipmentId: e.target.value.toUpperCase() }))}
                                disabled={busy} autoComplete="off" className={inputClass} />
                        </Field>
                        <Field label="Panne" required>
                            <textarea value={request.fault} onChange={update("fault")} disabled={busy} rows={3} className={inputClass} />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={request.urgent} onChange={update("urgent")} disabled={busy} className="accent-[#1A75BC]" />
                            Urgente
                        </label>
                        <Field label="Client" required>
                            <input value={request.client} onChange={update("client")} disabled={busy} className={inputClass} />
                        </Field>
                        <Field label="N° de commande client">
                            <input value={request.customerOrderNumber} onChange={update("customerOrderNumber")} disabled={busy}
                                autoComplete="off" className={inputClass} />
                        </Field>
                        <div className="flex justify-end">
                            <button type="button" onClick={onSave}
                                disabled={busy || request.equipmentId.trim() === "" || request.fault.trim() === ""}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                                Enregistrer
                            </button>
                        </div>
                    </div>
                ) : (
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        <Info label="Équipement" value={details.equipmentId} />
                        <Info label="Client" value={details.client} />
                        <Info label="N° de commande client" value={details.customerOrderNumber} />
                        <Info label="Origine" value={originLabel(details)} />
                        <div className="sm:col-span-2"><Info label="Panne" value={details.fault} /></div>
                    </dl>
                )}
            </Card>

            <Card title="Historique">
                <ol className="space-y-3">
                    {[...details.events].reverse().map((event, index) => (
                        <li key={index} className="text-sm">
                            <p className="text-slate-700 dark:text-slate-200">
                                <span className="font-medium text-slate-900 dark:text-slate-100">{event.actorEmail}</span>{" "}
                                {ACTION_TEXT[event.action] ?? event.action}
                                <span className="text-slate-500 dark:text-slate-400"> · {stepLabel(event.step)}</span>
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.occurredAt)}</p>
                            {event.comment && <p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-300">« {event.comment} »</p>}
                        </li>
                    ))}
                </ol>
            </Card>
        </div>
    </Layout>)
}

const Info = ({ label, value }) => (
    <div>
        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 whitespace-pre-line text-slate-900 dark:text-slate-100">{value || "—"}</dd>
    </div>
);

export default WorkshopIntervention;
