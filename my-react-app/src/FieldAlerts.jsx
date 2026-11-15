// The technician's Alertes tab: the alerts on the pumps of his site, checked on the spot.
//
//   /terrain            the open alerts of his site (the server scopes them) and his own reports, the
//                       ones nobody has checked yet first
//   /terrain/:number    one alert: where its check (levée de doute) stands, the pump's live readings and
//                       what to look at. Nobody checking it yet: "Faire la levée de doute" starts a check
//                       task for him (his manager is told) and opens its report in his Tâches. He can't
//                       close the alert or change its status: that is his manager's.
//   /terrain/signaler   a fault the twin did not see: pump, what he sees, severity, then the check report's
//                       photo sections and what comes next. It reaches his manager as a confirmed alert.
//
// The cases come from alertStore.js (/api/v1/alerts); the check report itself is CheckReportForm.jsx.
import Layout from "./Layout";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Clock, ClipboardCheck, Hand, Megaphone, OctagonX, Repeat, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthContext";
import { useFleet, SITES } from "./fleetSimulator";
import {
    ALERT_KINDS, CHECK_VERDICT, CLOSE_REASON, ISSUE_STATUS, REQUEST_STATUS, VERIFICATION_STATE, caseTitle, repeatSummary, suggestedPoints,
} from "./alertContent";
import { reportFault, selfCheck, sessionEmail, syncAlerts, useAlertState } from "./alertStore";
import { AuthPhoto } from "./AuthPhoto";
import { Box, CheckPdfButton, NextStepEditor, SectionsEditor, Tag } from "./CheckReportParts";
import { emptyNext, inputClass, labelClass, newKey, nextStepBody, nextStepProblems, sectionsBody, useCheck } from "./checkReport";
import { CheckReportView } from "./CheckReportView";
import { EmptyState, ErrorBanner, ListSkeleton, Notice, PageHeader } from "./managerUi";
import { ago, formatDateTime, plural, serverMessage } from "./managerUtils";
import { MicroLabel } from "./dashboard/primitives";
import { SEVERITY, STATE, TONE, num } from "./dashboard/tokens";

const SeverityTag = ({ severity }) => {
    const { label, tone, icon: Icon } = SEVERITY[severity] ?? SEVERITY.warning;
    return <Tag tone={tone}><Icon className="size-3" aria-hidden="true" /> {label}</Tag>;
};

// his latest request on a case (made from his check report)
const myRequest = (issue, me) => [...(issue.requests ?? [])].reverse().find((r) => r.technicianEmail === me);

// the twin's alerts are fed from here too, so a technician sees them even when no manager is online
function useTwinFeed() {
    const fleet = useFleet();
    useEffect(() => syncAlerts(fleet.alerts, fleet.updatedAt), [fleet.alerts, fleet.updatedAt]);
    return fleet;
}

function useMe() {
    const { user } = useAuth();
    return user?.email ?? sessionEmail();
}

// where the check stands, from his side: "À vérifier", "Votre levée de doute", "En vérification par X"…
function CheckTag({ issue, me }) {
    if (issue.status === "RESOLVED") return <Tag tone="ok"><CheckCircle2 className="size-3" aria-hidden="true" /> Close</Tag>;
    const state = VERIFICATION_STATE[issue.verification] ?? VERIFICATION_STATE.TO_CHECK;
    const mine = issue.check?.technicianEmail === me;
    if (issue.verification === "CHECK_ORDERED")
        return <Tag tone={mine ? "warn" : "standby"}><ClipboardCheck className="size-3" aria-hidden="true" /> {mine ? "Votre levée de doute" : `En vérification · ${issue.check?.technicianName ?? "un collègue"}`}</Tag>;
    return <Tag tone={state.tone}>{state.label}{mine && issue.verification !== "TO_CHECK" ? " · par vous" : ""}</Tag>;
}

// ---- the list ----

function AlertCard({ issue, me, now, live }) {
    const request = myRequest(issue, me);
    const mine = issue.report?.by === me;
    return (
        <li>
            <Link to={`/terrain/${issue.number}`}
                className="block rounded-md border border-border bg-card px-4 py-3 outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-medium text-foreground">{caseTitle(issue)}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            <span className="font-data">{issue.pumpId}</span> · {issue.site ?? "site inconnu"} · {ago(now - issue.raisedAt)}
                        </p>
                    </div>
                    <SeverityTag severity={live?.severity ?? issue.severity} />
                </div>
                {(live?.message || issue.source === "FIELD") && (
                    <p className="mt-1.5 text-sm text-foreground">{live?.message ?? (mine ? "Signalée par vous" : `Signalée par ${issue.report?.byName ?? "un collègue"}`)}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CheckTag issue={issue} me={me} />
                    {issue.recurrence && issue.status !== "RESOLVED" && <Tag tone="warn"><Repeat className="size-3" aria-hidden="true" /> Déjà fausse alerte</Tag>}
                    {request && <Tag tone={REQUEST_STATUS[request.status].tone}><Hand className="size-3" aria-hidden="true" /> Demande {REQUEST_STATUS[request.status].label.toLowerCase()}</Tag>}
                </div>
            </Link>
        </li>
    );
}

export default function FieldAlerts() {
    const { issues, loaded, error } = useAlertState();
    const fleet = useTwinFeed();
    const me = useMe();
    const notice = useLocation().state?.notice;

    // to check first, then his own checks, then the rest; worst first, newest first
    const rank = { critical: 0, warning: 1 };
    const order = (i) => (i.verification === "TO_CHECK" ? 0 : i.check?.technicianEmail === me && i.verification === "CHECK_ORDERED" ? 1 : 2);
    const open = issues.filter((i) => i.status !== "RESOLVED")
        .sort((a, b) => order(a) - order(b) || rank[a.severity] - rank[b.severity] || b.raisedAt - a.raisedAt);
    const closed = issues.filter((i) => i.status === "RESOLVED");
    const sites = [...new Set(open.map((i) => i.site).filter(Boolean))];
    const toCheck = open.filter((i) => i.verification === "TO_CHECK").length;

    return (
    <Layout active="fieldAlerts">
        <div className="flex flex-wrap items-end justify-between gap-3">
            <PageHeader title="Alertes"
                subtitle={sites.length === 1 ? `Les pompes de ${sites[0]}. Vérifiez sur place avant toute intervention.` : "Vérifiez sur place avant toute intervention."} />
            <Button asChild className="max-sm:w-full">
                <Link to="/terrain/signaler"><Megaphone aria-hidden="true" /> Signaler une panne</Link>
            </Button>
        </div>

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6 space-y-6">
            {!loaded && <ListSkeleton />}
            {loaded && error && <ErrorBanner message={serverMessage(error, "Les alertes n'ont pas pu être chargées. Vérifiez votre connexion.")} />}
            {loaded && !error && open.length === 0 && (
                <EmptyState icon="✅" title="Aucune alerte sur vos pompes" hint="Si vous constatez une panne, signalez-la : votre manager la recevra comme une alerte." />
            )}
            {open.length > 0 && (
                <section>
                    <MicroLabel as="h2" className="mb-2">
                        En cours · {open.length}{toCheck > 0 ? ` · ${toCheck} ${plural(toCheck, "à vérifier")}` : ""}
                    </MicroLabel>
                    <ul className="space-y-2">
                        {open.map((issue) => (
                            <AlertCard key={issue.number} issue={issue} me={me} now={fleet.updatedAt}
                                live={fleet.alerts.find((a) => a.id === issue.key)} />
                        ))}
                    </ul>
                </section>
            )}
            {closed.length > 0 && (
                <section>
                    <MicroLabel as="h2" className="mb-2">Vos signalements clos · {closed.length}</MicroLabel>
                    <ul className="space-y-2">
                        {closed.map((issue) => <AlertCard key={issue.number} issue={issue} me={me} now={fleet.updatedAt} />)}
                    </ul>
                </section>
            )}
        </div>
    </Layout>);
}

// ---- one alert ----

// the pump's readings now, the alert's metric first
const READINGS = [
    { key: "vibration_mms", label: "Vibrations", unit: "mm/s", digits: 2 },
    { key: "bearing_temp_c", label: "Palier", unit: "°C", digits: 1 },
    { key: "flow_m3h", label: "Débit", unit: "m³/h", digits: 0 },
    { key: "pressure_bar", label: "Pression", unit: "bar", digits: 1 },
];

function LiveReadings({ pump, metric }) {
    const state = STATE[pump.state];
    const StateIcon = state?.icon;
    const readings = [...READINGS].sort((a, b) => Number(b.key === metric) - Number(a.key === metric));
    return (
        <Box title="La pompe d'après le système">
            <p className="mb-3 flex items-center gap-2 text-sm text-foreground">
                {StateIcon && <StateIcon className={cn("size-4", TONE[state.tone].text)} aria-hidden="true" />}
                {state?.label ?? pump.state} · {pump.model} · {pump.siteName}
            </p>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                {readings.map(({ key, label, unit, digits }) => (
                    <div key={key} className={cn("bg-card px-3 py-2", key === metric && "bg-accent")}>
                        <MicroLabel as="dt">{label}{key === metric ? " · alerte" : ""}</MicroLabel>
                        <dd className="mt-0.5 font-data text-lg tabular-nums text-foreground">{num(pump.metrics[key], digits)} <span className="text-xs text-subtle">{unit}</span></dd>
                    </div>
                ))}
            </dl>
        </Box>
    );
}

// what he does about the check: start it, continue his, see who has it, or what came of it
function CheckBox({ issue, me, pump }) {
    const navigate = useNavigate();
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState(null);
    const check = issue.check;
    const mine = check?.technicianEmail === me;
    const request = myRequest(issue, me);

    const start = async () => {
        setStarting(true);
        setError(null);
        try {
            const taskId = await selfCheck(issue.number, suggestedPoints(issue, pump));
            navigate(`/tasks/${taskId}?onglet=rapport`);
        }
        catch (err) {
            setError(serverMessage(err, "La levée de doute n'a pas pu être démarrée. Réessayez."));
            setStarting(false);
        }
    };

    if (issue.status === "RESOLVED") {
        return (
            <Box title="Alerte close">
                <p className="text-sm text-foreground">Votre manager l'a close{issue.closeReason ? ` : ${CLOSE_REASON[issue.closeReason].toLowerCase()}` : ""}.</p>
                {issue.closeComment && <p className="mt-1 text-sm text-muted-foreground">« {issue.closeComment} »</p>}
            </Box>
        );
    }

    if (issue.verification === "TO_CHECK") {
        return (
            <Box title="Levée de doute">
                <p className="text-sm text-foreground">Personne ne vérifie cette alerte pour l'instant. Vous êtes sur place ?</p>
                {issue.recurrence && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-sm border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-sm text-foreground">
                        <Repeat className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                        <span>{repeatSummary(issue.recurrence, { by: true })}. Un point du rapport y revient.</span>
                    </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Une tâche « Levée de doute » est créée pour vous et votre manager en est informé. Vous remplissez le rapport depuis vos Tâches.</p>
                {error && <p role="alert" className="mt-2 text-sm text-crit">{error}</p>}
                <Button className="mt-3 w-full sm:w-auto" onClick={start} disabled={starting}>
                    <Search aria-hidden="true" /> {starting ? "Création…" : "Faire la levée de doute"}
                </Button>
            </Box>
        );
    }

    if (issue.verification === "CHECK_ORDERED") {
        if (!mine) {
            return (
                <Box title="Levée de doute">
                    <p className="flex items-center gap-2 text-sm text-foreground">
                        <Clock className="size-4 text-standby" aria-hidden="true" /> En cours par {check?.technicianName ?? check?.technicianEmail ?? "un collègue"}.
                    </p>
                </Box>
            );
        }
        const what = {
            ASSIGNED: ["Votre manager vous envoie cette levée de doute.", "Ouvrir la tâche", ""],
            STARTED: ["Votre levée de doute est en cours.", "Continuer le rapport", "?onglet=rapport"],
            BLOCKED: ["Votre levée de doute est en attente.", "Ouvrir la tâche", ""],
            RETURNED: ["Votre manager vous renvoie le rapport à compléter.", "Compléter le rapport", ""],
        }[check.taskStatus] ?? ["Votre levée de doute est en cours.", "Ouvrir la tâche", ""];
        return (
            <Box title="Votre levée de doute">
                <p className="text-sm text-foreground">{what[0]}</p>
                {check.taskStatus === "RETURNED" && check.statusComment && <p className="mt-1 rounded-sm bg-warn/10 px-3 py-2 text-sm text-foreground">« {check.statusComment} »</p>}
                <Button asChild className="mt-3 w-full sm:w-auto"><Link to={`/tasks/${check.taskId}${what[2]}`}><ClipboardCheck aria-hidden="true" /> {what[1]}</Link></Button>
            </Box>
        );
    }

    // a verdict is in: what it says, his request if he made one, and that the manager decides
    const state = VERIFICATION_STATE[issue.verification];
    const by = check ? (mine ? "vous" : check.technicianName ?? check.technicianEmail) : null;
    return (
        <Box title="Levée de doute">
            <p className={cn("text-sm font-medium", TONE[state.tone].text)}>
                {check?.verdict ? CHECK_VERDICT[check.verdict].label : state.label}{by ? <span className="font-normal text-muted-foreground"> · par {by}</span> : null}
            </p>
            {check?.urgentStop && <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-crit"><OctagonX className="size-4" aria-hidden="true" /> Arrêt immédiat recommandé</p>}
            {request?.status === "PENDING" && (
                <p className="mt-2 flex items-center gap-2 text-sm text-foreground"><Clock className="size-4 text-warn" aria-hidden="true" /> Votre demande d'intervenir attend la réponse de votre manager.</p>
            )}
            {request?.status === "ACCEPTED" && (
                <div className="mt-2">
                    <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle2 className="size-4 text-ok" aria-hidden="true" /> Demande acceptée{request.decidedByName ? ` par ${request.decidedByName}` : ""} : la tâche est dans vos Tâches.</p>
                    {request.taskId && <Button asChild size="sm" className="mt-2"><Link to={`/tasks/${request.taskId}`}>Ouvrir la tâche</Link></Button>}
                </div>
            )}
            {request?.status === "REFUSED" && (
                <div className="mt-2 rounded-sm border border-border bg-muted px-3 py-2 text-sm">
                    <p className="font-medium text-foreground">Votre demande a été refusée{request.decidedByName ? ` par ${request.decidedByName}` : ""}.</p>
                    {request.comment && <p className="mt-0.5 text-muted-foreground">« {request.comment} »</p>}
                </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Votre manager lit le rapport et décide de la suite. Seul lui peut clore l'alerte.</p>
        </Box>
    );
}

// his own check report, as his manager reads it
function MyReport({ issue }) {
    const { check, error } = useCheck(issue.check.taskId, issue.check.round);
    if (error) return <ErrorBanner message={error} />;
    if (!check?.reports?.length) return null;
    return (
        <Box title={issue.source === "FIELD" ? "Votre signalement" : "Votre rapport"} action={<CheckPdfButton taskId={check.taskId} />}>
            <CheckReportView check={check} report={check.reports[0]} />
        </Box>
    );
}

export function FieldAlertDetail() {
    const number = Number(useParams().number);
    const { issues, loaded, error } = useAlertState();
    const fleet = useTwinFeed();
    const me = useMe();
    const notice = useLocation().state?.notice;
    const issue = issues.find((i) => i.number === number);

    const back = (
        <Link to="/terrain" className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden="true" /> Alertes
        </Link>
    );
    if (!issue) {
        return (
            <Layout active="fieldAlerts">
                {back}
                <div className="mt-4">
                    {!loaded ? <ListSkeleton />
                        : error ? <ErrorBanner message={serverMessage(error, "Les alertes n'ont pas pu être chargées.")} />
                        : <EmptyState icon="🔎" title={`Alerte #${number || "?"} introuvable`} hint="Elle a été close, ou elle concerne un autre site." />}
                </div>
            </Layout>
        );
    }

    const pump = fleet.pumps.find((p) => p.pumpId === issue.pumpId);
    const live = fleet.alerts.find((a) => a.id === issue.key);
    const kind = ALERT_KINDS[issue.kind] ?? ALERT_KINDS.field;
    const field = issue.source === "FIELD";
    const mine = issue.report?.by === me;
    const status = ISSUE_STATUS[issue.status];
    const myCheckReport = issue.check?.technicianEmail === me && issue.check?.round;
    const legacyReport = field && issue.report && !issue.check;

    return (
    <Layout active="fieldAlerts">
        {back}
        {notice && <Notice>{notice}</Notice>}

        <header className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
                <SeverityTag severity={live?.severity ?? issue.severity} />
                <CheckTag issue={issue} me={me} />
                <span className="font-data text-[11px] text-subtle">#{issue.number} · {status?.label ?? issue.status}</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{caseTitle(issue)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-data">{issue.pumpId}</span> · {issue.site ?? "site inconnu"} · levée le {formatDateTime(new Date(issue.raisedAt).toISOString())}
                {field && <> · signalée par {mine ? "vous" : issue.report?.byName ?? issue.report?.by}</>}
            </p>
            {live && <p className="mt-2 text-sm font-medium text-foreground">{live.message}</p>}
        </header>

        <div className="mt-5 space-y-4">
            <CheckBox issue={issue} me={me} pump={pump} />

            {myCheckReport && <MyReport issue={issue} />}

            {legacyReport && (
                <Box title={mine ? "Votre signalement" : "Le signalement"}>
                    {issue.report.equipmentModel && <p className="text-sm text-muted-foreground">Modèle {issue.report.equipmentModel}</p>}
                    {issue.report.description && <p className="mt-1 whitespace-pre-line text-sm text-foreground">{issue.report.description}</p>}
                    {issue.report.imageIds?.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {issue.report.imageIds.map((id, i) => <AuthPhoto key={id} imageId={id} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full" />)}
                        </div>
                    )}
                </Box>
            )}

            {pump && <LiveReadings pump={pump} metric={kind.metric} />}

            {/* the points "Faire la levée de doute" puts in his check (a repeat's point about the false alarm included) */}
            {!field && issue.verification === "TO_CHECK" && (
                <Box title="Ce que la levée de doute fait vérifier">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {suggestedPoints(issue, pump).map((point) => <li key={point.label}>{point.label}{point.photoRequired ? " (photo)" : ""}</li>)}
                    </ul>
                </Box>
            )}

            <p className="text-center text-sm">
                <Link to={`/terrain/signaler?pompe=${encodeURIComponent(issue.pumpId)}`} className="font-medium text-primary hover:underline">
                    Autre chose sur cette pompe ? Signaler une panne
                </Link>
            </p>
        </div>
    </Layout>);
}

// ---- a fault report ----

const OTHER = "__other__";

export function FieldReportForm() {
    const fleet = useTwinFeed();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [pumpChoice, setPumpChoice] = useState(searchParams.get("pompe") ?? "");
    const [otherPump, setOtherPump] = useState("");
    const [otherModel, setOtherModel] = useState("");
    const [otherSite, setOtherSite] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [severity, setSeverity] = useState(null);
    const [sections, setSections] = useState(() => [{ key: newKey(), title: "", comment: "", photos: [] }]);
    const [urgentStop, setUrgentStop] = useState(false);
    const [next, setNext] = useState(emptyNext);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    const bySite = useMemo(() => SITES.map((site) => ({ site, pumps: fleet.pumps.filter((p) => p.site === site.code) })), [fleet.pumps]);
    const pump = fleet.pumps.find((p) => p.pumpId === pumpChoice);
    const other = pumpChoice === OTHER;
    const pumpId = other ? otherPump.trim() : pumpChoice;
    const uploading = sections.some((s) => s.photos.some((p) => !p.id));
    const nextMissing = nextStepProblems(next);
    const ready = pumpId && title.trim() && severity && !uploading && nextMissing.length === 0;

    const submit = async (event) => {
        event.preventDefault();
        if (!ready) return;
        setSending(true);
        setError(null);
        try {
            const created = await reportFault({
                pumpId,
                equipmentModel: other ? otherModel.trim() || null : pump?.model ?? null,
                site: other ? otherSite || null : pump?.siteName ?? null,
                title: title.trim(),
                description: description.trim() || null,
                severity,
                report: { sections: sectionsBody(sections), urgentStop, ...nextStepBody(next) },
            });
            navigate(`/terrain/${created.number}`, { state: { notice: "Panne signalée : votre manager la reçoit comme une alerte confirmée." } });
        }
        catch (err) {
            setError(serverMessage(err, "Le signalement n'a pas pu être envoyé. Vérifiez votre connexion et réessayez."));
            setSending(false);
        }
    };

    return (
    <Layout active="fieldAlerts">
        <Link to="/terrain" className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden="true" /> Alertes
        </Link>
        <div className="mt-4">
            <PageHeader title="Signaler une panne" subtitle="Une panne que le système n'a pas détectée. Votre constat vaut levée de doute : votre manager la reçoit comme une alerte confirmée." />
        </div>

        <form onSubmit={submit} noValidate className="mt-6 space-y-5">
            <div>
                <label htmlFor="report-pump" className={labelClass}>Pompe</label>
                <select id="report-pump" value={pumpChoice} onChange={(e) => setPumpChoice(e.target.value)} className={cn(inputClass, "mt-1.5")}>
                    <option value="">Choisissez la pompe…</option>
                    {bySite.map(({ site, pumps }) => (
                        <optgroup key={site.code} label={site.name}>
                            {pumps.map((p) => <option key={p.pumpId} value={p.pumpId}>{p.pumpId} · {p.model}</option>)}
                        </optgroup>
                    ))}
                    <option value={OTHER}>Autre équipement…</option>
                </select>
                {pump && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {pump.model} · {pump.siteName} · {STATE[pump.state]?.label ?? pump.state} d'après le système
                    </p>
                )}
                {other && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <input aria-label="Identifiant de l'équipement" value={otherPump} onChange={(e) => setOtherPump(e.target.value)} placeholder="Identifiant (ex. P-104)" className={inputClass} />
                        <input aria-label="Modèle" value={otherModel} onChange={(e) => setOtherModel(e.target.value)} placeholder="Modèle" className={inputClass} />
                        <select aria-label="Site" value={otherSite} onChange={(e) => setOtherSite(e.target.value)} className={inputClass}>
                            <option value="">Site…</option>
                            {SITES.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <div>
                <label htmlFor="report-title" className={labelClass}>Ce que vous constatez</label>
                <input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255}
                    placeholder="Ex. : fuite au presse-étoupe" className={cn(inputClass, "mt-1.5")} />
            </div>

            <div>
                <label htmlFor="report-description" className={labelClass}>Détails <span className="font-normal text-muted-foreground">(facultatif)</span></label>
                <textarea id="report-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="Depuis quand, bruit, odeur, mesures relevées…" className={cn(inputClass, "mt-1.5")} />
            </div>

            <fieldset>
                <legend className={labelClass}>Gravité</legend>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    {[["warning", "Avertissement", "La pompe tourne, mais quelque chose ne va pas."], ["critical", "Critique", "Risque d'arrêt ou de casse : à traiter vite."]].map(([value, name, hint]) => {
                        const { tone, icon: Icon } = SEVERITY[value];
                        return (
                            <label key={value} className={cn("flex cursor-pointer gap-3 rounded-sm border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring",
                                severity === value ? cn("border-current", TONE[tone].soft) : "border-input hover:bg-accent")}>
                                <input type="radio" name="severity" value={value} checked={severity === value} onChange={() => setSeverity(value)} className="sr-only" />
                                <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[tone].text)} aria-hidden="true" />
                                <span>
                                    <span className="block text-sm font-medium text-foreground">{name}</span>
                                    <span className="block text-xs text-muted-foreground">{hint}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <Box title="Photos et constats">
                <SectionsEditor sections={sections} setSections={setSections} pumpId={pumpId} placeholder="Ex. : Presse-étoupe, plaque signalétique" />
            </Box>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-crit/30 bg-crit/5 px-4 py-3">
                <input type="checkbox" checked={urgentStop} onChange={(e) => setUrgentStop(e.target.checked)} className="mt-0.5 size-4 accent-[var(--crit)]" />
                <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><OctagonX className="size-4 text-crit" aria-hidden="true" /> Arrêt immédiat recommandé</span>
                    <span className="block text-xs text-muted-foreground">Risque pour la pompe ou les personnes : l'alerte arrive en urgence chez votre manager.</span>
                </span>
            </label>

            <Box title="La suite">
                <NextStepEditor next={next} setNext={setNext} />
            </Box>

            {error && <p role="alert" className="rounded-sm border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}

            <Button type="submit" className="w-full" disabled={!ready || sending}>
                <Check aria-hidden="true" /> {sending ? "Envoi…" : uploading ? "Envoi des photos…" : "Envoyer le signalement"}
            </Button>
            {!ready && !uploading && (
                <p className="text-center text-xs text-muted-foreground">
                    {!pumpId || !title.trim() || !severity ? "Choisissez la pompe, dites ce que vous constatez et la gravité." : nextMissing[0]}
                </p>
            )}
        </form>
    </Layout>);
}
