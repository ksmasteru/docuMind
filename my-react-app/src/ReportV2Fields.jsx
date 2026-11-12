// The v2 expertise reports' inputs (report_ui.md), one per answer type, used by ReportWizard.jsx:
// a gallery of titled photos, findings ticked from the part's list, a single choice (recommendation,
// montage status), readings of a measure with their average, the parts summary table, and the
// control sheets' tables (columns from the question's options, conformity shown as it's typed).
// Each gets its value and an onChange taking an updater (value => newValue), so the wizard's
// single answers object is the only state.
//
// Every typed field has a microphone (voice: { recording, transcribing, error, onToggle }, from the
// wizard's one recorder, or null for none). A field that takes a microphone for a value it holds
// itself (« + Autre », a measure's next reading) gets mic(deliver) instead: deliver(text) is called
// with the transcript.
import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, ChevronDown, Loader2, Mic, Plus, RefreshCw, Search, Trash2, Wand2 } from "lucide-react";
import { averageOf, dictatedMeasure, frenchNumber, isRowFilled, newSummaryRow, newTableRow, pickedSuggestion, readingOf, searchKey, tableResult } from "./reportV2";

export const fieldInput =
    "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const chip = (on) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${on
        ? "border-[#1A75BC] bg-[#1A75BC]/10 font-medium text-[#1A75BC] dark:border-[#5BC6E8] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]"
        : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"}`;

// ---------------------------------------------------------------- dictation

// The microphone beside a field: tap to record, tap again to stop; the text then lands in the field.
// small: beside a compact input (a remark, a table cell)
export const MicButton = ({ voice, disabled, small = false }) => {
    if (!voice) return null;
    const size = small ? "h-8 w-8" : "h-9 w-9";
    return (
        <button type="button" onClick={voice.onToggle} disabled={disabled || voice.transcribing || voice.busy}
            aria-label={voice.recording ? "Arrêter la dictée" : "Dicter"} aria-pressed={voice.recording}
            title={voice.recording ? "Arrêter la dictée" : voice.busy ? "Une dictée est en cours sur un autre champ" : "Dicter"}
            className={`flex ${size} shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
                voice.recording ? "animate-pulse bg-red-600 text-white" : "border border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"}`}>
            {voice.transcribing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
        </button>
    );
};

// what the field says while its dictation runs, and its error
export const VoiceStatus = ({ voice }) => {
    if (!voice) return null;
    if (voice.recording) return <p className="mt-1 text-xs text-red-600 dark:text-red-400">Enregistrement… touchez le micro pour arrêter.</p>;
    if (voice.transcribing) return <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Transcription…</p>;
    if (voice.error) return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{voice.error}</p>;
    return null;
};

// ---------------------------------------------------------------- text

// A text, typed or dictated. suggestions: the field's usual values, as chips under it (the same
// logic as the full report): ticking one fills the field with it, in place of what was typed;
// unticking it empties the field.
// onBlur: when the field is left (a format to impose on what was typed)
export const TextField = ({ value, onChange, multiline = true, placeholder, voice, suggestions, onBlur, disabled }) => {
    const picked = suggestions ? pickedSuggestion(value, suggestions) : null;
    return (
    <div>
        <div className="flex items-start gap-2">
            {multiline ? (
                <textarea value={value} onChange={(e) => onChange(() => e.target.value)} rows={3} disabled={disabled || voice?.recording}
                    placeholder={placeholder} className={fieldInput} />
            ) : (
                <input value={value} onChange={(e) => onChange(() => e.target.value)} onBlur={onBlur} disabled={disabled || voice?.recording}
                    placeholder={placeholder} className={fieldInput} />
            )}
            <MicButton voice={voice} disabled={disabled} />
        </div>
        <VoiceStatus voice={voice} />
        {suggestions && (
            <div className="mt-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestions">
                    {suggestions.map((option) => {
                        const on = picked === option;
                        return (
                            <button key={option} type="button" onClick={() => onChange(() => (on ? "" : option))} disabled={disabled}
                                aria-pressed={on} className={`${chip(on)} px-2.5 py-1 text-xs`}>
                                {on ? "☑" : "☐"} {option}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Suggestions : choisissez une valeur pour remplir le champ, ou écrivez / dictez la vôtre.</p>
            </div>
        )}
    </div>)
};

// ---------------------------------------------------------------- a searchable list

// A text with a list to pick from (report_ui.md: « Client / dossier : texte, listes avec recherche »): typing
// filters the list (accents and case ignored); a pick fills the field; anything else can still be typed.
// options: [{ value, kind: "suggestion" | "known" }] — known: written in an earlier report.
const MAX_SHOWN = 8;
export const SearchField = ({ value, onChange, options, placeholder, voice, disabled, label }) => {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const typed = searchKey(value);
    // the value as it stands is one of the options: show them all, to change it
    const exact = options.some((o) => searchKey(o.value) === typed);
    const matches = (typed && !exact ? options.filter((o) => searchKey(o.value).includes(typed)) : options);
    const shown = matches.slice(0, MAX_SHOWN);
    const pick = (option) => { onChange(() => option.value); setOpen(false); setActive(-1); };
    const onKeyDown = (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === "Enter" && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
        else if (e.key === "Escape") setOpen(false);
    };
    return (
    <div>
        <div className="flex items-start gap-2">
            <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input value={value} disabled={disabled || voice?.recording} placeholder={placeholder} aria-label={label}
                    role="combobox" aria-expanded={open && shown.length > 0} aria-autocomplete="list"
                    onChange={(e) => { onChange(() => e.target.value); setOpen(true); setActive(-1); }}
                    onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
                    className={`${fieldInput} pl-9 pr-9`} />
                {options.length > 0 && (
                    <button type="button" tabIndex={-1} aria-label="Afficher la liste" disabled={disabled}
                        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
                        className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
                {open && shown.length > 0 && (
                    <ul role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        {shown.map((o, i) => (
                            <li key={o.value} role="option" aria-selected={i === active}
                                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === active
                                    ? "bg-[#1A75BC]/10 text-[#0F2A49] dark:text-white" : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700"}`}>
                                <span>{o.value}</span>
                                <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{o.kind === "known" ? "Déjà saisi" : "Suggestion"}</span>
                            </li>
                        ))}
                        {matches.length > MAX_SHOWN && (
                            <li className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">{matches.length - MAX_SHOWN} autre(s) : précisez la recherche.</li>
                        )}
                    </ul>
                )}
            </div>
            <MicButton voice={voice} disabled={disabled} />
        </div>
        <VoiceStatus voice={voice} />
    </div>)
};

// ---------------------------------------------------------------- « + Autre »

// The text box « + Autre » opens: what's typed (or dictated) becomes a ticked choice with « Ajouter »
// or Entrée. mic(deliver): the microphone, its transcript going into this box.
const OtherAdder = ({ onAdd, onClose, placeholder, label, mic, disabled }) => {
    const [draft, setDraft] = useState("");
    const voice = mic?.((text) => setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text).replace(/[.!?]+$/, "")));
    const add = () => {
        if (!draft.trim()) return;
        onAdd(draft.trim());
        setDraft("");
        onClose();
    };
    return (
        <div className="mt-2">
            <div className="flex items-center gap-2">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled || voice?.recording} autoFocus
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); add(); }
                        if (e.key === "Escape") { e.preventDefault(); onClose(); }
                    }}
                    placeholder={placeholder} aria-label={label} className={fieldInput} />
                <MicButton voice={voice} disabled={disabled} />
                <button type="button" onClick={add} disabled={disabled || !draft.trim()}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-[#1A75BC] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-40">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter
                </button>
            </div>
            <VoiceStatus voice={voice} />
        </div>
    );
};

// the « + Autre » chip that opens (and closes) the box
const OtherToggle = ({ open, onToggle, disabled, compact }) => (
    <button type="button" onClick={onToggle} disabled={disabled} aria-expanded={open}
        className={compact
            ? `rounded-lg border border-dashed px-2.5 py-1 text-xs transition ${open ? "border-[#1A75BC] text-[#1A75BC]" : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"}`
            : `${chip(open)} border-dashed`}>
        + Autre
    </button>
);

// the choice the typed text already is (ignoring case), else the text itself
const sameChoice = (text, choices) => choices.find((c) => c.toLowerCase() === text.toLowerCase()) ?? text;

// ---------------------------------------------------------------- photos

// Several photos, each with its title (and comment when the section asks for one), in a grid that
// adapts to how many there are; reordered, replaced, removed. onUpload(files, replaceKey) sends them.
export const PhotoGallery = ({ photos, onChange, onUpload, withComments = false, max = 30, disabled }) => {
    const replaceInput = useRef(null);
    const [replacing, setReplacing] = useState(null);
    const set = (key, field) => (e) => onChange((list) => list.map((p) => (p.key === key ? { ...p, [field]: e.target.value } : p)));
    const move = (i, by) => onChange((list) => {
        const next = [...list];
        [next[i], next[i + by]] = [next[i + by], next[i]];
        return next;
    });
    const remove = (key) => onChange((list) => list.filter((p) => p.key !== key));
    // one photo fills the row, two side by side, then three per row from sm
    const cols = photos.length <= 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3";

    return (
    <div>
        <div className={`grid gap-3 ${cols}`}>
            {photos.map((p, i) => (
                <figure key={p.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <div className="relative">
                        {p.url ? (
                            <img src={p.url} alt={p.title || `Photo ${i + 1}`} className="h-36 w-full object-cover sm:h-40" />
                        ) : (
                            // a photo back from a draft, its image on its way
                            <div className="flex h-36 w-full items-center justify-center bg-slate-100 sm:h-40 dark:bg-slate-900">
                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Chargement de la photo" />
                            </div>
                        )}
                        {p.status === "uploading" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
                                <Loader2 className="h-6 w-6 animate-spin text-[#1A75BC]" aria-label="Envoi de la photo" />
                            </span>
                        )}
                    </div>
                    <figcaption className="space-y-1.5 p-2">
                        <input value={p.title} onChange={set(p.key, "title")} disabled={disabled} placeholder={`Titre (ex. Vue ${i + 1})`}
                            aria-label={`Titre de la photo ${i + 1}`} className={`${fieldInput} py-1.5`} />
                        {withComments && (
                            <input value={p.comment} onChange={set(p.key, "comment")} disabled={disabled} placeholder="Commentaire"
                                aria-label={`Commentaire de la photo ${i + 1}`} className={`${fieldInput} py-1.5`} />
                        )}
                        {p.status === "error" && <p className="text-xs text-red-600 dark:text-red-400">{p.error}</p>}
                        <div className="flex items-center justify-between">
                            <div className="flex">
                                <IconButton label="Avancer" onClick={() => move(i, -1)} disabled={disabled || i === 0}><ArrowLeft className="h-4 w-4" /></IconButton>
                                <IconButton label="Reculer" onClick={() => move(i, 1)} disabled={disabled || i === photos.length - 1}><ArrowRight className="h-4 w-4" /></IconButton>
                            </div>
                            <div className="flex">
                                <IconButton label="Remplacer la photo" disabled={disabled}
                                    onClick={() => { setReplacing(p.key); replaceInput.current?.click(); }}><RefreshCw className="h-4 w-4" /></IconButton>
                                <IconButton label="Supprimer la photo" onClick={() => remove(p.key)} disabled={disabled} danger><Trash2 className="h-4 w-4" /></IconButton>
                            </div>
                        </div>
                    </figcaption>
                </figure>
            ))}
            {photos.length < max && (
                <label className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 transition hover:border-[#1A75BC] hover:text-[#1A75BC] dark:border-slate-600 dark:text-slate-400 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
                    <Camera className="h-5 w-5" aria-hidden="true" />
                    + Ajouter
                    <input type="file" accept="image/*" multiple className="sr-only" disabled={disabled}
                        onChange={(e) => { onUpload([...e.target.files].slice(0, max - photos.length)); e.target.value = ""; }} />
                </label>
            )}
        </div>
        <input ref={replaceInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { if (e.target.files[0] && replacing) onUpload([e.target.files[0]], replacing); e.target.value = ""; setReplacing(null); }} />
    </div>)
};

const IconButton = ({ label, onClick, disabled, danger, children }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition disabled:opacity-30 ${
            danger ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" : "hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"}`}>
        {children}
    </button>
);

// ---------------------------------------------------------------- findings (several)

// The part's findings: several can be ticked; « Bon état » (options.exclusive) excludes the others,
// with a discreet note when ticking one clears another. « + Autre » adds a finding that isn't listed:
// it shows ticked among the others, and unticking it removes it.
export const FindingsField = ({ value, onChange, options, mic, disabled }) => {
    const [note, setNote] = useState(null);
    const [adding, setAdding] = useState(false);
    const listed = options.choices ?? [];
    const typed = value.selected.filter((c) => !listed.includes(c));
    const exclusive = options.exclusive ?? null;
    const tick = (choice) => {
        const v = value;
        if (v.selected.includes(choice)) { onChange(() => ({ selected: v.selected.filter((c) => c !== choice) })); return; }
        if (choice === exclusive) {
            setNote(v.selected.length ? `« ${exclusive} » exclut les anomalies : elles ont été décochées.` : null);
            onChange(() => ({ selected: [choice] }));
            return;
        }
        setNote(exclusive && v.selected.includes(exclusive) ? `« ${exclusive} » a été décoché : une anomalie est signalée.` : null);
        onChange(() => ({ selected: [...v.selected.filter((c) => c !== exclusive), choice] }));
    };
    const add = (text) => {
        const choice = sameChoice(text, [...listed, ...typed]);
        if (!value.selected.includes(choice)) tick(choice);
    };

    return (
    <div>
        <div className="flex flex-wrap gap-2" role="group">
            {[...listed, ...typed].map((choice) => {
                const on = value.selected.includes(choice);
                return (
                    <button key={choice} type="button" onClick={() => tick(choice)} disabled={disabled}
                        aria-pressed={on} className={chip(on)} title={typed.includes(choice) ? "Ajouté avec « Autre » : décocher le retire" : undefined}>
                        {on ? "☑" : "☐"} {choice}
                    </button>
                );
            })}
            {options.allowOther && <OtherToggle open={adding} onToggle={() => setAdding((a) => !a)} disabled={disabled} />}
        </div>
        {adding && (
            <OtherAdder onAdd={add} onClose={() => setAdding(false)} placeholder="Précisez l'anomalie" label="Autre anomalie" mic={mic} disabled={disabled} />
        )}
        {note && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </div>)
};

// ---------------------------------------------------------------- one choice

// A recommendation or a montage status: one choice. « + Autre » (when allowed) adds a choice that
// isn't listed: it shows chosen among the others; choosing another one replaces it.
// compact: the montage checklist's row (segmented buttons, the remark beside)
export const ChoiceField = ({ value, onChange, options, mic, disabled, compact = false, name }) => {
    const [adding, setAdding] = useState(false);
    const listed = options.choices ?? [];
    const typed = value.selected && !listed.includes(value.selected) ? value.selected : null;
    const pick = (choice) => onChange((v) => ({ selected: v.selected === choice ? null : choice }));
    const bad = (options.nonConforming ?? []).includes(value.selected);
    return (
    <div>
        <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-2"}`} role="radiogroup" aria-label={name}>
            {[...listed, ...(typed ? [typed] : [])].map((choice) => {
                const on = value.selected === choice;
                const style = compact
                    ? `rounded-lg border px-2.5 py-1 text-xs transition ${on
                        ? (options.nonConforming ?? []).includes(choice)
                            ? "border-red-400 bg-red-50 font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                            : "border-emerald-400 bg-emerald-50 font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"}`
                    : chip(on);
                return (
                    <button key={choice} type="button" role="radio" aria-checked={on} onClick={() => pick(choice)} disabled={disabled} className={style}>
                        {compact ? choice : `${on ? "◉" : "○"} ${choice}`}
                    </button>
                );
            })}
            {options.allowOther && <OtherToggle open={adding} onToggle={() => setAdding((a) => !a)} disabled={disabled} compact={compact} />}
        </div>
        {adding && (
            <OtherAdder onAdd={(text) => onChange(() => ({ selected: sameChoice(text, listed) }))} onClose={() => setAdding(false)}
                placeholder="Précisez (option ou justification)" label="Autre choix" mic={mic} disabled={disabled} />
        )}
        {bad && compact && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Une remarque est obligatoire.</p>}
    </div>)
};

// ---------------------------------------------------------------- readings of a measure

// One measure: its drawing, the value typed then « + Ajouter une prise », the table of readings
// (each editable, removable) and their average. The readings are never replaced by the average.
// mic(deliver): a dictated number is added as a reading; anything else waits in the box.
// value: { readings, out } — out: the technician marked the measure « hors tolérance »
export const MeasureField = ({ value, onChange, options, label, mic, disabled }) => {
    const [draft, setDraft] = useState("");
    const voice = mic?.((text) => {
        // "0 virgule 05 millimètres" → "0,05 mm" → "0,05": the unit is the field's
        const said = dictatedMeasure(text).replace(/\s*(mm|millim[eè]tres?)$/i, "").trim();
        if (readingOf(said) !== null) onChange((v) => ({ ...v, readings: [...v.readings, said] }));
        else setDraft(said);
    });
    const unit = options.unit ? ` ${options.unit}` : "";
    const add = () => {
        if (readingOf(draft) === null) return;
        onChange((v) => ({ ...v, readings: [...v.readings, draft.trim()] }));
        setDraft("");
    };
    const average = averageOf(value.readings);
    const invalid = value.readings.some((r) => readingOf(r) === null);
    return (
    <div className="space-y-2">
        {options.drawing && (
            <img src={options.drawing} alt={`Illustration : ${label}`} className="mx-auto h-36 w-full max-w-sm object-contain" />
        )}
        <div className="flex items-center gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" enterKeyHint="done" disabled={disabled}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                placeholder={`Valeur${unit}`} aria-label={`Nouvelle prise : ${label}`} className={`${fieldInput} min-w-0 max-w-40 tabular-nums`} />
            <MicButton voice={voice} disabled={disabled} />
            <button type="button" onClick={add} disabled={disabled || readingOf(draft) === null}
                aria-label="Ajouter une prise"
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#1A75BC] px-3 py-2 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-40 dark:border-[#5BC6E8] dark:text-[#5BC6E8]">
                <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter<span className="hidden sm:inline">&nbsp;une prise</span>
            </button>
        </div>
        {value.readings.length > 0 && (
            <table className="w-full max-w-md text-sm">
                <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="py-1 font-semibold">Prise</th><th className="py-1 font-semibold">Valeur{unit}</th><th className="sr-only">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {value.readings.map((r, i) => (
                        <tr key={i}>
                            <td className="py-1 tabular-nums text-slate-500 dark:text-slate-400">{i + 1}</td>
                            <td className="py-1">
                                <input value={r} inputMode="decimal" disabled={disabled} aria-label={`Prise ${i + 1}`}
                                    onChange={(e) => onChange((v) => ({ ...v, readings: v.readings.map((x, j) => (j === i ? e.target.value : x)) }))}
                                    className={`${fieldInput} max-w-32 py-1 tabular-nums ${readingOf(r) === null ? "border-red-400" : ""}`} />
                            </td>
                            <td className="py-1 text-right">
                                <IconButton label={`Supprimer la prise ${i + 1}`} disabled={disabled} danger
                                    onClick={() => onChange((v) => ({ ...v, readings: v.readings.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></IconButton>
                            </td>
                        </tr>
                    ))}
                    <tr className={`font-medium ${value.out ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-slate-100"}`}>
                        <td className="py-1.5">Moyenne</td>
                        <td className="py-1.5 tabular-nums" colSpan={2}>{frenchNumber(average)}{average !== null ? unit : ""}{value.out ? " · hors tolérance" : ""}</td>
                    </tr>
                </tbody>
            </table>
        )}
        <VoiceStatus voice={voice} />
        {invalid && <p className="text-xs text-red-600 dark:text-red-400">Une prise n'est pas un nombre : elle ne compte pas dans la moyenne.</p>}
        {/* the technician's judgement: no limit is stored yet (option A), so the flag is set by hand */}
        <button type="button" role="switch" aria-checked={!!value.out} disabled={disabled || average === null}
            onClick={() => onChange((v) => ({ ...v, out: !v.out }))}
            title={average === null ? "Ajoutez une prise d'abord" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${value.out
                ? "border-red-400 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"}`}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {value.out ? "Hors tolérance — touchez pour annuler" : "Marquer hors tolérance"}
        </button>
    </div>)
};

// ---------------------------------------------------------------- parts summary

// The summary table: quantity, part, code, recommendation, the client's decision, remark. Each
// column suggests its options and takes free text. « Générer depuis l'inspection » adds the inspected
// parts that have a recommendation and aren't listed yet; the client's decision stays to fill.

// mic(rowKey, field, deliver): the microphone of a row's part name or remark
export const PartsSummaryField = ({ value, onChange, options, onGenerate, mic, disabled, id }) => {
    const put = (key, field, text) => onChange((v) => ({ rows: v.rows.map((r) => (r.key === key ? { ...r, [field]: text } : r)) }));
    const set = (key, field) => (e) => put(key, field, e.target.value);
    const voiceOf = (key, field) => mic?.(key, field, (text) => put(key, field, text.trim().replace(/[.!?]+$/, "")));
    const lists = { recommendation: options.recommendations ?? [], decision: options.decisions ?? [], remark: options.remarks ?? [] };
    return (
    <div className="space-y-3">
        {Object.entries(lists).map(([field, list]) => (
            <datalist key={field} id={`${id}-${field}`}>{list.map((o) => <option key={o} value={o} />)}</datalist>
        ))}
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onGenerate} disabled={disabled}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                <Wand2 className="h-4 w-4" aria-hidden="true" /> Générer depuis l'inspection
            </button>
            <button type="button" onClick={() => onChange((v) => ({ rows: [...v.rows, newSummaryRow()] }))} disabled={disabled}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-50 dark:text-[#5BC6E8]">
                <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une ligne
            </button>
        </div>
        {value.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                Aucune ligne. Générez-les depuis l'inspection ou ajoutez-en une.
            </p>
        ) : (
            <ol className="space-y-3">
                {value.rows.map((r, i) => (
                    <li key={r.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ligne {i + 1}</span>
                            <IconButton label={`Supprimer la ligne ${i + 1}`} disabled={disabled} danger
                                onClick={() => onChange((v) => ({ rows: v.rows.filter((x) => x.key !== r.key) }))}><Trash2 className="h-4 w-4" /></IconButton>
                        </div>
                        <div className="mt-1 grid grid-cols-[4.5rem_1fr] gap-2 sm:grid-cols-[4.5rem_1fr_8rem]">
                            <Labelled label="Qté"><input value={r.quantity} onChange={set(r.key, "quantity")} inputMode="numeric" disabled={disabled} className={`${fieldInput} tabular-nums`} /></Labelled>
                            <Labelled label="Pièce"><WithMic voice={voiceOf(r.key, "description")} disabled={disabled}><input value={r.description} onChange={set(r.key, "description")} disabled={disabled} className={fieldInput} /></WithMic></Labelled>
                            <Labelled label="Code" className="col-span-2 sm:col-span-1"><input value={r.code} onChange={set(r.key, "code")} disabled={disabled} className={fieldInput} /></Labelled>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <Labelled label="Recommandation"><input value={r.recommendation} onChange={set(r.key, "recommendation")} list={`${id}-recommendation`} disabled={disabled} className={fieldInput} /></Labelled>
                            <Labelled label="Décision client"><input value={r.decision} onChange={set(r.key, "decision")} list={`${id}-decision`} disabled={disabled} className={fieldInput} /></Labelled>
                            <Labelled label="Remarque"><WithMic voice={voiceOf(r.key, "remark")} disabled={disabled}><input value={r.remark} onChange={set(r.key, "remark")} list={`${id}-remark`} disabled={disabled} className={fieldInput} /></WithMic></Labelled>
                        </div>
                    </li>
                ))}
            </ol>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
            La recommandation est l'avis technique ; la décision client dit qui prend la pièce en charge. L'une ne remplit pas l'autre.
        </p>
    </div>)
};

// ---------------------------------------------------------------- tables (control sheets)

const RESULT_STYLES = {
    Conforme: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    "Non conforme": "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    invalid: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};

// A TABLE answer (StructuredAnswers): one card per row, a labelled input per column, so a row of eight
// columns still fits a phone. A number column takes "0,05" as well as "0.05"; a choice column is a list;
// the result column shows the conformity the server will compute, from the signed tolerances.
export const TableField = ({ value, onChange, options, disabled, label }) => {
    const columns = options.columns ?? [];
    const put = (key, column, text) => onChange((v) => ({ rows: v.rows.map((r) => (r.key === key ? { ...r, [column]: text } : r)) }));
    const max = options.maxRows ?? 200;
    const filled = value.rows.filter((r) => isRowFilled(options, r)).length;
    return (
    <div className="space-y-3">
        {options.tolerance && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Tolérances signées, comme sur le plan : tol. inf <span className="font-mono">−0,05</span>, tol. sup <span className="font-mono">+0,02</span>. La conformité est calculée.
            </p>
        )}
        <ol className="space-y-3">
            {value.rows.map((r, i) => {
                const result = tableResult(options, r);
                return (
                <li key={r.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ligne {i + 1}</span>
                        <div className="flex items-center gap-2">
                            {result && (
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RESULT_STYLES[result]}`}>
                                    {result === "invalid" ? "Tol. inf > tol. sup" : result}
                                </span>
                            )}
                            <IconButton label={`Supprimer la ligne ${i + 1}`} disabled={disabled} danger
                                onClick={() => onChange((v) => ({ rows: v.rows.filter((x) => x.key !== r.key) }))}><Trash2 className="h-4 w-4" /></IconButton>
                        </div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {columns.filter((c) => c.type !== "result").map((c) => {
                            const cell = r[c.key] ?? "";
                            const set = (e) => put(r.key, c.key, e.target.value);
                            const wide = c.type === "text" && /comment|observation|exigence|désignation/i.test(c.label);
                            return (
                                <Labelled key={c.key} label={c.label} className={wide ? "col-span-2" : ""}>
                                    {c.type === "choice" ? (
                                        <select value={cell} onChange={set} disabled={disabled} className={fieldInput}>
                                            <option value="">—</option>
                                            {(c.choices ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    ) : c.type === "date" ? (
                                        <input type="date" value={cell} onChange={set} disabled={disabled} className={fieldInput} />
                                    ) : (
                                        <input value={cell} onChange={set} disabled={disabled}
                                            inputMode={c.type === "number" ? "decimal" : undefined}
                                            className={`${fieldInput} ${c.type === "number" ? "tabular-nums" : ""} ${c.type === "number" && String(cell).trim() && readingOf(String(cell).replace("\u2212", "-").replace(/^\+/, "")) === null ? "border-red-400" : ""}`} />
                                    )}
                                </Labelled>
                            );
                        })}
                    </div>
                </li>
                );
            })}
        </ol>
        <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => onChange((v) => ({ rows: [...v.rows, newTableRow()] }))} disabled={disabled || value.rows.length >= max}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-50 dark:text-[#5BC6E8]">
                <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une ligne
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400" aria-label={`${label} : lignes remplies`}>
                {filled} ligne{filled > 1 ? "s" : ""} remplie{filled > 1 ? "s" : ""} · les lignes vides ne sont pas envoyées
            </span>
        </div>
    </div>)
};

// an input with its microphone beside it, and what the dictation says under it
export const WithMic = ({ voice, disabled, children }) => (
    <div>
        <div className="flex items-center gap-1.5">{children}<MicButton voice={voice} disabled={disabled} small /></div>
        <VoiceStatus voice={voice} />
    </div>
);

const Labelled = ({ label, className = "", children }) => (
    <label className={`block text-xs font-medium text-slate-500 dark:text-slate-400 ${className}`}>
        {label}
        <div className="mt-0.5">{children}</div>
    </label>
);
