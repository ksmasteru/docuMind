// A v2 expertise report (report_ui.md), filled in as a wizard: one section per page, one page per
// part, Précédent / Suivant without losing anything, a progress bar by section, and a last page to
// add remarks and send. Opened by ReportForm.jsx for the "Rapport d'expertise V2 …" forms.
//
//   template ← given by ReportForm (GET /api/v1/forms/inspectionForm/:id, with each question's options)
//   photos   → POST /api/v1/images                 (one call per photo, sent as soon as it's taken)
//   send     → POST /api/v1/submissions            (SubmissionRequest: every answer, extraParts, taskId)
//   pdf      ← SentReport (InspectionForm.jsx), once sent
//   draft    ← GET    /api/v1/drafts?templateId&taskId   when the form opens: the report resumes where it stopped
//            → PUT    /api/v1/drafts                     on every page change, « Enregistrer », the app going to the background
//            → DELETE /api/v1/drafts                     « Recommencer »; the server deletes it itself once the report is sent
//   preview  → POST   /api/v1/submissions/preview        « Aperçu du PDF »: the PDF as it stands, nothing saved
//   lists    ← GET    /api/v1/submissions/known-values   the values already written in the Client / dossier fields
//
// The draft keeps the answers, the added parts, the remarks and the page shown; photos by their id (their
// previews are fetched again on resume). A photo still uploading when the draft is saved isn't kept.
//
// Every typed field can be dictated (useVoiceInput → POST /api/v1/ask/transcribeReport). Each clip goes
// with a context saying what the field is about (dictationContext): the server uses it as Whisper's
// prompt, so part names and the listed findings come out spelled right. One recorder for the report;
// while it records or transcribes, the pages stay put so the text lands where it was dictated.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { useVoiceInput } from "./useVoiceInput";
import { SentReport } from "./InspectionForm";
import { shrinkPhoto } from "./photoUtils";
import { isTypingField } from "./keepFocusVisible";
import {
    EXTRA_PART_FINDINGS, EXTRA_PART_RECOMMENDATIONS, INSPECTION_RUBRIQUE, buildPages, dictatedShort, dictationContext, emptyValue, formatOf, groupsOf,
    isAnswered, isPartFilled, metaQuestion, newExtraPart, newSummaryRow, optionsOf, photoProblems, requestBody, splitLabel, suggestionsOf,
    summaryRowsFrom, todayLocal, draftPayload, restoreDraft, listOptions, SEARCHABLE_GROUP,
} from "./reportV2";
import { ChoiceField, FindingsField, MeasureField, PartsSummaryField, PhotoGallery, SearchField, TextField, WithMic, fieldInput } from "./ReportV2Fields";

// "2026-11-08T13:32:05Z" → "08/11 14:32", the device's time
const savedAtText = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// the photo whose key this is gets its preview url, in a list of photos
const withUrl = (list, photoKey, url) => list.map((p) => (p.key === photoKey ? { ...p, url } : p));

// Entrée in the page's last field closes the phone's keyboard (the field is left) and brings the
// page's buttons (Suivant, Envoyer) into view: the keyboard was hiding them. A field whose Entrée does
// something already (a reading added, an « Autre » added) keeps it: its handler prevented the default.
const closeKeyboardOnLastField = (e) => {
    if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.nativeEvent.isComposing) return;
    const field = e.target;
    const page = field.closest("section");
    if (!page || !isTypingField(field)) return;
    const fields = [...page.querySelectorAll("input, textarea")].filter((f) => isTypingField(f) && !f.disabled && f.offsetParent !== null);
    if (fields[fields.length - 1] !== field) return;
    e.preventDefault();
    field.blur();
    // once the keyboard has gone down
    setTimeout(() => page.querySelector("[data-page-actions]")?.scrollIntoView({ behavior: "smooth", block: "end" }), 350);
};

// a dictated sentence goes after what's already typed, never over it
const appendText = (current, text) => (current?.trim() ? `${current.trim()} ${text}` : text);

const EXTRA_FINDINGS_OPTIONS = { choices: EXTRA_PART_FINDINGS, exclusive: "Bon état", allowOther: true };
const EXTRA_RECOMMENDATION_OPTIONS = { choices: EXTRA_PART_RECOMMENDATIONS, allowOther: true };

// the answers a template starts with: the pump filled in from the task, the report's date today
const initialAnswers = (template, initialEquipment) => {
    const answers = {};
    template.questions.forEach((q) => { answers[q.id] = { value: emptyValue(q.answerType), comment: "" }; });
    const equipment = metaQuestion(template.questions, "equipment");
    if (equipment && initialEquipment) answers[equipment.id].value = initialEquipment;
    const date = metaQuestion(template.questions, "inspectionDate");
    if (date && date.answerType === "DATE") answers[date.id].value = todayLocal();
    return answers;
};

export default function ReportWizard({ template, taskId = null, initialEquipment = "", onSubmitted }) {
    const { user } = useAuth();
    const [answers, setAnswers] = useState(() => initialAnswers(template, initialEquipment));
    const [extraParts, setExtraParts] = useState([]);
    const [remarks, setRemarks] = useState("");
    const [index, setIndex] = useState(0);              // the page shown; pages.length = the send page
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);         // SubmissionResponse once sent
    const [errors, setErrors] = useState([]);
    const top = useRef(null);
    const progress = useRef(null);
    const nextKey = useRef(0);
    // a resumed draft brings its own keys: numbering goes on after the highest (see the draft's loading)
    const key = () => `k${nextKey.current++}`;

    // the draft: loading until the server has answered (the form waits, so nothing typed is overwritten)
    const [draft, setDraft] = useState({ loading: true, saving: false, savedAt: null, restoredAt: null, error: null });
    const [previewing, setPreviewing] = useState(false);
    // the preview's PDF when the browser refused the new tab: offered as a link, the form stays open
    const [previewUrl, setPreviewUrl] = useState(null);
    // the values already written in the Client / dossier fields, by label
    const [known, setKnown] = useState({});
    // the state the background save sends (kept current by an effect: refs aren't read while drawing)
    const latest = useRef(null);

    // the photos' local previews, released when the report goes away
    const previews = useRef([]);
    useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

    // ------------------------------------------------------------ the draft, and the searchable lists

    // a restored photo's preview, fetched with the token (an <img> can't send it)
    const loadPreviews = (restored) => {
        const all = [
            ...Object.values(restored.answers).flatMap((a) => (Array.isArray(a.value) ? a.value : [])),
            ...restored.extraParts.flatMap((p) => p.photos),
        ];
        all.forEach(async (photo) => {
            try {
                const response = await apiClient.get(`/api/v1/images/${photo.imageId}`, { responseType: "blob" });
                const url = URL.createObjectURL(response.data);
                previews.current.push(url);
                setAnswers((prev) => Object.fromEntries(Object.entries(prev).map(([id, a]) =>
                    [id, Array.isArray(a.value) ? { ...a, value: withUrl(a.value, photo.key, url) } : a])));
                setExtraParts((prev) => prev.map((p) => ({ ...p, photos: withUrl(p.photos, photo.key, url) })));
            }
            catch (err) {
                console.log("photo preview not loaded", err);
            }
        });
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            let restored = null, at = null;
            try {
                const response = await apiClient.get("/api/v1/drafts", { params: { templateId: template.id, ...(taskId ? { taskId } : {}) } });
                if (response.status === 200 && response.data?.payload) {
                    restored = restoreDraft(response.data.payload, template, initialAnswers(template, initialEquipment));
                    at = response.data.updatedAt;
                }
            }
            catch (err) {
                console.log("draft not loaded", err);
            }
            if (cancelled) return;
            if (restored) {
                const keys = [
                    ...Object.values(restored.answers).flatMap((a) => (Array.isArray(a.value) ? a.value : [])),
                    ...restored.extraParts.flatMap((p) => [p, ...p.photos]),
                ].map((x) => Number(String(x.key ?? "").replace(/^k/, ""))).filter(Number.isFinite);
                nextKey.current = Math.max(nextKey.current, ...keys.map((n) => n + 1));
                setAnswers(restored.answers);
                setExtraParts(restored.extraParts);
                setRemarks(restored.remarks);
                setIndex(restored.index);
                loadPreviews(restored);
            }
            setDraft((d) => ({ ...d, loading: false, restoredAt: restored ? at : null, savedAt: restored ? at : null }));
        };
        load();
        return () => { cancelled = true; };
        // once per form and task: a later change of the initial equipment mustn't reload the draft
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template.id, taskId]);

    // the searchable lists' values, once
    useEffect(() => {
        const labels = template.questions.filter((q) => optionsOf(q).group === SEARCHABLE_GROUP).map((q) => q.labelFr);
        if (!labels.length) return;
        let cancelled = false;
        const load = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/submissions/known-values", { params: { labels }, paramsSerializer: { indexes: null } });
                if (!cancelled) setKnown(data ?? {});
            }
            catch (err) {
                console.log("known values not loaded", err);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [template]);

    // one recorder for the whole report; take: the field that started it, where its text goes and
    // what it's about
    const voice = useVoiceInput({ language: "fr" });
    const [take, setTake] = useState({ field: null, deliver: null, context: null });
    const dictating = take.field;
    const voiceBusy = voice.status !== "idle";

    const basePages = useMemo(() => buildPages(template.questions), [template]);
    // the added parts get their pages after the inspection's last one
    const pages = useMemo(() => {
        const last = basePages.map((p) => p.rubrique).lastIndexOf(INSPECTION_RUBRIQUE);
        if (last === -1) return basePages;
        const extra = extraParts.map((part) => ({
            key: `extra-${part.key}`, rubrique: INSPECTION_RUBRIQUE, rubriqueIndex: basePages[last].rubriqueIndex,
            page: part.name.trim() || "Nouvelle pièce", questions: [], extra: part.key,
        }));
        return [...basePages.slice(0, last + 1), ...extra, ...basePages.slice(last + 1)];
    }, [basePages, extraParts]);
    const rubriques = useMemo(() => [...new Set(pages.map((p) => p.rubrique))], [pages]);
    const hasInspection = basePages.some((p) => p.rubrique === INSPECTION_RUBRIQUE);

    // on a phone the sections' bar scrolls: keep the active one in view
    useEffect(() => {
        progress.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    }, [index]);

    const locked = !!result;
    const onSendPage = index >= pages.length;
    const page = onSendPage ? null : pages[index];

    // ------------------------------------------------------------ changing answers

    const setAnswer = (id, field = "value") => (update) =>
        setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], [field]: update(prev[id][field]) } }));
    const setPart = (partKey, field) => (update) =>
        setExtraParts((prev) => prev.map((p) => (p.key === partKey ? { ...p, [field]: update(p[field]) } : p)));

    // photos are sent as soon as they're picked; apply(update) changes the list they belong to
    const equipmentQ = metaQuestion(template.questions, "equipment");
    const uploadInto = (apply) => async (files, replaceKey = null) => {
        for (const file of files) {
            const url = URL.createObjectURL(file);
            previews.current.push(url);
            const photoKey = key();
            const photo = { key: photoKey, url, status: "uploading", imageId: null, error: null, title: "", comment: "" };
            apply((list) => replaceKey
                ? list.map((p) => (p.key === replaceKey ? { ...photo, title: p.title, comment: p.comment } : p))
                : [...list, photo]);
            let done = null;
            let error = null;
            try {
                const formData = new FormData();
                formData.append("image", await shrinkPhoto(file));
                const equipment = (answers[equipmentQ?.id]?.value ?? "").trim();
                if (equipment) formData.append("equipementId", equipment);
                ({ data: done } = await apiClient.post("/api/v1/images", formData));
            }
            catch (err) {
                console.log("photo refused", err);
                error = err.response ? err.response.data?.message || `Photo refusée (${err.response.status}).` : "Envoi impossible : vérifiez la connexion.";
            }
            apply((list) => list.map((p) => (p.key !== photoKey ? p
                : done ? { ...p, status: "done", imageId: done.imageId } : { ...p, status: "error", error })));
        }
    };

    // The microphone of one field. context: what it's about (dictationContext); deliver(text): where
    // the transcript goes. Any microphone stops the take in progress, and its text still goes to the
    // field that started it.
    const toggleDictation = async (fieldId, context, deliver) => {
        if (voice.status === "transcribing") return;
        if (voice.status === "recording") {
            const { deliver: to, context: about } = take;
            const text = await voice.stopReport(about);
            if (text) to?.(text);
            return;
        }
        setTake({ field: fieldId, deliver, context });
        await voice.start();
    };
    const voiceFor = (fieldId, context, deliver) => ({
        recording: voice.status === "recording" && dictating === fieldId,
        transcribing: voice.status === "transcribing" && dictating === fieldId,
        busy: voice.status === "transcribing" && dictating !== fieldId,
        error: dictating === fieldId ? voice.error : null,
        onToggle: () => toggleDictation(fieldId, context, deliver),
    });

    const addPart = () => {
        const part = newExtraPart(key());
        setExtraParts((prev) => [...prev, part]);
        // its page: after the inspection's pages and the parts already added
        const last = pages.map((p) => p.rubrique).lastIndexOf(INSPECTION_RUBRIQUE);
        go(last + 1);
    };
    const removePart = (partKey) => {
        if (!window.confirm("Retirer cette pièce du rapport ?")) return;
        setExtraParts((prev) => prev.filter((p) => p.key !== partKey));
        setIndex((i) => Math.max(0, i - 1));
    };

    // the draft as the form stands: page = the page to come back to
    const saveDraft = async (state) => {
        if (draft.loading || result) return;
        setDraft((d) => ({ ...d, saving: true, error: null }));
        try {
            const { data } = await apiClient.put("/api/v1/drafts", { templateId: template.id, taskId, payload: draftPayload(state) });
            setDraft((d) => ({ ...d, saving: false, savedAt: data.updatedAt }));
        }
        catch (err) {
            console.log("draft not saved", err);
            setDraft((d) => ({ ...d, saving: false, error: "Brouillon non enregistré : vérifiez la connexion." }));
        }
    };

    // the state the background save will send, once the report has started
    useEffect(() => {
        latest.current = draft.loading || result ? null : { answers, extraParts, remarks, index };
    }, [answers, extraParts, remarks, index, draft.loading, result]);

    // the app sent to the background (a call, the camera, the phone locked): saved, whatever the page
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState !== "hidden" || !latest.current) return;
            apiClient.put("/api/v1/drafts", { templateId: template.id, taskId, payload: draftPayload(latest.current) })
                .then(({ data }) => setDraft((d) => ({ ...d, savedAt: data.updatedAt, error: null })))
                .catch((err) => console.log("draft not saved in the background", err));
        };
        document.addEventListener("visibilitychange", onHide);
        return () => document.removeEventListener("visibilitychange", onHide);
    }, [template.id, taskId]);

    // every page change saves the draft (form-draft-persistence.md: « on Suivant »), with the page to come back to
    const go = (to) => {
        if (voiceBusy) return;
        saveDraft({ answers, extraParts, remarks, index: to });
        setIndex(to);
        top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // « Recommencer »: the draft is deleted and the form starts again, empty
    const discardDraft = async () => {
        if (!window.confirm("Effacer ce brouillon et recommencer le rapport à zéro ?")) return;
        try {
            await apiClient.delete("/api/v1/drafts", { params: { templateId: template.id, ...(taskId ? { taskId } : {}) } });
        }
        catch (err) {
            console.log("draft not deleted", err);
        }
        setAnswers(initialAnswers(template, initialEquipment));
        setExtraParts([]);
        setRemarks("");
        setIndex(0);
        setErrors([]);
        setDraft((d) => ({ ...d, restoredAt: null, savedAt: null, error: null }));
    };

    // « Aperçu du PDF »: the report as it stands, in a new tab (opened at the click, or the browser blocks it)
    const previewPdf = async () => {
        const tab = window.open("", "_blank");
        setPreviewing(true);
        try {
            const response = await apiClient.post("/api/v1/submissions/preview", requestBody({ template, answers, extraParts, remarks, taskId }), { responseType: "blob" });
            const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
            previews.current.push(url);
            if (tab) tab.location.href = url;
            else setPreviewUrl(url);
        }
        catch (err) {
            console.log("preview failed", err);
            tab?.close();
            setErrors(["L'aperçu n'a pas pu être généré. Réessayez."]);
        }
        finally {
            setPreviewing(false);
        }
    };

    // ------------------------------------------------------------ what's filled in

    const answeredOn = (p) => p.extra
        ? { done: isPartFilled(extraParts.find((x) => x.key === p.extra) ?? newExtraPart("")) ? 1 : 0, total: 1 }
        : { done: p.questions.filter((q) => isAnswered(q, answers[q.id])).length, total: p.questions.length };
    const rubriqueStats = (name) => pages.filter((p) => p.rubrique === name).map(answeredOn)
        .reduce((s, x) => ({ done: s.done + x.done, total: s.total + x.total }), { done: 0, total: 0 });

    // ------------------------------------------------------------ sending

    const send = async () => {
        const found = [];
        const dateQ = metaQuestion(template.questions, "inspectionDate");
        if (!(answers[equipmentQ?.id]?.value ?? "").trim())
            found.push(`Renseignez « ${equipmentQ ? splitLabel(equipmentQ.labelFr).field : "l'équipement"} » (Informations générales).`);
        if (!answers[dateQ?.id]?.value)
            found.push(`Renseignez « ${dateQ ? splitLabel(dateQ.labelFr).field : "la date"} » (Informations générales).`);
        const { uploading, failed } = photoProblems(answers, extraParts);
        if (uploading) found.push(`${uploading} photo(s) en cours d'envoi : attendez la fin.`);
        if (failed) found.push(`${failed} photo(s) n'ont pas pu être envoyées : supprimez-les ou remplacez-les.`);
        extraParts.forEach((p, i) => { if (!p.name.trim()) found.push(`La pièce ajoutée n° ${i + 1} n'a pas de nom.`); });
        // a status that says the work isn't right needs its remark (the server refuses it otherwise)
        template.questions.filter((q) => q.critical && q.answerType === "SINGLE_CHOICE").forEach((q) => {
            const a = answers[q.id];
            if ((optionsOf(q).nonConforming ?? []).includes(a.value.selected) && !a.comment.trim())
                found.push(`« ${splitLabel(q.labelFr).field} » : une remarque est obligatoire.`);
        });
        setErrors(found);
        if (found.length) return;

        setSending(true);
        try {
            const { data } = await apiClient.post("/api/v1/submissions", requestBody({ template, answers, extraParts, remarks, taskId }));
            setResult(data);
            // the server deleted the draft with the report's save
            setDraft((d) => ({ ...d, savedAt: null, restoredAt: null, error: null }));
            onSubmitted?.(data);
        }
        catch (err) {
            const data = err.response?.data;
            const fieldErrors = data?.errors ? Object.values(data.errors) : [];
            setErrors(fieldErrors.length ? fieldErrors : [data?.message || "Envoi impossible, réessayez."]);
        }
        finally {
            setSending(false);
        }
    };

    // a server message naming a question ("question 37") gets a link to its page
    const pageOfPosition = (position) => pages.findIndex((p) => p.questions.some((q) => q.position === position));

    // ------------------------------------------------------------ drawing

    const subPages = page ? pages.filter((p) => p.rubrique === page.rubrique) : [];
    const subIndex = page ? subPages.findIndex((p) => p.key === page.key) : -1;
    const stats = page ? answeredOn(page) : null;

    // the draft first: typing before it's back would be overwritten by it
    if (draft.loading)
        return (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Recherche d'un brouillon…
            </div>
        );

    // what the footer says about the draft
    const draftLine = draft.saving ? "Enregistrement…"
        : draft.error ? "Non enregistré"
        : draft.savedAt ? `Enregistré ${savedAtText(draft.savedAt)}` : "Pas encore enregistré";

    return (
    <div ref={top} onKeyDown={closeKeyboardOnLastField} className="mx-auto w-full max-w-4xl scroll-mt-4 space-y-4">
        <header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{template.title}</h2>
            {template.instructions && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{template.instructions}</p>}
        </header>

        {/* a report resumed from its draft */}
        {draft.restoredAt && !locked && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1A75BC]/30 bg-[#1A75BC]/5 px-3 py-2 text-sm text-slate-800 dark:text-slate-100">
                <span>Brouillon repris, enregistré le {savedAtText(draft.restoredAt)}. Vous reprenez où vous vous étiez arrêté.</span>
                <button type="button" onClick={discardDraft}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Recommencer à zéro
                </button>
            </div>
        )}
        {draft.error && !locked && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {draft.error} Vos réponses restent sur cette page ; réessayez avec « Enregistrer ».
            </p>
        )}

        {/* progress: one chip per section, ✓ when everything is filled in */}
        <nav ref={progress} aria-label="Rubriques du rapport" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {[...rubriques, "Envoi"].map((name, i) => {
                const active = onSendPage ? name === "Envoi" : page.rubrique === name;
                const s = name === "Envoi" ? null : rubriqueStats(name);
                const complete = s && s.total > 0 && s.done === s.total;
                const started = s && s.done > 0;
                return (
                    <button key={name} type="button" onClick={() => go(name === "Envoi" ? pages.length : pages.findIndex((p) => p.rubrique === name))}
                        disabled={voiceBusy} aria-current={active ? "step" : undefined} title={name}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${active
                            ? "border-[#0F2A49] bg-[#0F2A49] text-white dark:border-[#5BC6E8] dark:bg-[#5BC6E8] dark:text-slate-900"
                            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                        <span className="tabular-nums font-semibold">{String(i + 1).padStart(2, "0")}</span>
                        <span className="max-w-[9rem] truncate">{name}</span>
                        {complete ? <span aria-label="complet">✓</span> : started ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="en partie" /> : null}
                    </button>
                );
            })}
        </nav>

        {page && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {/* A. the header: where this page sits */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0F2A49] px-4 py-3 text-white">
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                    {page.rubrique}{page.page ? ` / ${page.page}` : ""}
                </h3>
                <span className="text-xs text-white/80">
                    Étape {page.rubriqueIndex + 1}{subPages.length > 1 ? ` > ${page.rubrique === INSPECTION_RUBRIQUE ? "pièce" : "page"} ${subIndex + 1}/${subPages.length}` : ""}
                </span>
            </div>

            {/* the section's pages, to jump between parts */}
            {(subPages.length > 1 || (page.rubrique === INSPECTION_RUBRIQUE && hasInspection)) && (
                <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 px-4 py-2 dark:border-slate-700">
                    {subPages.map((p) => {
                        const s = answeredOn(p);
                        const on = p.key === page.key;
                        return (
                            <button key={p.key} type="button" onClick={() => go(pages.findIndex((x) => x.key === p.key))} disabled={voiceBusy}
                                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs transition ${on
                                    ? "bg-[#1A75BC]/10 font-semibold text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]"
                                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}>
                                {p.page ?? p.rubrique}{s.done > 0 && s.done === s.total ? " ✓" : ""}
                            </button>
                        );
                    })}
                    {page.rubrique === INSPECTION_RUBRIQUE && !locked && (
                        <button type="button" onClick={addPart} disabled={voiceBusy}
                            className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 dark:text-[#5BC6E8]">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Ajouter une pièce
                        </button>
                    )}
                </div>
            )}

            <fieldset disabled={locked} className="space-y-5 p-4">
                {page.extra ? (
                    <ExtraPartPage part={extraParts.find((p) => p.key === page.extra)} setPart={setPart} uploadInto={uploadInto}
                        voiceFor={voiceFor} onRemove={removePart} locked={locked} voiceBusy={voiceBusy} />
                ) : groupsOf(page.questions).map(({ group, questions }, g) => (
                    <div key={g} className={group ? "rounded-xl border border-slate-200 p-3 dark:border-slate-700" : ""}>
                        {group && <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group}</h4>}
                        <div className={questions.every((q) => q.answerType === "TEXT" || q.answerType === "DATE") && group ? "grid gap-3 sm:grid-cols-2" : "space-y-5"}>
                            {questions.map((q) => (
                                <Question key={q.id} q={q} answer={answers[q.id]} setAnswer={setAnswer} uploadInto={uploadInto}
                                    voiceFor={voiceFor} pageQuestions={page.questions} locked={locked} known={known[q.labelFr]}
                                    onGenerate={() => setAnswer(q.id)((v) => {
                                        const listed = new Set(v.rows.map((r) => r.description.trim().toLowerCase()));
                                        const rows = summaryRowsFrom(pages, answers, extraParts)
                                            .filter((r) => !listed.has(r.description.toLowerCase())).map((r) => newSummaryRow(r));
                                        return { rows: [...v.rows, ...rows] };
                                    })} />
                            ))}
                        </div>
                    </div>
                ))}
            </fieldset>

            {/* F. the footer: back, what's filled in, next */}
            <div data-page-actions className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <button type="button" onClick={() => go(index - 1)} disabled={index === 0 || voiceBusy}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-40 dark:text-[#5BC6E8]">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédent
                </button>
                <span className="text-center text-xs tabular-nums text-slate-600 dark:text-slate-300">
                    {voiceBusy ? "Dictée en cours…" : `${stats.done} / ${stats.total} renseigné${stats.done > 1 ? "s" : ""}`}
                    <span className={`block text-[11px] ${draft.error ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>{draftLine}</span>
                </span>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => saveDraft({ answers, extraParts, remarks, index })} disabled={voiceBusy || draft.saving}
                        aria-label="Enregistrer le brouillon" title="Enregistrer le brouillon"
                        className="flex items-center gap-1 rounded-lg border border-[#1A75BC] px-2.5 py-1.5 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-50 dark:border-[#5BC6E8] dark:text-[#5BC6E8]">
                        {draft.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        <span className="hidden sm:inline">Enregistrer</span>
                    </button>
                    <button type="button" onClick={() => go(index + 1)} disabled={voiceBusy}
                        className="flex items-center gap-1 rounded-lg bg-[#1A75BC] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                        {index === pages.length - 1 ? "Envoi" : "Suivant"} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </section>
        )}

        {onSendPage && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Remarques et envoi</h3>

            {/* the overview: every section, filled in or not; empty ones can stay empty */}
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
                {rubriques.map((name) => {
                    const s = rubriqueStats(name);
                    return (
                        <li key={name} className="flex items-center justify-between gap-3 py-1.5">
                            <button type="button" onClick={() => go(pages.findIndex((p) => p.rubrique === name))} disabled={voiceBusy}
                                className="text-left text-slate-700 hover:text-[#1A75BC] hover:underline dark:text-slate-200">{name}</button>
                            <span className={`tabular-nums text-xs ${s.done === s.total ? "text-emerald-700 dark:text-emerald-400" : s.done ? "text-amber-700 dark:text-amber-400" : "text-slate-400"}`}>
                                {s.done} / {s.total}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">Une pièce non inspectée peut rester vide : le rapport garde sa structure.</p>

            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Remarques générales</p>
            <TextField value={remarks} onChange={setRemarks} disabled={locked} placeholder="Écrivez ou dictez…"
                voice={voiceFor("remarks", dictationContext({ labelFr: "Remarques générales : Remarques" }), (text) => setRemarks((r) => appendText(r, text)))} />
            {/* after a reload the login only keeps the role (AuthContext), not the email */}
            <p className="text-sm text-slate-600 dark:text-slate-300">Rédigé par {user?.email ?? "vous (compte connecté)"}</p>

            {errors.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {errors.map((message) => {
                        const position = Number(message.match(/question (\d+)/)?.[1]);
                        const at = position ? pageOfPosition(position) : -1;
                        return (
                            <li key={message}>
                                {message}{" "}
                                {at >= 0 && <button type="button" onClick={() => go(at)} className="font-medium underline">Voir la page</button>}
                            </li>
                        );
                    })}
                </ul>
            )}

            {!locked && (
                <div data-page-actions className="space-y-3">
                    {/* look at the PDF before sending it, and keep the draft */}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={previewPdf} disabled={previewing || voiceBusy}
                            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
                            {previewing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                            {previewing ? "Préparation de l'aperçu…" : "Aperçu du PDF"}
                        </button>
                        <button type="button" onClick={() => saveDraft({ answers, extraParts, remarks, index })} disabled={draft.saving || voiceBusy}
                            className="flex items-center gap-2 rounded-lg border border-[#1A75BC] px-3 py-2 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-50 dark:border-[#5BC6E8] dark:text-[#5BC6E8]">
                            {draft.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                            Enregistrer le brouillon
                        </button>
                        <span className="self-center text-xs text-slate-600 dark:text-slate-300">{draftLine}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">L'aperçu montre le PDF tel qu'il sera, sans rien envoyer.</p>
                    {previewUrl && (
                        <a href={previewUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1A75BC] underline dark:text-[#5BC6E8]">
                            <Eye className="h-4 w-4" aria-hidden="true" /> Ouvrir l'aperçu (le navigateur a bloqué le nouvel onglet)
                        </a>
                    )}
                    <div className="flex justify-between gap-3">
                        <button type="button" onClick={() => go(pages.length - 1)} disabled={voiceBusy}
                            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 dark:text-[#5BC6E8]">
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédent
                        </button>
                        <button type="button" onClick={send} disabled={sending || voice.status !== "idle"}
                            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">
                            <Send className="h-4 w-4" aria-hidden="true" /> {sending ? "Envoi…" : "Envoyer le rapport"}
                        </button>
                    </div>
                </div>
            )}

            {result && <SentReport submissionId={result.id} status={result.status} />}
        </section>
        )}
    </div>)
}

// one question, drawn for its answer type
function Question({ q, answer, setAnswer, uploadInto, voiceFor, pageQuestions, locked, onGenerate, known }) {
    const options = optionsOf(q);
    const { field } = splitLabel(q.labelFr);
    const value = answer.value;
    const onChange = setAnswer(q.id);
    const comment = setAnswer(q.id, "comment");
    // « + Autre »: the text goes into its box (deliver), the context names what's already listed
    const otherMic = (deliver) => voiceFor(`${q.id}:other`, dictationContext(q, { kind: "other", choices: options.choices }), deliver);

    // a montage check: the description, its status, the remark beside (a row of the checklist)
    if (q.answerType === "SINGLE_CHOICE" && options.remark) {
        const bad = (options.nonConforming ?? []).includes(value.selected);
        return (
            <div className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-start dark:border-slate-700">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{field}</p>
                <ChoiceField value={value} onChange={onChange} options={options} mic={otherMic} disabled={locked} compact name={field} />
                <div className="sm:col-span-2">
                    <WithMic voice={voiceFor(`${q.id}:remark`, dictationContext(q, { pageQuestions: [q] }), (text) => comment((c) => appendText(c, text)))} disabled={locked}>
                        <input value={answer.comment} onChange={(e) => comment(() => e.target.value)} disabled={locked}
                            placeholder={bad ? "Remarque (obligatoire)" : "Remarque"} aria-label={`Remarque : ${field}`}
                            className={`${fieldInput} py-1.5 ${bad && !answer.comment.trim() ? "border-red-400" : ""}`} />
                    </WithMic>
                </div>
            </div>
        );
    }

    let control;
    switch (q.answerType) {
        case "IMAGE":
            control = <PhotoGallery photos={value} onChange={onChange} onUpload={uploadInto(onChange)} withComments={!!options.photoComments}
                max={options.maxPhotos ?? 30} disabled={locked} />;
            break;
        case "MULTI_CHOICE":
            control = <FindingsField value={value} onChange={onChange} options={options} mic={otherMic} disabled={locked} />;
            break;
        case "SINGLE_CHOICE":
            control = <ChoiceField value={value} onChange={onChange} options={options} mic={otherMic} disabled={locked} name={field} />;
            break;
        case "MEASURE":
            control = <MeasureField value={value} onChange={onChange} options={options} label={field} disabled={locked}
                mic={(deliver) => voiceFor(`${q.id}:measure`, dictationContext(q, { kind: "measure" }), deliver)} />;
            break;
        case "PARTS_SUMMARY":
            control = <PartsSummaryField value={value} onChange={onChange} options={options} onGenerate={onGenerate} disabled={locked} id={q.id}
                mic={(rowKey, column, deliver) => voiceFor(`${q.id}:${rowKey}:${column}`,
                    dictationContext({ labelFr: `${splitLabel(q.labelFr).rubrique} : ${column === "remark" ? "Remarque" : "Pièce"}` }), deliver)} />;
            break;
        case "DATE":
            control = <input type="date" value={value} max={todayLocal()} onChange={(e) => onChange(() => e.target.value)} disabled={locked} className={`${fieldInput} max-w-xs`} />;
            break;
        default: {
            // a comment, a reason, an observation: a paragraph, dictation added at its end; a short
            // identification field: dictation in place of what it held, as the suggestion it names if any
            const long = /comment|observation|raison|remarque/i.test(field);
            const suggestions = suggestionsOf(q);
            const format = formatOf(q);
            const deliver = long
                ? (text) => onChange((current) => appendText(current, text))
                : (text) => onChange(() => dictatedShort(text, suggestions, format));
            // the client / file fields: a searchable list of the suggestions and the values of earlier reports
            if (!long && options.group === SEARCHABLE_GROUP) {
                control = <SearchField value={value} onChange={onChange} options={listOptions(suggestions, known)} disabled={locked} label={field}
                    voice={voiceFor(q.id, dictationContext(q, { pageQuestions }), deliver)}
                    placeholder={format ? `ex. ${format.example} — ou cherchez` : "Écrivez ou cherchez…"} />;
                break;
            }
            control = <TextField value={value} onChange={onChange} multiline={long} disabled={locked} suggestions={suggestions}
                voice={voiceFor(q.id, dictationContext(q, { pageQuestions }), deliver)}
                onBlur={format?.imposed ? () => onChange((current) => dictatedShort(current, suggestions, format)) : undefined}
                placeholder={long ? "Écrivez ou dictez…" : format ? `ex. ${format.example}` : ""} />;
        }
    }
    return (
        <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                {field}
                {q.answerType === "MULTI_CHOICE" && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(plusieurs choix)</span>}
                {options.meta && <span className="text-red-600 dark:text-red-400"> *</span>}
            </p>
            {control}
        </div>
    );
}

// a part the technician added: its name, then the same template as the others
function ExtraPartPage({ part, setPart, uploadInto, voiceFor, onRemove, locked, voiceBusy }) {
    if (!part) return null;
    const photos = setPart(part.key, "photos");
    // what the part's dictations are about: its name, as a page of the inspection
    const about = (field) => ({ labelFr: `${INSPECTION_RUBRIQUE} > ${part.name.trim() || "Pièce ajoutée"} : ${field}`, options: {} });
    const otherMic = (field, choices) => (deliver) =>
        voiceFor(`extra-${part.key}:${field}`, dictationContext(about(field), { kind: "other", choices }), deliver);
    const name = setPart(part.key, "name");
    return (
    <div className="space-y-5">
        <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Nom de la pièce <span className="text-red-600 dark:text-red-400">*</span></p>
            <TextField value={part.name} onChange={name} multiline={false} disabled={locked} placeholder="Ex. : bague d'usure"
                voice={voiceFor(`extra-${part.key}:name`, dictationContext(about("Nom de la pièce")), (text) => name(() => dictatedShort(text)))} />
        </div>
        <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Photos</p>
            <PhotoGallery photos={part.photos} onChange={photos} onUpload={uploadInto(photos)} withComments disabled={locked} />
        </div>
        <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Constats <span className="font-normal text-slate-500 dark:text-slate-400">(plusieurs choix)</span></p>
            <FindingsField value={part.findings} onChange={setPart(part.key, "findings")} options={EXTRA_FINDINGS_OPTIONS} disabled={locked}
                mic={otherMic("Constats", EXTRA_PART_FINDINGS)} />
        </div>
        <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Commentaire</p>
            <TextField value={part.comment} onChange={setPart(part.key, "comment")} disabled={locked} placeholder="Écrivez ou dictez…"
                voice={voiceFor(`extra-${part.key}:comment`, dictationContext(about("Commentaire"), { pageQuestions: [{ options: EXTRA_FINDINGS_OPTIONS }] }),
                    (text) => setPart(part.key, "comment")((c) => appendText(c, text)))} />
        </div>
        <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Recommandation</p>
            <ChoiceField value={part.recommendation} onChange={setPart(part.key, "recommendation")} options={EXTRA_RECOMMENDATION_OPTIONS} disabled={locked} name="Recommandation"
                mic={otherMic("Recommandation", EXTRA_PART_RECOMMENDATIONS)} />
        </div>
        {!locked && (
            <button type="button" onClick={() => onRemove(part.key)} disabled={voiceBusy}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline dark:text-red-400">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Retirer cette pièce
            </button>
        )}
    </div>)
}
