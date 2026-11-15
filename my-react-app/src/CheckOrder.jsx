// "Demander une levée de doute" (/alerts/:number/verification): the manager sends the check of an
// alert to one technician of his team, the ones on the alert's site and the least busy first. The
// points to check are suggested from the alert (a photo of the pump, the reading it is about with
// what the system reads now, the kind's checks; for an alert back after a false alarm, a point about
// what was found then); he ticks, adds, requires a photo, reorders. The technician who made that
// earlier check is marked.
//
//   team  ← GET  /api/v1/team                     (his technicians, their site and active tasks)
//   send  → POST /api/v1/alerts/:number/checks    (the technician's check task: alertStore.orderCheck)
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Camera, ClipboardCheck, Plus, Repeat, Trash2 } from "lucide-react";
import Layout from "./Layout";
import { apiClient } from "./apiClient";
import { useFleet } from "./fleetSimulator";
import { caseTitle, repeatSummary, suggestedPoints } from "./alertContent";
import { orderCheck, useAlertState } from "./alertStore";
import { Card, EmptyState, ErrorBanner, ListSkeleton } from "./managerUi";
import { PRIORITY_LABEL, plural, serverMessage } from "./managerUtils";
import { num } from "./dashboard/tokens";

const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];
const inputClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const iconButton =
    "rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100";

let counter = 0;
const withKey = (point) => ({ ...point, key: `p${counter++}`, included: true });

// the team, the alert's site first, then the least busy
function useTeam() {
    const [team, setTeam] = useState({ members: null, error: null });
    useEffect(() => {
        let cancelled = false;
        apiClient.get("/api/v1/team")
            .then(({ data }) => !cancelled && setTeam({ members: data.members ?? [], error: null }))
            .catch((err) => !cancelled && setTeam({ members: null, error: serverMessage(err, "Votre équipe n'a pas pu être chargée.") }));
        return () => { cancelled = true; };
    }, []);
    return team;
}

function PointsEditor({ points, setPoints }) {
    const [label, setLabel] = useState("");
    const [measure, setMeasure] = useState(false);
    const [unit, setUnit] = useState("");
    const update = (key, patch) => setPoints((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    const move = (index, by) => setPoints((list) => {
        const next = [...list];
        const [item] = next.splice(index, 1);
        next.splice(index + by, 0, item);
        return next;
    });
    // not a <form>: it sits inside the page's form, and a nested form would submit (and reload) the page
    const add = () => {
        if (!label.trim()) return;
        setPoints((list) => [...list, withKey({ label: label.trim(), kind: measure ? "MEASURE" : "STATE", unit: measure ? unit.trim() || null : null,
            twinValue: null, warnLimit: null, critLimit: null, photoRequired: false, custom: true })]);
        setLabel(""); setUnit(""); setMeasure(false);
    };
    return (
        <div>
            <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {points.map((p, index) => (
                    <li key={p.key} className={`flex items-start gap-3 px-3 py-2.5 ${p.included ? "" : "opacity-50"}`}>
                        <input type="checkbox" checked={p.included} onChange={(e) => update(p.key, { included: e.target.checked })}
                            aria-label={`Inclure : ${p.label}`} className="mt-1 h-4 w-4 accent-[#1A75BC]" />
                        <div className="min-w-0 flex-1">
                            {p.custom
                                ? <input value={p.label} onChange={(e) => update(p.key, { label: e.target.value })} maxLength={255} aria-label="Libellé du point"
                                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-900 hover:border-slate-300 focus:border-[#1A75BC] focus:outline-none dark:text-slate-100 dark:hover:border-slate-600" />
                                : <p className="text-sm text-slate-900 dark:text-slate-100">{p.label}</p>}
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                <span>{p.kind === "MEASURE" ? `Mesure${p.unit ? ` (${p.unit})` : ""}` : "À constater"}</span>
                                {p.kind === "MEASURE" && p.twinValue != null && <span>le système lit {num(p.twinValue, 1)} {p.unit}</span>}
                                {p.custom && <span>ajouté</span>}
                                <label className="inline-flex cursor-pointer items-center gap-1">
                                    <input type="checkbox" checked={p.photoRequired} onChange={(e) => update(p.key, { photoRequired: e.target.checked })} className="h-3.5 w-3.5 accent-[#1A75BC]" />
                                    <Camera className="h-3 w-3" aria-hidden="true" /> photo obligatoire
                                </label>
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Monter" className={iconButton}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                            <button type="button" onClick={() => move(index, 1)} disabled={index === points.length - 1} aria-label="Descendre" className={iconButton}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                            {p.custom && (
                                <button type="button" onClick={() => setPoints((list) => list.filter((x) => x.key !== p.key))} aria-label="Retirer le point" className={iconButton}>
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
            <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Ajouter un point
                    <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={255} placeholder="Ex. : état du presse-étoupe" className={inputClass}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
                </label>
                <label className="flex items-center gap-1.5 pb-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={measure} onChange={(e) => setMeasure(e.target.checked)} className="h-4 w-4 accent-[#1A75BC]" /> mesure
                </label>
                {measure && (
                    <label className="w-24 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Unité
                        <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={16} placeholder="°C" className={inputClass} />
                    </label>
                )}
                <button type="button" onClick={add} disabled={!label.trim()}
                    className="mb-px inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter
                </button>
            </div>
        </div>
    );
}

export default function CheckOrder() {
    const number = Number(useParams().number);
    const navigate = useNavigate();
    const { issues, loaded, error: storeError } = useAlertState();
    const fleet = useFleet();
    const team = useTeam();
    const issue = issues.find((i) => i.number === number);
    const pump = fleet.pumps.find((p) => p.pumpId === issue?.pumpId);

    const [points, setPoints] = useState(null);
    const [technician, setTechnician] = useState("");
    const [priority, setPriority] = useState(null);
    const [dueDate, setDueDate] = useState("");
    const [instructions, setInstructions] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    // the suggestion, once: what the system reads now goes with the measure
    if (issue && points === null) setPoints(suggestedPoints(issue, pump ?? null).map(withKey));
    if (issue && priority === null) setPriority(issue.priority);

    const members = useMemo(() => {
        if (!team.members || !issue) return [];
        const onSite = (m) => (m.worksite && issue.site && m.worksite.toLowerCase() === issue.site.toLowerCase() ? 0 : 1);
        return [...team.members].sort((a, b) => onSite(a) - onSite(b) || a.activeTasks - b.activeTasks || a.name.localeCompare(b.name));
    }, [team.members, issue]);

    const back = <Link to={`/alerts/${number}`} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">← Alerte #{number}</Link>;
    if (!issue || points === null) {
        return (
            <Layout active="alerts">
                {back}
                <div className="mt-4">
                    {!loaded || (issue && points === null) ? <ListSkeleton />
                        : storeError ? <ErrorBanner message={serverMessage(storeError, "Les alertes n'ont pas pu être chargées.")} />
                        : <EmptyState icon="🔎" title={`Alerte #${number || "?"} introuvable`} hint="Elle n'existe pas, ou plus." />}
                </div>
            </Layout>
        );
    }

    const included = points.filter((p) => p.included && p.label.trim());
    const ready = technician && included.length > 0 && included.length <= 30;
    const chosen = members.find((m) => m.email === technician);

    const send = async (event) => {
        event.preventDefault();
        if (!ready) return;
        setSending(true);
        setError(null);
        try {
            await orderCheck(number, {
                technicianEmail: technician,
                points: included.map(({ label, kind, unit, twinValue, warnLimit, critLimit, photoRequired, custom }) =>
                    ({ label: label.trim(), kind, unit, twinValue, warnLimit, critLimit, photoRequired, custom })),
                priority,
                dueDate: dueDate || null,
                instructions: instructions.trim() || null,
            });
            navigate(`/alerts/${number}`, { state: { notice: `Levée de doute envoyée à ${chosen?.name ?? technician} : elle est dans ses Tâches.` } });
        }
        catch (err) {
            setError(serverMessage(err, "La levée de doute n'a pas pu être envoyée. Réessayez."));
            setSending(false);
        }
    };

    return (
    <Layout active="alerts">
        {back}
        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Demander une levée de doute</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                #{issue.number} · {issue.pumpId} — {caseTitle(issue)}{issue.site ? ` · ${issue.site}` : ""}. Le technicien vérifie sur place
                et dit si l'alerte est vraie, avant toute intervention.
            </p>
            {issue.recurrence && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <Repeat className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{repeatSummary(issue.recurrence)}. Un point sur ce qui avait été constaté est ajouté à la liste.</span>
                </p>
            )}
        </header>

        <form onSubmit={send} className="mt-6 space-y-6">
            <Card title="Qui vérifie ?">
                {team.error && <ErrorBanner message={team.error} />}
                {!team.error && !team.members && <ListSkeleton />}
                {team.members && members.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Votre équipe est vide. <Link to="/technicians" className="font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">Ajoutez des techniciens</Link> d'abord.
                    </p>
                )}
                {members.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Technicien">
                        {members.map((m) => {
                            const onSite = m.worksite && issue.site && m.worksite.toLowerCase() === issue.site.toLowerCase();
                            const selected = technician === m.email;
                            return (
                                <label key={m.email} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                                    selected ? "border-[#1A75BC] bg-[#1A75BC]/5 dark:border-[#5BC6E8] dark:bg-[#5BC6E8]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                                    <input type="radio" name="technician" value={m.email} checked={selected} onChange={() => setTechnician(m.email)} className="mt-1 h-4 w-4 accent-[#1A75BC]" />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{m.name}</span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                                            {m.worksite ?? "Sans site"} · {m.activeTasks} {plural(m.activeTasks, "tâche en cours", "tâches en cours")}
                                            {onSite && <span className="ml-1 font-medium text-[#0a7f0a] dark:text-[#3fcf3f]">· sur le site</span>}
                                            {m.email === issue.recurrence?.technicianEmail && <span className="block font-medium text-slate-700 dark:text-slate-200">A fait la levée de doute de #{issue.recurrence.number}</span>}
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </Card>

            <Card title={`Points à vérifier · ${included.length}`}>
                <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Suggérés d'après l'alerte. Décochez, ajoutez, exigez une photo, changez l'ordre.</p>
                <PointsEditor points={points} setPoints={setPoints} />
                {included.length > 30 && <p className="mt-2 text-sm text-crit">30 points au plus.</p>}
            </Card>

            <Card title="La tâche">
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                        Priorité
                        <select value={priority ?? "NORMAL"} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                        </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                        À faire avant le <span className="font-normal">(facultatif)</span>
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
                    </label>
                </div>
                <label className="mt-4 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Consignes <span className="font-normal">(facultatif)</span>
                    <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={4000}
                        placeholder="Ex. : passer avant la relève de 14 h, la pompe ne doit pas être arrêtée." className={inputClass} />
                </label>
            </Card>

            {error && <ErrorBanner message={error} />}
            <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!ready || sending}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#1A75BC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#0F2A49] disabled:opacity-50">
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> {sending ? "Envoi…" : chosen ? `Envoyer à ${chosen.name}` : "Envoyer la levée de doute"}
                </button>
                {!technician && <p className="text-sm text-slate-500 dark:text-slate-400">Choisissez le technicien.</p>}
            </div>
        </form>
    </Layout>);
}
