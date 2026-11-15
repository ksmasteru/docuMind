// One alert case, opened from the dashboard's live alerts ("Voir l'alerte") or the Alertes link:
// what the twin saw, what was decided and done about it, and the actions to move it on.
//
//   case  ← alertStore.js        (status, priority, activity, its check, linked orders: /api/v1/alerts)
//   check ← GET /api/v1/checks/:taskId   (the check report, once one was sent: CheckReportView.jsx)
//   live  ← useFleet()           (the alert's current severity and message, the pump's 7-day trend)
//   tasks ← GET /api/v1/task/assigned, /api/v1/task/review   (where the linked orders are now)
//
// Every alert is checked on site before anyone acts on it (levée de doute, plan_alert_check_flow.md):
// the Levée de doute panel sends the check, follows it, and holds the decisions on its report. A work
// order or the workshop only once the alert is confirmed; closing only after a check, with a reason.
//
// /alerts/:number?vue=fil|ordres. /alerts opens the worst open case.
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Ban, Check, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardPlus, Hand, OctagonX, Repeat, Undo2, UserCheck, Warehouse, Wrench } from "lucide-react";
import Layout from "./Layout";
import { apiClient } from "./apiClient";
import { useFleet } from "./fleetSimulator";
import { SEVERITY } from "./pumpStates";
import {
    ALERT_KINDS, CANNOT_HANDLE_REASON, CHECK_VERDICT, CLOSE_REASON, FALSE_ALARM_CAUSE, INCONCLUSIVE_REASON, ISSUE_STATUS,
    REQUEST_STATUS, VERIFICATION_STATE, caseTitle, repeatSummary,
} from "./alertContent";
import {
    addComment, cancelCheck, closeAlert, refuseRequest, returnCheck, setPriority, setStatus, useAlertIssues, useAlertState,
} from "./alertStore";
import { AuthPhoto } from "./AuthPhoto";
import { CheckReportView } from "./CheckReportView";
import { CheckPdfButton } from "./CheckReportParts";
import { useCheck } from "./checkReport";
import { TONE } from "./dashboard/tokens";
import { ActivityFeed, OrdersTab, SummaryCard, TrendCard } from "./AlertFeed";
import { Card, EmptyState, ErrorBanner, ListSkeleton, Notice, PriorityBadge, SimulatedBadge } from "./managerUi";
import { PRIORITY_LABEL, ago, formatDateTime, newOrderRoute, plural, serverMessage } from "./managerUtils";
import { TASK_STATUS, workshopRequestRoute } from "./workshopUtils";

const SEVERITY_RANK = { critical: 0, warning: 1 };
const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];

const selectClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const primaryButton =
    "flex w-full items-center justify-center gap-2 rounded-lg bg-[#1A75BC] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#0F2A49] disabled:opacity-50";
const secondaryButton =
    "flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700";
const smallButton =
    "rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700";

// the open cases, worst first then oldest: the order previous / next walks through
const openCases = (issues) =>
    issues.filter((i) => i.status !== "RESOLVED")
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.raisedAt - b.raisedAt);

// /alerts: the worst open case, or a note that there is none
export function AlertsIndex() {
    const first = openCases(useAlertIssues())[0];
    if (first) return <Navigate to={`/alerts/${first.number}`} replace />;
    return (
        <Layout active="alerts">
            <EmptyState icon="✅" title="Aucune alerte ouverte" hint="Les alertes levées par le digital twin s'ouvrent ici." />
        </Layout>
    );
}

const Pill = ({ className, children }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
);

const Tag = ({ tone, children }) => (
    <span className={`rounded-sm px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-[0.12em] ${TONE[tone].soft} ${TONE[tone].text}`}>{children}</span>
);

// a short form under a button: a comment, then confirm (send back a report, refuse a request, close)
function CommentForm({ label, placeholder, required = true, confirm, extra, onSend, onCancel }) {
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const send = async (event, then) => {
        event.preventDefault();
        setSending(true);
        const ok = await onSend(comment.trim(), then);
        if (!ok) setSending(false);
    };
    return (
        <form onSubmit={send} className="mt-2 space-y-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                {label}
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} required={required}
                    placeholder={placeholder} className={selectClass} />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Annuler</button>
                {extra && (
                    <button type="button" disabled={sending || (required && !comment.trim())} onClick={(e) => send(e, extra.then)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">{extra.label}</button>
                )}
                <button type="submit" disabled={sending || (required && !comment.trim())} className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900">{confirm}</button>
            </div>
        </form>
    );
}

// ---- the right column ----

function UpdatePanel({ issue, live, run }) {
    const severity = live?.severity ?? issue.severity;
    const { label, icon: Icon, style } = SEVERITY[severity];
    const open = issue.status !== "RESOLVED";
    return (
        <Card title="Mettre à jour">
            <div className="space-y-3">
                {open && (
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                        Statut
                        {/* no "Résolue" here: closing has its reason (Clôture, below) */}
                        <select value={issue.status} onChange={(e) => run(setStatus(issue.number, e.target.value))} className={selectClass}>
                            {Object.entries(ISSUE_STATUS).filter(([value]) => value !== "RESOLVED").map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
                        </select>
                    </label>
                )}
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Priorité
                    <select value={issue.priority} onChange={(e) => run(setPriority(issue.number, e.target.value))} className={selectClass}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                    </select>
                </label>
                <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Gravité</p>
                    <p className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${style}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                        <span className="ml-auto text-xs font-normal opacity-80">{live ? "selon la mesure en direct" : "la plus haute atteinte"}</span>
                    </p>
                </div>
            </div>
        </Card>
    );
}

// The check (levée de doute): send it, follow it, and decide on its report.
//   À vérifier          → "Demander une levée de doute"
//   en cours            → who has it, where it stands, Annuler
//   confirmée           → his request (accept: the pre-filled assign form / refuse, or refuse and pick
//                         someone else) or why he can't; the work itself is in "Faut-il intervenir"
//   fausse alerte       → confirm it and close / a new check; "Faire contrôler le capteur" when the
//                         sensor is blamed. A warning first if the twin got worse or came back since
//   non concluante      → a new check
// A report not decided on yet can be sent back to the technician to complete. An alert back after a
// false alarm (issue.recurrence, AlertService.sync) says so at the top.
function CheckPanel({ issue, now, run, onOrderCheck, onAccept, onPickOther, onSensorOrder }) {
    const [form, setForm] = useState(null); // "return" | "cancel" | "close" | request id (refusing)
    const check = issue.check;
    const verification = issue.verification;
    const state = VERIFICATION_STATE[verification] ?? VERIFICATION_STATE.TO_CHECK;
    const name = check ? check.technicianName ?? check.technicianEmail : null;
    const awaiting = check?.taskStatus === "SUBMITTED"; // a report no decision has settled yet
    const open = issue.status !== "RESOLVED";
    const requests = issue.requests ?? [];
    const pending = requests.filter((r) => r.status === "PENDING").length;
    const done = () => setForm(null);
    const repeat = issue.recurrence;
    // the twin since the report: worse, or back after it cleared (worth knowing before agreeing it's false)
    const since = check?.submittedAt ?? Infinity;
    const changed = (issue.events ?? []).filter((e) => e.at > since && (e.type === "escalated" || e.type === "reactivated"));
    const escalated = changed.findLast((e) => e.type === "escalated");

    return (
        <Card title="Levée de doute" action={<Tag tone={state.tone}>{state.short}</Tag>}>
            {/* back after a false alarm: still to check, but the manager knows it */}
            {repeat && open && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="flex items-start gap-1.5 font-medium">
                        <Repeat className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Revenue après une fausse alerte
                    </p>
                    <p className="mt-1">
                        {repeatSummary(repeat, { by: true })}.
                        {repeat.worse && " Elle est plus grave qu'à ce moment-là."}
                        {" "}<Link to={`/alerts/${repeat.number}`} className="font-medium underline">Voir #{repeat.number}</Link>
                    </p>
                    {repeat.cause === "SENSOR_FAULT" && (
                        <button type="button" onClick={() => onSensorOrder(`#${repeat.number}`)} className={`mt-2 ${smallButton}`}>
                            <Wrench className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Faire contrôler le capteur
                        </button>
                    )}
                </div>
            )}

            {verification === "TO_CHECK" && (
                <>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Pas encore vérifiée sur place. Toute intervention passe d'abord par une levée de doute : le capteur peut se tromper.
                    </p>
                    {check && ["DECLINED", "CANCELED"].includes(check.taskStatus) && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            La dernière ({name}) a été {check.taskStatus === "DECLINED" ? "refusée par le technicien" : "annulée"}{check.statusComment && check.taskStatus === "DECLINED" ? ` : « ${check.statusComment} »` : "."}
                        </p>
                    )}
                    {open && (
                        <button type="button" onClick={onOrderCheck} className={`mt-4 ${primaryButton}`}>
                            <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Demander une levée de doute
                        </button>
                    )}
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Les techniciens {issue.site ? `de ${issue.site}` : "du site"} peuvent aussi la faire d'eux-mêmes depuis leur onglet Alertes.
                    </p>
                </>
            )}

            {verification === "CHECK_ORDERED" && check && (
                <>
                    <p className="text-sm text-slate-900 dark:text-slate-100">
                        <span className="font-medium">{name}</span>{check.selfAssigned ? ", à son initiative" : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${TASK_STATUS[check.taskStatus]?.style ?? ""}`}>{TASK_STATUS[check.taskStatus]?.label ?? check.taskStatus}</span>
                        depuis {ago(now - check.assignedAt).replace(/^il y a /, "")}
                    </p>
                    {check.taskStatus === "RETURNED" && check.statusComment && (
                        <p className="mt-2 rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Rapport renvoyé : {check.statusComment}</p>
                    )}
                    {form !== "cancel" ? (
                        <button type="button" onClick={() => setForm("cancel")} className={`mt-3 ${smallButton}`}>
                            <Ban className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Annuler la levée de doute
                        </button>
                    ) : (
                        <div className="mt-3 rounded-md border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                            <p className="text-slate-700 dark:text-slate-200">Annuler la tâche de {name} ? L'alerte redevient « À vérifier ».</p>
                            <div className="mt-2 flex justify-end gap-2">
                                <button type="button" onClick={done} className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Non</button>
                                <button type="button" onClick={async () => { if (await run(cancelCheck(issue.number))) done(); }}
                                    className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900">Oui, annuler</button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {["CONFIRMED", "FALSE_ALARM", "INCONCLUSIVE"].includes(verification) && (
                <>
                    {check?.verdict ? (
                        <div>
                            <p className={`text-sm font-semibold ${TONE[CHECK_VERDICT[check.verdict].tone].text}`}>
                                {CHECK_VERDICT[check.verdict].label}
                                {check.falseAlarmCause && <span className="font-normal text-slate-700 dark:text-slate-200"> · {FALSE_ALARM_CAUSE[check.falseAlarmCause]}</span>}
                                {check.inconclusiveReason && <span className="font-normal text-slate-700 dark:text-slate-200"> · {INCONCLUSIVE_REASON[check.inconclusiveReason]}</span>}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Par {name}{check.selfAssigned ? " (à son initiative)" : ""}{check.submittedAt ? `, ${ago(now - check.submittedAt)}` : ""}
                                {" · "}<a href="#rapport" className="font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">Lire le rapport</a>
                            </p>
                            {check.urgentStop && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-crit"><OctagonX className="h-4 w-4" aria-hidden="true" /> Arrêt immédiat recommandé</p>}
                            {check.comment && <p className="mt-2 whitespace-pre-line rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{check.comment}</p>}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-600 dark:text-slate-300">{state.label}{issue.source === "FIELD" ? " : panne signalée par le terrain." : "."}</p>
                    )}

                    {/* a confirmed alert: his request, or why he can't */}
                    {verification === "CONFIRMED" && check?.canHandle === false && (
                        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                            <span className="font-medium">{name}</span> ne peut pas s'en charger : {CANNOT_HANDLE_REASON[check.cannotHandleReason]?.toLowerCase()}.
                        </p>
                    )}

                    {open && verification === "FALSE_ALARM" && changed.length > 0 && (
                        <p role="status" className="mt-3 flex items-start gap-1.5 rounded-md border border-crit/30 bg-crit/10 px-2.5 py-1.5 text-sm text-foreground">
                            <OctagonX className="mt-0.5 h-4 w-4 shrink-0 text-crit" aria-hidden="true" />
                            <span>
                                Depuis le rapport de {name}, {escalated ? `l'alerte est passée en ${escalated.to === "critical" ? "critique" : escalated.to}` : "l'alerte est revenue après être rentrée dans les limites"}
                                {escalated && changed.some((e) => e.type === "reactivated") ? ", et elle est revenue après être rentrée dans les limites" : ""}.
                                {" "}Vérifiez avant de la classer fausse.
                            </span>
                        </p>
                    )}
                    {open && verification === "FALSE_ALARM" && form !== "close" && (
                        <div className="mt-4 space-y-2">
                            <button type="button" onClick={() => setForm("close")} className={primaryButton}>
                                <Check className="h-4 w-4" aria-hidden="true" /> Confirmer la fausse alerte et clore
                            </button>
                            <button type="button" onClick={onOrderCheck} className={secondaryButton}>
                                <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Nouvelle levée de doute
                            </button>
                            {check?.falseAlarmCause === "SENSOR_FAULT" && (
                                <button type="button" onClick={() => onSensorOrder(`#${issue.number}`)} className={secondaryButton}>
                                    <Wrench className="h-4 w-4" aria-hidden="true" /> Faire contrôler le capteur
                                </button>
                            )}
                        </div>
                    )}
                    {open && form === "close" && (
                        <CommentForm label="Un commentaire ? (facultatif)" required={false} confirm="Clore l'alerte"
                            placeholder={check?.falseAlarmCause === "SENSOR_FAULT" ? "Ex. : capteur à recalibrer, demande faite à l'instrumentation." : "Ex. : rien d'anormal, à surveiller."}
                            onSend={async (comment) => run(closeAlert(issue.number, "FALSE_ALARM", comment || null))} onCancel={done} />
                    )}
                    {open && verification === "INCONCLUSIVE" && (
                        <button type="button" onClick={onOrderCheck} className={`mt-4 ${primaryButton}`}>
                            <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Nouvelle levée de doute
                        </button>
                    )}

                    {open && awaiting && form !== "return" && (
                        <button type="button" onClick={() => setForm("return")} className={`mt-3 ${smallButton}`}>
                            <Undo2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Renvoyer le rapport à compléter
                        </button>
                    )}
                    {open && form === "return" && (
                        <CommentForm label={`Ce que ${name} doit compléter (il le verra)`} confirm="Renvoyer"
                            placeholder="Ex. : ajoutez une photo du palier côté pompe."
                            onSend={async (comment) => { const ok = await run(returnCheck(issue.number, comment)); if (ok) done(); return ok; }} onCancel={done} />
                    )}
                </>
            )}

            {/* requests to intervene, made from the check reports */}
            {requests.length > 0 && (
                <ul className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                    {pending > 0 && verification !== "CONFIRMED" && (
                        <li className="text-xs text-slate-500 dark:text-slate-400">La demande se traite une fois le rapport confirmé.</li>
                    )}
                    {requests.map((r) => {
                        const status = REQUEST_STATUS[r.status];
                        return (
                            <li key={r.id} className="text-sm">
                                <div className="flex items-start gap-2.5">
                                    <Hand className="mt-0.5 h-4 w-4 shrink-0 text-[#1A75BC] dark:text-[#5BC6E8]" aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-2 text-slate-900 dark:text-slate-100">
                                            <span><span className="font-medium">{r.name ?? r.technicianEmail}</span> peut s'en charger</span>
                                            <Tag tone={status.tone}>{status.label}</Tag>
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{ago(now - r.at)}</p>
                                        {r.message && <p className="mt-1 whitespace-pre-line rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{r.message}</p>}
                                        {r.status === "REFUSED" && r.comment && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Refusée : {r.comment}</p>}
                                        {r.status === "ACCEPTED" && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ordre envoyé{r.decidedByName ? ` par ${r.decidedByName}` : ""}{r.decidedAt ? ` ${ago(now - r.decidedAt)}` : ""}.</p>}
                                        {r.status === "PENDING" && verification === "CONFIRMED" && open && form !== r.id && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <button type="button" onClick={() => onAccept(r)}
                                                    className="inline-flex items-center gap-1.5 rounded-md bg-[#1A75BC] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#0F2A49]">
                                                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Accepter et lui assigner
                                                </button>
                                                <button type="button" onClick={() => setForm(r.id)} className={smallButton}>Refuser</button>
                                            </div>
                                        )}
                                        {form === r.id && (
                                            <CommentForm label="Pourquoi ? (le technicien le verra)" confirm="Refuser"
                                                extra={{ label: "Refuser et choisir un autre technicien", then: "other" }}
                                                onSend={async (comment, then) => {
                                                    const ok = await run(refuseRequest(r.id, comment));
                                                    if (ok) { done(); if (then === "other") onPickOther(); }
                                                    return ok;
                                                }}
                                                onCancel={done} />
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

// a confirmed alert's mission: who does the work. The technician who asked to handle it first
// (assigning him accepts his request), else the technician list; or the workshop
function WorkPanel({ issue, onAccept, onCreate, onWorkshop, onShowOrders }) {
    const interventions = issue.interventions ?? [];
    const pending = (issue.requests ?? []).find((r) => r.status === "PENDING");
    const name = pending && (pending.name ?? pending.technicianEmail);
    const workshopFirst = !pending && issue.check?.cannotHandleReason === "WORKSHOP";
    return (
        <Card>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0ca30c] text-white">
                    <Wrench className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="pt-2 text-sm font-medium text-slate-900 dark:text-slate-100">Faut-il intervenir sur cette pompe ?</p>
            </div>
            {pending && (
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{name}</span> a confirmé l'alerte et peut s'en charger. L'assigner accepte sa demande.
                </p>
            )}
            <div className="mt-4 space-y-2">
                {pending && (
                    <button type="button" onClick={() => onAccept(pending)} className={primaryButton}>
                        <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">Assigner à {name}</span>
                    </button>
                )}
                {/* the technician who checked says the pump has to go to the workshop: that first */}
                {workshopFirst && (
                    <button type="button" onClick={onWorkshop} className={primaryButton}>
                        <Warehouse className="h-4 w-4" aria-hidden="true" /> Envoyer en atelier
                    </button>
                )}
                <button type="button" onClick={onCreate} className={pending || workshopFirst ? secondaryButton : primaryButton}>
                    <ClipboardPlus className="h-4 w-4" aria-hidden="true" /> {pending ? "Un autre technicien" : "Choisir le technicien"}
                </button>
                {!workshopFirst && (
                    <button type="button" onClick={onWorkshop} className={secondaryButton}>
                        <Warehouse className="h-4 w-4" aria-hidden="true" /> Envoyer en atelier
                    </button>
                )}
            </div>
            {interventions.map((intervention) => (
                <Link key={intervention.id} to={`/atelier/${intervention.id}`}
                    className="mt-2 block w-full text-center text-xs font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
                    Intervention atelier {intervention.number ?? ""} →
                </Link>
            ))}
            {/* the orders already sent from this case, and to whom */}
            {issue.orders.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
                    {issue.orders.map((order) => (
                        <li key={order.taskId ?? order.at}>
                            <button type="button" onClick={onShowOrders}
                                className="w-full text-left text-xs text-slate-600 hover:underline dark:text-slate-300">
                                Ordre envoyé à <span className="font-medium text-slate-900 dark:text-slate-100">{order.technicianName ?? order.technicianEmail}</span>
                                {" "}: {order.title} <span className="font-medium text-[#1A75BC] dark:text-[#5BC6E8]">→</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

// closing, always with a reason; never before a check (a false alarm closes from the check panel).
// now: the twin's last tick
function ClosePanel({ issue, live, now, run }) {
    const [reason, setReason] = useState("");
    const [comment, setComment] = useState("");
    const worked = issue.orders.length > 0 || (issue.interventions ?? []).length > 0;
    const measure = issue.source === "FIELD" ? null
        : live ? "La mesure est encore hors limites."
        : issue.clearedAt ? `Mesure revenue dans les limites ${ago(now - issue.clearedAt)}.` : null;

    if (issue.status === "RESOLVED") {
        return (
            <Card title="Clôture">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                    Close le {formatDateTime(new Date(issue.resolvedAt).toISOString())}{issue.closeReason ? ` : ${CLOSE_REASON[issue.closeReason].toLowerCase()}` : ""}.
                </p>
                {issue.closeComment && <p className="mt-1 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">« {issue.closeComment} »</p>}
                <button type="button" onClick={() => run(setStatus(issue.number, worked ? "IN_PROGRESS" : "ACKNOWLEDGED"))} className={`mt-3 ${smallButton}`}>
                    Rouvrir
                </button>
            </Card>
        );
    }
    if (issue.verification !== "CONFIRMED") {
        return (
            <Card title="Clôture">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {issue.verification === "FALSE_ALARM" ? "Confirmez la fausse alerte dans la levée de doute pour la clore." : "Une alerte se clôt après sa levée de doute."}
                    {measure ? ` ${measure}` : ""}
                </p>
            </Card>
        );
    }
    const reasons = Object.keys(CLOSE_REASON).filter((r) => r !== "FALSE_ALARM" && (r !== "FIXED" || worked));
    const send = async (event) => {
        event.preventDefault();
        if (await run(closeAlert(issue.number, reason, comment.trim() || null))) { setReason(""); setComment(""); }
    };
    return (
        <Card title="Clôture">
            {measure && <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{measure}</p>}
            <form onSubmit={send} className="space-y-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Raison
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className={selectClass}>
                        <option value="">Choisissez…</option>
                        {reasons.map((r) => <option key={r} value={r}>{CLOSE_REASON[r]}</option>)}
                    </select>
                </label>
                {reason && (
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                        Commentaire {reason === "OTHER" ? "(obligatoire)" : "(facultatif)"}
                        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={selectClass} />
                    </label>
                )}
                <button type="submit" disabled={!reason || (reason === "OTHER" && !comment.trim())}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">
                    Clore l'alerte
                </button>
            </form>
        </Card>
    );
}

// ---- the main column ----

// the latest check report, as the technician sent it
function CheckReportCard({ issue }) {
    const { check, error } = useCheck(issue.check.taskId, `${issue.check.round}-${issue.check.taskStatus}`);
    return (
        <div id="rapport" className="scroll-mt-20">
            <Card title={issue.source === "FIELD" ? "Rapport du technicien" : "Rapport de levée de doute"}
                action={check?.reports.length > 0 && <CheckPdfButton taskId={check.taskId} />}>
                {error ? <ErrorBanner message={error} />
                    : !check ? <ListSkeleton />
                    : check.reports.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Pas encore de rapport.</p>
                    : (
                        <>
                            <CheckReportView check={check} report={check.reports[0]} />
                            {check.reports.length > 1 && (
                                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                                    Version {check.reports[0].round} : la première a été renvoyée pour être complétée.
                                </p>
                            )}
                        </>
                    )}
            </Card>
        </div>
    );
}

// a technician's fault report: what he saw, in his words (his photos are in his report, or here for
// the reports made before the check report existed)
function FieldReportCard({ issue }) {
    const report = issue.report;
    return (
        <Card title="Panne signalée sur place">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Par <span className="font-medium text-slate-900 dark:text-slate-100">{report.byName ?? report.by}</span>
                {" "}le {formatDateTime(new Date(issue.raisedAt).toISOString())}
                {report.equipmentModel && <> · modèle {report.equipmentModel}</>}
            </p>
            <p className="mt-3 text-base font-medium text-slate-900 dark:text-slate-100">{report.title}</p>
            {report.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{report.description}</p>}
            {report.imageIds?.length > 0 && (
                <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{report.imageIds.length} {plural(report.imageIds.length, "photo")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {report.imageIds.map((id, i) => <AuthPhoto key={id} imageId={id} alt={`Photo ${i + 1} de la panne`} className="aspect-[4/3] w-full" />)}
                    </div>
                </div>
            )}
        </Card>
    );
}

// ---- the page ----

const AlertDetail = () => {
    const number = Number(useParams().number);
    const { issues, loaded, error: storeError } = useAlertState();
    const fleet = useFleet();
    const [actionError, setActionError] = useState(null);
    const navigate = useNavigate();
    const notice = useLocation().state?.notice;
    const [params, setParams] = useSearchParams();
    const [tasks, setTasks] = useState(null); // { orders, reviews }; null = still loading
    const [loadError, setLoadError] = useState(null);

    // the linked orders' current state
    useEffect(() => {
        let cancelled = false;
        const loadTasks = async () => {
            try {
                const [assigned, review] = await Promise.all([apiClient.get("/api/v1/task/assigned"), apiClient.get("/api/v1/task/review")]);
                if (!cancelled) setTasks({ orders: assigned.data.tasks ?? [], reviews: review.data.tasks ?? [] });
            }
            catch (err) {
                console.log("Error while loading the alert's work orders", err);
                if (!cancelled) setLoadError(serverMessage(err, "Les ordres de travail n'ont pas pu être chargés."));
            }
        };
        loadTasks();
        return () => { cancelled = true; };
    }, []);

    const issue = issues.find((i) => i.number === number);
    if (!issue) {
        return (
            <Layout active="alerts">
                {!loaded ? <ListSkeleton />
                    : storeError ? <ErrorBanner message={serverMessage(storeError, "Les alertes n'ont pas pu être chargées.")} />
                    : <EmptyState icon="🔎" title={`Alerte #${number || "?"} introuvable`} hint="Elle n'existe pas, ou plus." />}
            </Layout>
        );
    }

    // an action is a server call: what failed shows above the page, the page stays as it was
    const run = (request) => request.then(() => { setActionError(null); return true; }).catch((err) => {
        console.log("alert action failed", err);
        setActionError(serverMessage(err, "L'action n'a pas pu être enregistrée. Réessayez."));
        return false;
    });
    const pump = fleet.pumps.find((p) => p.pumpId === issue.pumpId);
    const live = fleet.alerts.find((a) => a.id === issue.key);
    const kind = ALERT_KINDS[issue.kind] ?? ALERT_KINDS.field;
    const title = caseTitle(issue);
    const field = issue.source === "FIELD";
    const severity = SEVERITY[live?.severity ?? issue.severity];
    const SeverityIcon = severity.icon;
    const status = ISSUE_STATUS[issue.status];
    const verification = VERIFICATION_STATE[issue.verification] ?? VERIFICATION_STATE.TO_CHECK;
    const view = params.get("vue") === "ordres" ? "ordres" : "fil";
    const confirmed = issue.verification === "CONFIRMED";

    // previous / next among the open cases (this one included even when resolved)
    const walk = openCases(issues);
    if (!walk.includes(issue)) walk.unshift(issue);
    const position = walk.indexOf(issue);
    const goTo = (i) => navigate(`/alerts/${walk[i].number}`);

    const createOrder = () => navigate(...newOrderRoute(issue.pumpId, issue.site, live?.message ?? title, issue.number));
    // his request accepted: the assign form for him, pre-filled from the case and what he wrote.
    // Sending the form accepts the request (AssignTask.jsx)
    const acceptFor = (request) => {
        const query = new URLSearchParams({
            name: request.name ?? request.technicianEmail, equipement: issue.pumpId, alerte: String(issue.number), demande: request.id,
            titre: `${title} · ${issue.pumpId}`,
            consignes: [live?.message ?? (issue.report?.description || issue.message), issue.check?.comment && `Levée de doute : ${issue.check.comment}`,
                request.message && `Sa demande : ${request.message}`].filter(Boolean).join("\n"),
        });
        navigate(`/assign/${encodeURIComponent(request.technicianEmail)}?${query}`);
    };
    const showOrders = () => setParams({ vue: "ordres" }, { replace: true });
    const orderCheck = () => navigate(`/alerts/${issue.number}/verification`);
    // a sensor found faulty: a work order on the pump to have it looked at. Not linked to the alert,
    // which was a false alarm: the rule "an order needs a confirmed check" stays as it is
    const sensorOrder = (about) => navigate(...newOrderRoute(issue.pumpId, issue.site, `capteur à contrôler (fausse alerte ${about})`, null));
    // the request form, pre-filled: the fault is the alert's message, urgent from the case's priority
    const sendToWorkshop = () => navigate(workshopRequestRoute(issue.pumpId, live?.message ?? title,
        ["URGENT", "HIGH"].includes(issue.priority), issue.number));

    return (
    <Layout active="alerts" full>
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <Link to="/dashboard#alerts" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                    ← Alertes en direct
                </Link>
                <div className="flex items-center gap-1">
                    <button type="button" disabled={position <= 0} onClick={() => goTo(position - 1)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-200/60 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédente
                    </button>
                    <span className="rounded-md bg-white px-2 py-1 text-xs tabular-nums text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                        {position + 1} sur {walk.length}
                    </span>
                    <button type="button" disabled={position >= walk.length - 1} onClick={() => goTo(position + 1)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#1A75BC] hover:bg-slate-200/60 disabled:opacity-40 dark:text-[#5BC6E8] dark:hover:bg-slate-700">
                        Suivante <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <header>
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    #{issue.number} · {issue.pumpId} — {title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Pill className={severity.style}><SeverityIcon className="h-3 w-3" aria-hidden="true" /> {severity.label}</Pill>
                    <PriorityBadge priority={issue.priority} />
                    <Pill className={status.style}>{status.label}</Pill>
                    <Pill className={`${TONE[verification.tone].soft} ${TONE[verification.tone].text}`}>{verification.label}</Pill>
                    {field
                        ? <Pill className="bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">Signalée par {issue.report?.byName ?? issue.report?.by}</Pill>
                        : <SimulatedBadge />}
                    <span>
                        {issue.site} › {pump?.model} ›{" "}
                        <Link to={`/pumps?pompe=${issue.pumpId}`} className="font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">{issue.pumpId}</Link>
                    </span>
                    <span>· Ouverte le {formatDateTime(new Date(issue.raisedAt).toISOString())}</span>
                    {live && <span>· {live.message}</span>}
                </div>
            </header>

            {notice && <Notice>{notice}</Notice>}
            {actionError && <ErrorBanner message={actionError} onRetry={() => setActionError(null)} />}

            <div className="grid gap-6 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-8">
                    <div role="tablist" className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
                        {[["fil", "Fil d'activité"], ["ordres", `Ordres de travail · ${issue.orders.length}`]].map(([key, label]) => (
                            <button key={key} type="button" role="tab" aria-selected={view === key}
                                onClick={() => setParams(key === "fil" ? {} : { vue: key }, { replace: true })}
                                className={`-mb-px border-b-2 pb-2.5 text-sm transition ${
                                    view === key
                                        ? "border-[#1A75BC] font-semibold text-[#1A75BC] dark:border-[#5BC6E8] dark:text-[#5BC6E8]"
                                        : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                }`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {view === "fil" ? (
                        <>
                            {/* what the alert is, what the check found, then the data, then what happened */}
                            {field && issue.report && <FieldReportCard issue={issue} />}
                            {issue.check?.round && <CheckReportCard issue={issue} />}
                            {pump && !field && <SummaryCard issue={issue} pump={pump} />}
                            {pump && kind.metric && <TrendCard pump={pump} issue={issue} now={fleet.updatedAt} />}
                            <Card title="Fil d'activité">
                                <ActivityFeed issue={issue} onComment={(text) => run(addComment(issue.number, text))} />
                            </Card>
                        </>
                    ) : (
                        <Card>
                            <OrdersTab issue={issue} tasks={tasks} loadError={loadError} />
                        </Card>
                    )}
                </div>

                <aside className="space-y-6 lg:col-span-4">
                    <CheckPanel issue={issue} now={fleet.updatedAt} run={run} onOrderCheck={orderCheck} onAccept={acceptFor} onPickOther={createOrder}
                        onSensorOrder={sensorOrder} />
                    {issue.status !== "RESOLVED" && (confirmed || issue.orders.length > 0 || (issue.interventions ?? []).length > 0) && (
                        <WorkPanel issue={issue} onAccept={acceptFor} onCreate={createOrder} onWorkshop={sendToWorkshop} onShowOrders={showOrders} />
                    )}
                    <UpdatePanel issue={issue} live={live} run={run} />
                    <ClosePanel issue={issue} live={live} now={fleet.updatedAt} run={run} />
                </aside>
            </div>
        </div>
    </Layout>);
};

export default AlertDetail;
