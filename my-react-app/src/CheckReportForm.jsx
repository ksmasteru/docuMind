// The check report (levée de doute) of one check task, filled on site from the task's Rapport tab
// (TaskScreen.jsx): the pump on arrival, each point to check (a result, the reading of a measure, a
// comment, photos), free photo sections, the conclusion, and what comes next when the alert is confirmed.
//
//   check  ← GET  /api/v1/checks/:taskId          (its points; a report sent back comes pre-filled)
//   send   → POST /api/v1/checks/:taskId/report   (the task is sent like any report; the verdict goes
//                                                  to the alert, and to the manager)
//
// Saved on the device as he goes (localStorage, per task), since the network on site comes and goes.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiClient } from "./apiClient";
import { submitCheck } from "./alertStore";
import {
    ARRIVAL_STATE, CHECK_RESULT, CHECK_VERDICT, FALSE_ALARM_CAUSE, INCONCLUSIVE_REASON, readingTone,
} from "./alertContent";
import { Box, CheckPdfButton, ChoiceCards, NextStepEditor, PhotoPicker, SectionsEditor, Tag } from "./CheckReportParts";
import {
    emptyNext, inputClass, knownPhotos, labelClass, newKey, nextStepBody, nextStepProblems, photoIds, sectionsBody,
} from "./checkReport";
import { ErrorBanner, ListSkeleton } from "./managerUi";
import { serverMessage } from "./managerUtils";
import { num } from "./dashboard/tokens";

const draftKey = (taskId) => `greensense.check.${taskId}`;

const fresh = (points) => ({
    arrivalState: null,
    results: Object.fromEntries(points.map((p) => [p.id, { result: null, reading: "", comment: "", photos: [] }])),
    sections: [],
    verdict: null, falseAlarmCause: null, inconclusiveReason: null, urgentStop: false, comment: "",
    next: emptyNext,
});

// a report sent back: his last round, to complete rather than redo
const fromReport = (points, report) => {
    const state = fresh(points);
    report.results.forEach((r) => {
        if (state.results[r.pointId])
            state.results[r.pointId] = { result: r.result, reading: r.reading ?? "", comment: r.comment ?? "", photos: knownPhotos(r.photos) };
    });
    return {
        ...state,
        arrivalState: report.arrivalState,
        sections: report.sections.map((s) => ({ key: newKey(), title: s.title ?? "", comment: s.comment ?? "", photos: knownPhotos(s.photos) })),
        verdict: report.verdict, falseAlarmCause: report.falseAlarmCause, inconclusiveReason: report.inconclusiveReason,
        urgentStop: report.urgentStop, comment: report.comment ?? "",
        next: report.canHandle == null ? emptyNext : {
            canHandle: report.canHandle, handleMessage: report.handleMessage ?? "", estimatedHours: report.estimatedHours ?? "",
            partsNeeded: report.partsNeeded ?? "", cannotHandleReason: report.cannotHandleReason, cannotHandleComment: report.cannotHandleComment ?? "",
        },
    };
};

// the draft keeps the photos the server has; one still uploading when the page closed is lost
const storable = (form) => JSON.stringify({
    ...form,
    results: Object.fromEntries(Object.entries(form.results).map(([id, r]) => [id, { ...r, photos: r.photos.filter((p) => p.id).map(({ key, id: pid }) => ({ key, id: pid })) }])),
    sections: form.sections.map((s) => ({ ...s, photos: s.photos.filter((p) => p.id).map(({ key, id }) => ({ key, id })) })),
});

const readDraft = (taskId, points) => {
    try {
        const saved = JSON.parse(localStorage.getItem(draftKey(taskId)) ?? "null");
        if (!saved) return null;
        // the points are the server's: a draft only fills the ones that still exist
        const base = fresh(points);
        Object.keys(base.results).forEach((id) => { if (saved.results?.[id]) base.results[id] = saved.results[id]; });
        return { ...base, ...saved, results: base.results, next: { ...emptyNext, ...saved.next } };
    }
    catch {
        return null;
    }
};

// what still keeps the report from being sent, in his words
function problems(points, form) {
    const list = [];
    if (!form.arrivalState) list.push("L'état de la pompe à votre arrivée.");
    points.forEach((p) => {
        const r = form.results[p.id];
        const name = `« ${p.label} »`;
        if (!r?.result) { list.push(`${name} : un résultat.`); return; }
        if (r.result !== "OK" && !r.comment.trim()) list.push(`${name} : ce que vous avez constaté.`);
        if (p.kind === "MEASURE" && r.result !== "NOT_CHECKABLE" && r.reading === "") list.push(`${name} : la valeur relevée.`);
        if (p.photoRequired && r.result !== "NOT_CHECKABLE" && photoIds(r.photos).length === 0) list.push(`${name} : une photo.`);
    });
    if (!form.verdict) list.push("Votre conclusion.");
    if (form.verdict === "FALSE_ALARM" && !form.falseAlarmCause) list.push("Pourquoi l'alerte est fausse.");
    if (form.verdict === "INCONCLUSIVE" && !form.inconclusiveReason) list.push("Ce qui vous a empêché de conclure.");
    if (form.verdict === "INCONCLUSIVE" && !form.comment.trim()) list.push("Quelques mots sur pourquoi vous n'avez pas pu conclure.");
    if (form.verdict === "CONFIRMED") list.push(...nextStepProblems(form.next));
    return list;
}

const body = (points, form) => ({
    arrivalState: form.arrivalState,
    results: points.map((p) => {
        const r = form.results[p.id];
        return { pointId: p.id, result: r.result, reading: r.reading === "" ? null : Number(r.reading), comment: r.comment.trim() || null, photos: photoIds(r.photos) };
    }),
    sections: sectionsBody(form.sections),
    verdict: form.verdict,
    falseAlarmCause: form.verdict === "FALSE_ALARM" ? form.falseAlarmCause : null,
    inconclusiveReason: form.verdict === "INCONCLUSIVE" ? form.inconclusiveReason : null,
    urgentStop: form.verdict === "CONFIRMED" && form.urgentStop,
    comment: form.comment.trim() || null,
    ...(form.verdict === "CONFIRMED" ? nextStepBody(form.next) : { canHandle: null }),
});

// one point to check: its result, the reading of a measure (next to the twin's), a comment, photos.
// update(fn) changes the point from its latest state: a photo's upload ends after other changes
function PointCard({ point, index, value, update, pumpId }) {
    const set = (patch) => update((v) => ({ ...v, ...patch }));
    const setPhotos = (next) => update((v) => ({ ...v, photos: typeof next === "function" ? next(v.photos) : next }));
    const measure = point.kind === "MEASURE";
    const reading = value.reading === "" ? null : Number(value.reading);
    const tone = readingTone(reading, point.warnLimit, point.critLimit);
    return (
        <li className="rounded-md border border-border bg-card p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                <span className="font-data text-xs text-subtle">{index + 1}.</span>
                <span className="min-w-0 flex-1">{point.label}</span>
                {point.photoRequired && <Tag tone="neutral">Photo demandée</Tag>}
            </p>
            {measure && point.twinValue != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                    Le système lisait <span className="font-data text-foreground">{num(point.twinValue, 1)} {point.unit}</span>
                    {point.warnLimit != null && <> · alerte à {num(point.warnLimit, 1)}{point.critLimit != null && <>, critique à {num(point.critLimit, 1)}</>} {point.unit}</>}
                </p>
            )}
            <div className="mt-3">
                <ChoiceCards name={`Résultat : ${point.label}`} columns="grid-cols-3" compact value={value.result} onChange={(result) => set({ result })}
                    options={Object.entries(CHECK_RESULT).map(([v, r]) => ({ value: v, label: r.label, tone: r.tone }))} />
            </div>
            {measure && value.result && value.result !== "NOT_CHECKABLE" && (
                <label className={cn(labelClass, "mt-3")}>
                    Valeur relevée {point.unit && <span className="font-normal text-muted-foreground">({point.unit})</span>}
                    <div className="mt-1.5 flex items-center gap-2">
                        <input type="number" inputMode="decimal" step="any" value={value.reading} onChange={(e) => set({ reading: e.target.value })}
                            className={cn(inputClass, "max-w-40")} />
                        {tone && <Tag tone={tone}>{tone === "ok" ? "Dans les limites" : tone === "warn" ? "Au-dessus de l'alerte" : "Au-dessus du critique"}</Tag>}
                    </div>
                </label>
            )}
            {value.result && (
                <label className={cn(labelClass, "mt-3")}>
                    {value.result === "OK" ? <>Commentaire <span className="font-normal text-muted-foreground">(facultatif)</span></> : "Ce que vous avez constaté"}
                    <textarea value={value.comment} onChange={(e) => set({ comment: e.target.value })} rows={2}
                        placeholder={value.result === "NOT_CHECKABLE" ? "Ex. : pas d'accès au palier, capot soudé." : "Ex. : graisse noircie, odeur de brûlé."}
                        className={cn(inputClass, "mt-1.5")} />
                </label>
            )}
            <div className="mt-3"><PhotoPicker pumpId={pumpId} photos={value.photos} setPhotos={setPhotos} /></div>
        </li>
    );
}

export default function CheckReportForm({ taskId, status, statusComment, onSubmitted }) {
    const [check, setCheck] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [form, setForm] = useState(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(null);
    const [sent, setSent] = useState(null); // the alert as it is once the report is in

    useEffect(() => {
        let cancelled = false;
        apiClient.get(`/api/v1/checks/${taskId}`)
            .then(({ data }) => {
                if (cancelled) return;
                setCheck(data);
                setLoadError(null);
                const last = data.reports[0];
                setForm(readDraft(taskId, data.points) ?? (last ? fromReport(data.points, last) : fresh(data.points)));
            })
            .catch((err) => !cancelled && setLoadError(serverMessage(err, "La levée de doute n'a pas pu être chargée.")));
        return () => { cancelled = true; };
    }, [taskId, attempt]);

    useEffect(() => {
        if (!form || sent) return;
        try { localStorage.setItem(draftKey(taskId), storable(form)); } catch { /* private mode: no draft */ }
    }, [form, taskId, sent]);

    const missing = useMemo(() => (check && form ? problems(check.points, form) : []), [check, form]);

    if (loadError) return <ErrorBanner message={loadError} onRetry={() => setAttempt((n) => n + 1)} />;
    if (!check || !form) return <ListSkeleton />;

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const anomalies = check.points.filter((p) => form.results[p.id]?.result === "ANOMALY").length;
    const uploading = [...Object.values(form.results).flatMap((r) => r.photos), ...form.sections.flatMap((s) => s.photos)].some((p) => !p.id);

    if (sent || status === "SUBMITTED") {
        return (
            <Box className="mx-auto max-w-2xl">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground"><CheckCircle2 className="size-4 text-ok" aria-hidden="true" /> Rapport envoyé</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Votre manager le lit sur l'alerte et décide de la suite. S'il vous le renvoie pour le compléter, il reviendra dans vos Tâches.
                </p>
                <div className="mt-3 flex flex-wrap items-start gap-2">
                    <Button asChild size="sm" variant="outline"><Link to={`/terrain/${check.alertNumber}`}>Voir l'alerte #{check.alertNumber}</Link></Button>
                    <CheckPdfButton taskId={taskId} label="Rapport en PDF" />
                </div>
            </Box>
        );
    }

    const editable = status === "STARTED";
    const send = async () => {
        setSending(true);
        setSendError(null);
        try {
            const alert = await submitCheck(taskId, body(check.points, form));
            try { localStorage.removeItem(draftKey(taskId)); } catch { /* nothing to clear */ }
            setSent(alert);
            onSubmitted?.(alert);
        }
        catch (err) {
            setSendError(serverMessage(err, "Le rapport n'a pas pu être envoyé. Vérifiez votre connexion : vos réponses restent enregistrées sur ce téléphone."));
        }
        finally {
            setSending(false);
        }
    };

    return (
    <div className="mx-auto max-w-2xl space-y-4">
        {status === "RETURNED" && statusComment && (
            <p className="rounded-sm border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-foreground">
                <span className="font-medium">Votre manager vous renvoie le rapport :</span> {statusComment}
            </p>
        )}
        {!editable && (
            <p className="rounded-sm border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {status === "ASSIGNED" ? "Acceptez d'abord la tâche (onglet Détails) pour remplir le rapport." : "Reprenez d'abord la tâche (onglet Détails) pour remplir le rapport."}
            </p>
        )}

        <fieldset disabled={!editable} className="space-y-4 disabled:opacity-60">
            <Box title="1 · À votre arrivée">
                <ChoiceCards name="État de la pompe à votre arrivée" columns="grid-cols-3" compact value={form.arrivalState} onChange={(arrivalState) => set({ arrivalState })}
                    options={Object.entries(ARRIVAL_STATE).map(([value, label]) => ({ value, label }))} />
            </Box>

            <section>
                <h2 className="mb-2 flex items-center gap-2 font-data text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">
                    <ClipboardCheck className="size-3.5" aria-hidden="true" /> 2 · Points à vérifier · {check.points.length}
                </h2>
                <ol className="space-y-3">
                    {check.points.map((point, index) => (
                        <PointCard key={point.id} point={point} index={index} pumpId={check.pumpId} value={form.results[point.id]}
                            update={(fn) => setForm((f) => ({ ...f, results: { ...f.results, [point.id]: fn(f.results[point.id]) } }))} />
                    ))}
                </ol>
            </section>

            <Box title="3 · Autres photos et constats">
                <SectionsEditor sections={form.sections} pumpId={check.pumpId}
                    setSections={(next) => setForm((f) => ({ ...f, sections: typeof next === "function" ? next(f.sections) : next }))} />
            </Box>

            <Box title="4 · Votre conclusion">
                {anomalies > 0 && !form.verdict && (
                    <p className="mb-3 text-xs text-muted-foreground">{anomalies} point{anomalies > 1 ? "s" : ""} en anomalie : l'alerte semble confirmée.</p>
                )}
                <ChoiceCards name="Votre conclusion" value={form.verdict} onChange={(verdict) => set({ verdict })}
                    options={Object.entries(CHECK_VERDICT).map(([value, v]) => ({ value, label: v.label, hint: v.hint, tone: v.tone }))} />
                {form.verdict === "FALSE_ALARM" && (
                    <fieldset className="mt-3">
                        <legend className={labelClass}>Pourquoi l'alerte est-elle fausse ?</legend>
                        <div className="mt-1.5">
                            <ChoiceCards name="Cause de la fausse alerte" columns="grid-cols-1" value={form.falseAlarmCause} onChange={(falseAlarmCause) => set({ falseAlarmCause })}
                                options={Object.entries(FALSE_ALARM_CAUSE).map(([value, label]) => ({ value, label }))} />
                        </div>
                        {form.falseAlarmCause === "SENSOR_FAULT" && (
                            <p className="mt-2 text-xs text-muted-foreground">Le capteur à revoir est une panne à part entière : décrivez-le ci-dessous, votre manager décidera.</p>
                        )}
                    </fieldset>
                )}
                {form.verdict === "INCONCLUSIVE" && (
                    <fieldset className="mt-3">
                        <legend className={labelClass}>Qu'est-ce qui vous a empêché de conclure ?</legend>
                        <div className="mt-1.5">
                            <ChoiceCards name="Raison" columns="grid-cols-1 sm:grid-cols-2" value={form.inconclusiveReason} onChange={(inconclusiveReason) => set({ inconclusiveReason })}
                                options={Object.entries(INCONCLUSIVE_REASON).map(([value, label]) => ({ value, label }))} />
                        </div>
                    </fieldset>
                )}
                {form.verdict === "CONFIRMED" && (
                    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-sm border border-crit/30 bg-crit/5 px-3 py-2.5">
                        <input type="checkbox" checked={form.urgentStop} onChange={(e) => set({ urgentStop: e.target.checked })} className="mt-0.5 size-4 accent-[var(--crit)]" />
                        <span>
                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><AlertTriangle className="size-4 text-crit" aria-hidden="true" /> Arrêt immédiat recommandé</span>
                            <span className="block text-xs text-muted-foreground">Risque pour la pompe ou les personnes : l'alerte passe en urgence chez votre manager.</span>
                        </span>
                    </label>
                )}
                {form.verdict && (
                    <label className={cn(labelClass, "mt-3")}>
                        Commentaire {form.verdict === "INCONCLUSIVE" ? "(obligatoire)" : <span className="font-normal text-muted-foreground">(facultatif)</span>}
                        <textarea value={form.comment} onChange={(e) => set({ comment: e.target.value })} rows={3}
                            placeholder="Ce que votre manager doit savoir en premier." className={cn(inputClass, "mt-1.5")} />
                    </label>
                )}
            </Box>

            {form.verdict === "CONFIRMED" && (
                <Box title="5 · La suite">
                    <NextStepEditor next={form.next} setNext={(next) => setForm((f) => ({ ...f, next: typeof next === "function" ? next(f.next) : next }))} />
                </Box>
            )}
        </fieldset>

        {editable && (
            <div className="space-y-2">
                {missing.length > 0 && (
                    <div className="rounded-sm border border-border bg-muted px-3 py-2 text-sm">
                        <p className="font-medium text-foreground">Il manque encore :</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}</ul>
                        {missing.length > 6 && <p className="mt-1 text-xs text-muted-foreground">… et {missing.length - 6} autre{missing.length - 6 > 1 ? "s" : ""}.</p>}
                    </div>
                )}
                {sendError && <p role="alert" className="rounded-sm border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">{sendError}</p>}
                <Button type="button" className="w-full" onClick={send} disabled={missing.length > 0 || sending || uploading}>
                    <Send aria-hidden="true" /> {sending ? "Envoi…" : uploading ? "Envoi des photos…" : "Envoyer le rapport"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Vos réponses sont gardées sur ce téléphone jusqu'à l'envoi.</p>
            </div>
        )}
    </div>);
}
