// One technician of the manager's team, opened from the Techniciens tab: his profile, what his
// tasks add up to, and every task he was given, each with the reports he sent and its remarks.
//
//   profile ← GET    /api/v1/team/technicians/{id}  { technician, managerName, performance,
//                                                     tasks: [{ …, returns, reports: [], events: [] }] }
//   correct → PUT    /api/v1/team/technicians/{id}/account   { firstName, lastName, worksite }: the name his
//                                                            reports are signed with, and his site
//   reset   → POST   /api/v1/team/technicians/{id}/password  { password }: he forgot his password
//   remove  → DELETE /api/v1/team/technicians/{id}
//   a report: /technicians/:id/rapport/:submissionId (TechnicianReport below), the read-only
//   ReportView of the Review page. The backend lets a team's manager read all his technicians' reports.
import Layout from "./Layout";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ClipboardPlus, FileText, KeyRound, Mail, MessageSquareText, Pencil, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiClient } from "./apiClient";
import { Notice, PriorityBadge } from "./managerUi";
import { TASK_TYPE_LABEL, formatDateTime, formatDay, formatWorked, localIso, plural, serverMessage } from "./managerUtils";
import { MicroLabel, Panel, PanelEmpty, PanelError, PanelSkeleton } from "./dashboard/primitives";
import { TONE } from "./dashboard/tokens";
import { ReportView } from "./ReviewReport";
import { Avatar, MIN_PASSWORD } from "./Technicians";
import { HISTORY_FILTERS, REASON_LABEL, REPORT_STATUS, TASK_STATE, eventLabel, orderQuery, percent } from "./teamUtils";

const dayOf = (instant) => (instant ? formatDay(localIso(new Date(instant))) : "—");

// ---- profile ----

function ProfileHeader({ technician, managerName, onAssign }) {
    return (
        <section className="console-rise flex flex-wrap items-start gap-4 rounded-md border border-border bg-card p-5">
            <Avatar name={technician.name} size="lg" />
            <div className="min-w-0 flex-1">
                <MicroLabel>Technicien{technician.worksite ? ` · ${technician.worksite}` : ""}</MicroLabel>
                <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">{technician.name}</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <a href={`mailto:${technician.email}`} className="inline-flex items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        <Mail className="size-3.5" aria-hidden="true" /> {technician.email}
                    </a>
                    <span>Équipe de {managerName}</span>
                </p>
            </div>
            <Button onClick={onAssign} className="max-sm:w-full">
                <ClipboardPlus aria-hidden="true" /> Assigner une tâche
            </Button>
        </section>
    );
}

// one stat tile: the number is the figure; color only on what waits for the manager
function Tile({ label, value, hint, tone, index }) {
    return (
        <div style={{ "--i": index }} className="console-rise relative flex min-w-0 flex-col bg-card px-4 py-3.5">
            {tone && <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", TONE[tone].rail)} />}
            <MicroLabel as="dt">{label}</MicroLabel>
            <dd className="mt-1.5 font-data text-[26px] font-medium leading-none tracking-tight text-foreground">{value}</dd>
            {hint && <dd className="mt-2 text-xs text-muted-foreground">{hint}</dd>}
        </div>
    );
}

function PerformanceTiles({ performance: p, tasks }) {
    const first = tasks.length ? tasks.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), tasks[0].createdAt) : null;
    const rightFirstTime = p.firstTimeRightRate == null ? 0 : Math.round(p.firstTimeRightRate * p.approved);
    const closedOther = [p.declined && `${p.declined} ${plural(p.declined, "refusée")}`, p.canceled && `${p.canceled} ${plural(p.canceled, "annulée")}`].filter(Boolean).join(", ");
    const tiles = [
        { label: "Tâches", value: p.totalTasks, hint: first ? `depuis le ${dayOf(first)}` : "aucune tâche pour l'instant" },
        { label: "En cours", value: p.activeTasks, hint: "à faire, démarrées, bloquées ou à corriger" },
        { label: "À valider", value: p.toReview, hint: "rapports qui attendent une revue", tone: p.toReview ? "standby" : null },
        { label: "Approuvées", value: p.approved, hint: closedOther || "aucune refusée ni annulée" },
        { label: "Bon du premier coup", value: percent(p.firstTimeRightRate), hint: p.approved ? `${rightFirstTime} sur ${p.approved} sans renvoi` : "pas encore de tâche approuvée" },
        { label: "Dans les délais", value: percent(p.onTimeRate), hint: p.onTimeRate == null ? "aucune tâche approuvée avec échéance" : "rapport envoyé avant l'échéance" },
        { label: "Temps moyen", value: formatWorked(p.averageWorkedSeconds), hint: "par tâche approuvée" },
        { label: "Renvois", value: p.returns, hint: "rapports renvoyés pour correction" },
    ];
    return (
        <section aria-label="Performance" className="mt-4">
            <MicroLabel as="h2" className="mb-2">Performance</MicroLabel>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
                {tiles.map((tile, index) => <Tile key={tile.label} {...tile} index={index} />)}
            </dl>
        </section>
    );
}

// ---- history ----

export function TaskStateBadge({ status }) {
    const state = TASK_STATE[status] ?? { label: status, tone: "neutral", icon: FileText };
    const Icon = state.icon;
    return (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
            <Icon className={cn("size-3.5", TONE[state.tone].text)} aria-hidden="true" />
            {state.label}
        </span>
    );
}

// what the line shows as its date: where the task is now
const dateLine = (task) => {
    if (task.closedAt) return `${TASK_STATE[task.status]?.label ?? "Clôturée"} le ${dayOf(task.closedAt)}`;
    if (task.submittedAt) return `Rapport le ${dayOf(task.submittedAt)}`;
    return `Assignée le ${dayOf(task.createdAt)}`;
};

const Fact = ({ label, children }) => (
    <div>
        <MicroLabel as="dt">{label}</MicroLabel>
        <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
);

function Reports({ task, technician }) {
    if (task.reports.length === 0) {
        return <p className="text-sm text-muted-foreground">Aucun rapport envoyé pour cette tâche.</p>;
    }
    const many = task.reports.length > 1;
    return (
        <ul className="space-y-2">
            {task.reports.map((report, i) => {
                const status = REPORT_STATUS[report.status];
                const current = i === task.reports.length - 1;
                const query = new URLSearchParams({ nom: technician.name, tache: task.title ?? "" });
                return (
                    <li key={report.id} className="rounded-sm border border-border bg-background/50 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="min-w-0 text-sm font-medium text-foreground">
                                {many && <span className="mr-1.5 font-data text-[11px] text-subtle">V{i + 1}</span>}
                                {report.formTitle ?? "Rapport"}
                                {many && !current && <span className="ml-2 text-xs font-normal text-muted-foreground">renvoyé</span>}
                            </p>
                            {status && (
                                <span className={cn("rounded-sm px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-[0.12em]", TONE[status.tone].soft, TONE[status.tone].text)}>
                                    {status.label}
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Envoyé le {formatDateTime(report.submittedAt)}{report.inspectionDate ? ` · inspection du ${formatDay(report.inspectionDate)}` : ""}
                        </p>
                        {report.remarks && <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-foreground">« {report.remarks} »</p>}
                        <Link to={`/technicians/${technician.id}/rapport/${report.id}?${query}`}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                            <FileText className="size-3.5" aria-hidden="true" /> Ouvrir le rapport
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

// who moved the task, when, and what they wrote
function Timeline({ events }) {
    if (events.length === 0) {
        return <p className="text-sm text-muted-foreground">Aucun événement enregistré pour cette tâche.</p>;
    }
    return (
        <ol className="relative space-y-3 border-l border-border pl-4">
            {events.map((event, i) => {
                const tone = TASK_STATE[event.toStatus]?.tone ?? "neutral";
                return (
                    <li key={i} className="relative">
                        <span aria-hidden="true" className={cn("absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-card", tone === "neutral" ? "bg-subtle" : TONE[tone].fill)} />
                        <p className="text-sm text-foreground">
                            <span className="font-medium">{eventLabel(event)}</span>
                            {event.reason && <span className="text-muted-foreground"> · {REASON_LABEL[event.reason] ?? event.reason}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {formatDateTime(event.occurredAt)} · {event.actorName ?? event.actorEmail}
                        </p>
                        {event.comment && (
                            <p className="mt-1 flex gap-1.5 rounded-sm bg-muted px-2.5 py-1.5 text-sm text-foreground">
                                <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                                <span className="whitespace-pre-line">{event.comment}</span>
                            </p>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

function TaskDetails({ task, technician }) {
    const assignedBy = task.events.find((e) => e.fromStatus == null && e.toStatus === "ASSIGNED")?.actorName ?? task.managerEmail;
    const late = task.dueDate && (task.submittedAt
        ? localIso(new Date(task.submittedAt)) > task.dueDate
        : !task.closedAt && localIso(new Date()) > task.dueDate);
    return (
        <div className="grid gap-5 border-t border-border bg-background/40 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="min-w-0 space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Fact label="Assignée le">{formatDateTime(task.createdAt)}</Fact>
                    <Fact label="Démarrée le">{formatDateTime(task.firstStartedAt)}</Fact>
                    <Fact label="Rapport le">{formatDateTime(task.submittedAt)}</Fact>
                    <Fact label="Échéance">
                        {task.dueDate ? formatDay(task.dueDate) : "—"}
                        {late && <span className="ml-1.5 font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">en retard</span>}
                    </Fact>
                    <Fact label="Temps travaillé">{formatWorked(task.workedSeconds)}</Fact>
                    <Fact label="Assignée par">{assignedBy}{task.workshop && <span className="ml-1.5 text-xs text-muted-foreground">(atelier)</span>}</Fact>
                </dl>
                {(task.statusReason || task.statusComment) && ["BLOCKED", "RETURNED", "DECLINED", "CANCELED", "REJECTED"].includes(task.status) && (
                    <div className="rounded-sm border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-foreground">
                        <MicroLabel className="text-warn">Motif · {TASK_STATE[task.status]?.label}</MicroLabel>
                        <p className="mt-0.5">{[REASON_LABEL[task.statusReason], task.statusComment].filter(Boolean).join(" — ")}</p>
                    </div>
                )}
                {task.instructions && (
                    <div>
                        <MicroLabel as="h4">Consignes</MicroLabel>
                        <p className="mt-1 whitespace-pre-line text-sm text-foreground">{task.instructions}</p>
                    </div>
                )}
                <div>
                    <MicroLabel as="h4" className="mb-1.5">{plural(task.reports.length, "Rapport")}</MicroLabel>
                    <Reports task={task} technician={technician} />
                </div>
            </div>
            <div className="min-w-0">
                <MicroLabel as="h4" className="mb-2">Remarques et chronologie</MicroLabel>
                <Timeline events={task.events} />
            </div>
        </div>
    );
}

function TaskRow({ task, technician, open, onToggle }) {
    return (
        <li>
            <button type="button" onClick={onToggle} aria-expanded={open}
                className={cn("flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    open && "bg-accent/40")}>
                <span className="w-24 shrink-0 pt-0.5 max-sm:w-auto"><TaskStateBadge status={task.status} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{task.title}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span className="font-data">{task.equipmentId}</span>
                        <span aria-hidden="true">·</span>
                        <span>{TASK_TYPE_LABEL[task.taskType] ?? task.taskType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dateLine(task)}</span>
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 pt-0.5">
                    {task.returns > 0 && (
                        <span className="rounded-sm bg-warn/10 px-1.5 font-data text-[10px] font-semibold leading-5 text-warn">
                            {task.returns} {plural(task.returns, "renvoi")}
                        </span>
                    )}
                    {task.reports.length > 0 && (
                        <span className="hidden items-center gap-1 font-data text-[11px] text-subtle sm:inline-flex" title={`${task.reports.length} ${plural(task.reports.length, "rapport")}`}>
                            <FileText className="size-3.5" aria-hidden="true" />{task.reports.length}
                        </span>
                    )}
                    <span className="hidden sm:inline"><PriorityBadge priority={task.priority} /></span>
                    <ChevronDown className={cn("size-4 text-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
                </span>
            </button>
            {open && <TaskDetails task={task} technician={technician} />}
        </li>
    );
}

function History({ tasks, technician }) {
    const [filter, setFilter] = useState("ALL");
    const [openId, setOpenId] = useState(null);
    const counts = useMemo(() => Object.fromEntries(HISTORY_FILTERS.map((f) => [f.value, tasks.filter(f.test).length])), [tasks]);
    const shown = tasks.filter(HISTORY_FILTERS.find((f) => f.value === filter).test);

    return (
        <Panel id="historique" label="Historique" title="Tâches" meta={`${shown.length} sur ${tasks.length}`} className="mt-6 rounded-md border border-border"
            toolbar={tasks.length > 0 && (
                <ToggleGroup type="single" value={filter} onValueChange={(v) => setFilter(v || "ALL")} spacing={1} size="sm"
                    aria-label="Filtrer les tâches" className="flex-wrap">
                    {HISTORY_FILTERS.map((f) => (
                        <ToggleGroupItem key={f.value} value={f.value} disabled={f.value !== "ALL" && counts[f.value] === 0}
                            aria-label={`${f.label}, ${counts[f.value]}`}
                            className="h-7 gap-1.5 rounded-sm px-2 text-xs text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground">
                            {f.label}
                            <span className="font-data text-[10px] tabular-nums text-subtle">{counts[f.value]}</span>
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            )}>
            {tasks.length === 0 && (
                <PanelEmpty icon={ClipboardPlus} tone="neutral" title="Aucune tâche pour l'instant"
                    hint="Les tâches que vous lui assignez apparaîtront ici, avec leurs rapports et leurs remarques." />
            )}
            {tasks.length > 0 && shown.length === 0 && (
                <PanelEmpty icon={FileText} tone="neutral" title="Aucune tâche dans ce filtre"
                    action={<Button variant="outline" size="sm" onClick={() => setFilter("ALL")}>Voir toutes les tâches</Button>} />
            )}
            {shown.length > 0 && (
                <ul className="divide-y divide-border">
                    {shown.map((task) => (
                        <TaskRow key={task.id} task={task} technician={technician} open={openId === task.id}
                            onToggle={() => setOpenId((current) => (current === task.id ? null : task.id))} />
                    ))}
                </ul>
            )}
        </Panel>
    );
}

// ---- his account: the name he signs with, his site, his password ----

const fieldClass = "h-9 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const WORKSITES = ["Jorf", "Safi"];

// an account made before names were asked in two parts: the first word, then the rest
const splitName = (technician) => {
    if (technician.firstName || technician.lastName) return [technician.firstName ?? "", technician.lastName ?? ""];
    const [first, ...rest] = (technician.name ?? "").trim().split(/\s+/);
    return [first ?? "", rest.join(" ")];
};

function Account({ technician, onChanged }) {
    const [first, last] = splitName(technician);
    const [editing, setEditing] = useState(null); // "identity" | "password" | null
    const [form, setForm] = useState({ firstName: first, lastName: last, worksite: technician.worksite ?? "" });
    const [password, setPassword] = useState("");
    const [shown, setShown] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
    const open = (what) => { setEditing(what); setError(null); setDone(null); };

    const send = async (request, message) => {
        setSending(true);
        setError(null);
        try {
            await request();
            setEditing(null);
            setPassword("");
            setDone(message);
            onChanged();
        }
        catch (err) {
            const fields = err.response?.data?.errors;
            setError(fields && Object.keys(fields).length ? Object.values(fields).join(" ") : serverMessage(err, "La modification n'a pas pu être enregistrée. Réessayez."));
        }
        finally {
            setSending(false);
        }
    };
    const saveIdentity = (event) => {
        event.preventDefault();
        if (!form.firstName.trim() || !form.lastName.trim() || !form.worksite) { setError("Le prénom, le nom et le site sont obligatoires."); return; }
        send(() => apiClient.put(`/api/v1/team/technicians/${technician.id}/account`,
            { firstName: form.firstName.trim(), lastName: form.lastName.trim(), worksite: form.worksite }), "Le compte est à jour.");
    };
    const savePassword = (event) => {
        event.preventDefault();
        if (password.length < MIN_PASSWORD) { setError(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`); return; }
        send(() => apiClient.post(`/api/v1/team/technicians/${technician.id}/password`, { password }),
            "Le mot de passe est changé : communiquez-le-lui.");
    };

    const passwordLine = technician.passwordSetBySelf == null ? "Mot de passe défini avant le suivi des changements."
        : technician.passwordSetBySelf ? `Il a choisi lui-même son mot de passe le ${dayOf(technician.passwordSetAt)}.`
        : `Mot de passe défini par un manager le ${dayOf(technician.passwordSetAt)} : il peut le changer depuis « Mon compte ».`;

    return (
        <section className="mt-6 rounded-md border border-border bg-card px-4 py-4" aria-labelledby="account-title">
            <MicroLabel>Compte</MicroLabel>
            <h2 id="account-title" className="mt-1 text-sm font-semibold text-foreground">Identité et accès</h2>
            <p className="mt-1 text-xs text-muted-foreground">Ses rapports sont signés « {technician.name} ». {passwordLine}</p>
            {done && <p role="status" className="mt-2 text-sm text-ok">{done}</p>}

            {editing === null && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => open("identity")}><Pencil aria-hidden="true" /> Corriger le nom ou le site</Button>
                    <Button variant="outline" size="sm" onClick={() => open("password")}><KeyRound aria-hidden="true" /> Changer son mot de passe</Button>
                </div>
            )}

            {editing === "identity" && (
                <form onSubmit={saveIdentity} noValidate className="mt-3 grid max-w-xl gap-3 sm:grid-cols-3">
                    <label className="text-sm font-medium text-foreground">Prénom
                        <input className={cn(fieldClass, "mt-1.5")} value={form.firstName} onChange={set("firstName")} autoComplete="off" />
                    </label>
                    <label className="text-sm font-medium text-foreground">Nom
                        <input className={cn(fieldClass, "mt-1.5")} value={form.lastName} onChange={set("lastName")} autoComplete="off" />
                    </label>
                    <label className="text-sm font-medium text-foreground">Site
                        <select className={cn(fieldClass, "mt-1.5")} value={form.worksite} onChange={set("worksite")}>
                            <option value="">Choisir…</option>
                            {WORKSITES.map((site) => <option key={site} value={site}>{site}</option>)}
                        </select>
                    </label>
                    <p className="text-xs text-muted-foreground sm:col-span-3">Le nouveau nom s'affichera aussi sur ses rapports déjà envoyés.</p>
                    {error && <p role="alert" className="text-sm text-crit sm:col-span-3">{error}</p>}
                    <div className="flex gap-2 sm:col-span-3">
                        <Button type="submit" size="sm" disabled={sending}>{sending ? "Enregistrement…" : "Enregistrer"}</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={sending}>Annuler</Button>
                    </div>
                </form>
            )}

            {editing === "password" && (
                <form onSubmit={savePassword} noValidate className="mt-3 max-w-sm space-y-3">
                    <label className="block text-sm font-medium text-foreground">Nouveau mot de passe
                        <span className="mt-1.5 flex gap-2">
                            <input type={shown ? "text" : "password"} className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setShown((v) => !v)} aria-pressed={shown}>{shown ? "Masquer" : "Afficher"}</Button>
                        </span>
                    </label>
                    <p className="text-xs text-muted-foreground">{MIN_PASSWORD} caractères minimum. L'ancien ne fonctionnera plus.</p>
                    {error && <p role="alert" className="text-sm text-crit">{error}</p>}
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={sending}>{sending ? "Changement…" : "Changer le mot de passe"}</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={sending}>Annuler</Button>
                    </div>
                </form>
            )}
        </section>
    );
}

// ---- leaving the team ----

function RemoveFromTeam({ technician, onRemoved }) {
    const [confirming, setConfirming] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const remove = async () => {
        setSending(true);
        setError(null);
        try {
            await apiClient.delete(`/api/v1/team/technicians/${technician.id}`);
            onRemoved();
        }
        catch (err) {
            setError(serverMessage(err, "Le retrait n'a pas pu être fait. Réessayez."));
            setSending(false);
        }
    };
    return (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border px-4 py-3">
            <div>
                <p className="text-sm font-medium text-foreground">Retirer de l'équipe</p>
                <p className="text-xs text-muted-foreground">Son compte et ses tâches restent ; il pourra rejoindre une autre équipe.</p>
                {error && <p role="alert" className="mt-1 text-xs text-crit">{error}</p>}
            </div>
            {confirming ? (
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={sending}>Annuler</Button>
                    <Button variant="destructive" size="sm" onClick={remove} disabled={sending}>
                        {sending ? "Retrait…" : `Retirer ${technician.name}`}
                    </Button>
                </div>
            ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                    <UserMinus aria-hidden="true" /> Retirer de l'équipe
                </Button>
            )}
        </section>
    );
}

// ---- the page ----

const BackLink = ({ to, children }) => (
    <Link to={to} className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
);

const TechnicianProfile = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [loadError, setLoadError] = useState(null); // { status, message }
    const [attempt, setAttempt] = useState(0);
    // "« Vidange » a été envoyée à …": back from the assign form (AssignTask.jsx ?retour=)
    const notice = useLocation().state?.notice;

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        let cancelled = false;
        const loadProfile = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/team/technicians/${encodeURIComponent(id)}`);
                if (!cancelled) { setProfile(data); setLoadError(null); }
            }
            catch (err) {
                console.log("Error while fetching the technician's profile", err);
                const status = err.response?.status;
                const message = status === 403 ? "Ce technicien ne fait pas partie de votre équipe."
                    : status === 404 ? "Ce technicien n'existe pas ou n'a plus de compte."
                    : "La fiche n'a pas pu être chargée. Vérifiez votre connexion et réessayez.";
                if (!cancelled) setLoadError({ status, message });
            }
        };
        loadProfile();
        return () => { cancelled = true; };
    }, [id, attempt]);

    const retry = () => {
        setProfile(null);
        setLoadError(null);
        setAttempt((n) => n + 1);
    };

    const back = `/technicians${orderQuery(searchParams)}`;
    const technician = profile?.technician;
    const assign = () => navigate(`/assign/${encodeURIComponent(technician.email)}${orderQuery(searchParams, { name: technician.name, retour: `/technicians/${technician.id}` })}`);

    return (
    <Layout active="technicians" wide>
        <BackLink to={back}>Techniciens</BackLink>

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-4">
            {!profile && !loadError && (
                <div className="rounded-md border border-border bg-card"><PanelSkeleton rows={5} /></div>
            )}

            {loadError && (
                <div className="rounded-md border border-border bg-card">
                    <PanelError message={loadError.message} onRetry={loadError.status === 403 || loadError.status === 404 ? undefined : retry} />
                </div>
            )}

            {profile && (
                <>
                    <ProfileHeader technician={technician} managerName={profile.managerName} onAssign={assign} />
                    <PerformanceTiles performance={profile.performance} tasks={profile.tasks} />
                    <History tasks={profile.tasks} technician={technician} />
                    <Account key={`${technician.name}-${technician.worksite}`} technician={technician} onChanged={() => setAttempt((n) => n + 1)} />
                    <RemoveFromTeam technician={technician}
                        onRemoved={() => navigate("/technicians", { state: { notice: `${technician.name} ne fait plus partie de votre équipe.` } })} />
                </>
            )}
        </div>
    </Layout>)
}

// a report from the history, read-only, with the way back to the technician's page
export function TechnicianReport() {
    const { id, submissionId } = useParams();
    const [searchParams] = useSearchParams();
    const name = searchParams.get("nom");
    return (
    <Layout active="technicians">
        <BackLink to={`/technicians/${encodeURIComponent(id)}#historique`}>{name ? `Fiche de ${name}` : "Fiche du technicien"}</BackLink>
        <div className="mt-4">
            <ReportView submissionId={submissionId}>{() => null}</ReportView>
        </div>
    </Layout>)
}

export default TechnicianProfile;
