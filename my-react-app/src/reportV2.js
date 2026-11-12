// The v2 expertise reports (report_ui.md): what ReportWizard.jsx needs that isn't drawing. Their
// pages come from the questions' labels, "Rubrique : Champ" or "Rubrique > Sous-page : Champ"
// (one page per sub-page), and each question's options say how it's answered (choices, unit…,
// StructuredAnswers on the backend). Answers live in one object while the technician moves from
// page to page, and only become the request (SubmissionRequest) when the report is sent.

import { dictatedMeasure, pickedSuggestion, suggestionsFor } from "./expertiseComplet";
export { dictatedMeasure, pickedSuggestion };

export const V2_DISMANTLING_TITLE = "Rapport d'expertise V2 (démontage)";
export const V2_MOUNTING_TITLE = "Rapport d'expertise V2 (montage)";
export const V2_COMPLETE_TITLE = "Rapport d'expertise V2 (complet)";

// every "Rapport d'expertise V2 …" form, whatever comes after
export const isV2Title = (title) => !!title?.trim().toLowerCase().startsWith("rapport d'expertise v2");

// the rubrique where « + Ajouter une pièce » adds a page
export const INSPECTION_RUBRIQUE = "Inspection des pièces";

// what an added part offers (the generic template, report_ui.md "Autres pièces")
export const EXTRA_PART_FINDINGS = ["Bon état", "Dégradé"];
export const EXTRA_PART_RECOMMENDATIONS = ["Nettoyage et réutilisation", "Réparation et réutilisation", "Remplacement"];

// "Inspection des pièces > Corps de pompe : Photos" → { rubrique, page, field }
export const splitLabel = (label) => {
    const at = label.indexOf(" : ");
    const head = at === -1 ? label : label.slice(0, at);
    const field = at === -1 ? label : label.slice(at + 3);
    const [rubrique, ...rest] = head.split(" > ");
    return { rubrique: rubrique.trim(), page: rest.length ? rest.join(" > ").trim() : null, field: field.trim() };
};

// The wizard's pages, in the form's order, grouped by rubrique:
//   [{ key, rubrique, rubriqueIndex, page, questions }]
// A rubrique without sub-pages is one page. Questions are in position order.
export const buildPages = (questions) => {
    const rubriques = [];
    const byKey = new Map();
    [...questions].sort((a, b) => a.position - b.position).forEach((q) => {
        const { rubrique, page } = splitLabel(q.labelFr);
        let r = rubriques.find((x) => x.name === rubrique);
        if (!r) { r = { name: rubrique, pages: [] }; rubriques.push(r); }
        const key = `${rubrique}>${page ?? ""}`;
        let p = byKey.get(key);
        if (!p) { p = { key, rubrique, page, questions: [] }; byKey.set(key, p); r.pages.push(p); }
        p.questions.push(q);
    });
    return rubriques.flatMap((r, rubriqueIndex) => r.pages.map((p) => ({ ...p, rubriqueIndex })));
};

// ---------------------------------------------------------------- suggestions and dictation

// A short field's usual values (the same lists as the full report, expertiseComplet.js): ticking one
// fills the field with it, unticking empties it. Looked up by rubrique and field, whatever the sub-page,
// so "Garniture mécanique > Identification : Fabricant" finds the seal's makers.
const V2_SUGGESTION_ALIASES = { "Informations générales : Adresse": "Informations générales : Adresse client" };
export const suggestionsOf = (q) => {
    const { rubrique, field } = splitLabel(q.labelFr);
    const key = `${rubrique} : ${field}`;
    return optionsOf(q).suggestions ?? suggestionsFor(V2_SUGGESTION_ALIASES[key] ?? key);
};

// Put in front of a dictated comment so the transcriber expects a teardown's words. The server sends
// the context as Whisper's whole prompt, and Whisper only reads its last 224 tokens: the field's own
// words go last, closest to the audio.
const EXPERTISE_VOCABULARY =
    "Rien à signaler. Bon état. La roue est usée. Les aubes sont cassées. L'arbre est rayé. La clavette est abîmée. " +
    "Les roulements sont grippés. La garniture fuit. Le joint torique est abîmé. La chemise est usée. " +
    "La bague d'usure est usée. Produit colmaté. Corrosion, érosion, fissure, traces de frottement. " +
    "Nettoyage et réutilisation. Réparation et réutilisation. Remplacement.";

// The identification fields' formats (PHOVA's own references): the example shown in the empty field,
// a few values of that shape for the transcriber to copy (Whisper follows its prompt's spelling: it then
// writes "40001523", not "quatre millions…" or "4000 15 23"), and how a dictated value is tidied into
// that shape. In "4000XXXX", "WO-RO-055xxx" and "11xx11xx" the x are digits; in "03XYP03" letters.
const spokenSymbols = (text) => text
    .replace(/\btirets?\b/gi, "-")
    .replace(/\s*pour\s*cents?\b/gi, "%")
    .replace(/\s+%/g, "%");
// "03 xyp 03" → "03XYP03", "11 25 11 30" → "11251130"
const compactCode = (text) => spokenSymbols(text).toUpperCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, "");
const FIELD_FORMATS = {
    "Informations générales : N° de commande": {
        example: "4000XXXX", spoken: ["40001523", "40002871", "40000964"],
        tidy: (t) => t.replace(/\D/g, "") || t,
    },
    "Informations générales : N° d'opération": {
        example: "WO-RO-055xxx", spoken: ["WO-RO-055214", "WO-RO-055307", "WO-RO-055482"],
        // Said as letters then digits in groups, with pauses: "WO RO 05 52 14", "W.O. R.O. 055 214",
        // "double v o r o 05 52 14", "Wo-Ro, 05-52-14" → "WO-RO-055214". Every separator goes, the groups of
        // digits are joined; the number alone gets its prefix.
        tidy: (t) => {
            const bare = spokenSymbols(t).toUpperCase().replace(/DOUBLE[\s-]*V[ÉE]?\b/g, "W").replace(/[^A-Z0-9]/g, "");
            const number = bare.match(/^(?:WORO|WO|RO)?(\d+)$/)?.[1];
            return number ? `WO-RO-${number}` : compactCode(t);
        },
    },
    "Informations générales : Matricule": {
        example: "11xx11xx", spoken: ["11251130", "11481107", "11032196"],
        tidy: compactCode,
    },
    "Informations générales : Type": {
        example: "OTC125-43", spoken: ["OTC125-43", "OTC150-40", "OTW100-31"],
        // The dash is imposed, whether dictated or typed (imposed: tidied when the field is left too):
        // the letters, the number, "-", the last group. "OTC 125 43", "OTC 1 25 43", "otc12543", "OTC125 – 43"
        // → "OTC125-43": with 5 digits the split is 3 + 2, otherwise the dash goes before the last spoken group.
        imposed: true,
        tidy: (t) => {
            const said = spokenSymbols(t).toUpperCase().replace(/[–—_]/g, "-").replace(/[^A-Z0-9\s-]/g, " ").trim();
            const m = said.match(/^([A-Z][A-Z\s]*?)[\s-]*(\d[\d\s-]*)$/);
            if (!m) return said.replace(/\s+/g, " ");
            const prefix = m[1].trim().replace(/\s+/g, " ");
            const groups = m[2].split(/[\s-]+/).filter(Boolean);
            const digits = groups.join("");
            const [head, tail] = digits.length === 5 ? [digits.slice(0, 3), digits.slice(3)]
                : groups.length >= 2 ? [groups.slice(0, -1).join(""), groups[groups.length - 1]]
                : digits.length > 2 ? [digits.slice(0, -2), digits.slice(-2)]
                : [digits, null];
            return `${prefix}${head}${tail ? `-${tail}` : ""}`;
        },
    },
    "Informations générales : Fluide pompé": {
        example: "acide 53%", spoken: ["Acide 53%", "Acide 29%", "Acide sulfurique 98%"],
        tidy: spokenSymbols,
    },
    "Informations générales : Repère géographique": {
        example: "03XYP03", spoken: ["03XYP03", "04ABP01", "05KLP02"],
        tidy: compactCode,
    },
};
const ALIASES = { "Informations générales : Matricule équipement": "Informations générales : Matricule" };
export const formatOf = (q) => {
    const { rubrique, field } = splitLabel(q.labelFr);
    const key = `${rubrique} : ${field}`;
    return FIELD_FORMATS[ALIASES[key] ?? key] ?? null;
};

const where = (q) => {
    const { rubrique, page } = splitLabel(q.labelFr);
    return `Rapport d'expertise pompe. ${rubrique}.${page ? ` ${page}.` : ""}`;
};

// What a field's dictation is about, sent with the clip (useVoiceInput → /ask/transcribeReport).
//   kind "text":    a comment or a short field; its suggestions, or the page's findings, are named
//   kind "measure": a reading, said as a number
//   kind "other":   a value added with « + Autre » to a list of choices
// pageQuestions: the page's other questions, whose choices a comment is likely to name.
export const dictationContext = (q, { kind = "text", pageQuestions = [], choices = null } = {}) => {
    const { field } = splitLabel(q.labelFr);
    if (kind === "measure")
        return `${where(q)} ${field}. Valeurs en millimètres, par exemple 0,08. 0,12. 1,5. ${field} :`;
    if (kind === "other")
        return `${EXPERTISE_VOCABULARY} ${where(q)} ${field} déjà proposés : ${(choices ?? []).join(". ")}. Autre ${field.toLowerCase()} :`;
    const suggestions = suggestionsOf(q);
    const format = formatOf(q);
    if (format || suggestions)
        return `${where(q)}${format ? ` ${field}, par exemple : ${format.spoken.join(". ")}.` : ""}`
            + `${suggestions ? ` ${field} possibles : ${suggestions.join(". ")}.` : ""} ${field} :`;
    const named = pageQuestions.flatMap((x) => optionsOf(x).choices ?? []);
    return `${EXPERTISE_VOCABULARY} ${where(q)}${named.length ? ` ${[...new Set(named)].join(". ")}.` : ""} ${field} :`;
};

// a short dictated value: no closing full stop; a suggestion when it names one, else tidied into the
// field's format (formatOf) when it has one and the value has digits
export const dictatedShort = (text, suggestions, format = null) => {
    const value = text.trim().replace(/[.!?]+$/, "");
    const named = suggestions && pickedSuggestion(value, suggestions);
    // a reference always has digits: words without any ("je ne sais pas", "Eau de mer") stay as said
    return named ?? (format && /\d/.test(value) ? format.tidy(value).trim() : value);
};

// a question's options, {} for none
export const optionsOf = (q) => q.options ?? {};

// questions shown together: [{ group, questions }] in order, group null for the ungrouped
export const groupsOf = (questions) => {
    const groups = [];
    questions.forEach((q) => {
        const group = optionsOf(q).group ?? null;
        const last = groups[groups.length - 1];
        if (last && last.group === group) last.questions.push(q);
        else groups.push({ group, questions: [q] });
    });
    return groups;
};

// the empty answer of each type, as the wizard holds it
export const emptyValue = (type) => {
    switch (type) {
        case "IMAGE": return [];
        // what's ticked; a value typed with « + Autre » is ticked like the listed ones (otherOf)
        case "MULTI_CHOICE": return { selected: [] };
        case "SINGLE_CHOICE": return { selected: null };
        case "MEASURE": return { readings: [] };
        case "PARTS_SUMMARY": return { rows: [] };
        case "TABLE": return { rows: [] };
        default: return "";
    }
};

// ---------------------------------------------------------------- tables (the quality control sheets)

// a new row of a TABLE answer: its cells are added as they're typed, by column key
let tableRowKey = 0;
export const newTableRow = () => ({ key: `trow-${tableRowKey++}` });

// what a question starts with: a TABLE shows its options.rows empty rows (3 by default), like the paper sheet
export const startValue = (q) =>
    q.answerType === "TABLE"
        ? { rows: Array.from({ length: optionsOf(q).rows ?? 3 }, newTableRow) }
        : emptyValue(q.answerType);

// the columns typed in (a result column is computed, never typed)
const typedColumns = (options) => (options.columns ?? []).filter((c) => c.type !== "result");

// a row counts once one of its typed cells holds something; empty rows aren't sent
export const isRowFilled = (options, row) => typedColumns(options).some((c) => String(row[c.key] ?? "").trim());

// "−0,05" or "+0.02" → -0.05 / 0.02; null if it isn't a number
const signedNumber = (text) => readingOf(String(text ?? "").replace("\u2212", "-").replace(/^\+/, ""));

// « Conforme » / « Non conforme » as the server will compute it (StructuredAnswers.conformity):
// nominal + tol. inf ≤ measured ≤ nominal + tol. sup, the tolerances signed; null until all four are typed,
// "invalid" when tol. inf is above tol. sup
export const tableResult = (options, row) => {
    const t = options.tolerance;
    if (!t) return null;
    const [measured, nominal, min, max] = [t.measured, t.nominal, t.min, t.max].map((k) => signedNumber(row[k]));
    if ([measured, nominal, min, max].some((n) => n === null)) return null;
    if (min > max) return "invalid";
    return measured >= nominal + min - 1e-9 && measured <= nominal + max + 1e-9 ? "Conforme" : "Non conforme";
};

// a typed reading: "0,05" or "0.05" → 0.05; null if it isn't a number
export const readingOf = (text) => {
    const clean = String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
};

// the mean, 3 decimals at most, like the server; null without readings
export const averageOf = (readings) => {
    const numbers = readings.map(readingOf).filter((n) => n !== null);
    if (!numbers.length) return null;
    return Math.round((numbers.reduce((s, n) => s + n, 0) / numbers.length) * 1000) / 1000;
};

export const frenchNumber = (n) => (n === null || n === undefined ? "—" : String(n).replace(".", ","));

// whether a question has been answered (what the footer and the progress bar count)
export const isAnswered = (q, answer) => {
    const v = answer?.value;
    switch (q.answerType) {
        case "IMAGE": return (v ?? []).length > 0;
        case "MULTI_CHOICE": return (v?.selected?.length ?? 0) > 0;
        case "SINGLE_CHOICE": return !!v?.selected;
        case "MEASURE": return (v?.readings ?? []).some((r) => readingOf(r) !== null);
        case "PARTS_SUMMARY": return (v?.rows ?? []).some((r) => r.description?.trim());
        case "TABLE": return (v?.rows ?? []).some((r) => isRowFilled(optionsOf(q), r));
        default: return !!(v ?? "").toString().trim();
    }
};

// an added part, as the wizard holds it: its findings and recommendation in the fields' shapes
export const newExtraPart = (key) => ({
    key, name: "", photos: [], findings: emptyValue("MULTI_CHOICE"), comment: "", recommendation: emptyValue("SINGLE_CHOICE"),
});

// an added part counts as filled once it has anything besides its name
export const isPartFilled = (part) =>
    part.photos.length > 0 || part.findings.selected.length > 0 || !!part.comment.trim() || !!part.recommendation.selected;

const chosenOf = (choice) => choice?.selected || null;

// Several values typed with « + Autre » travel as the answer's one "other" text, joined by this
// (the PDF and the review page split it back into ticked boxes).
export const OTHER_SEPARATOR = "; ";

// a choice's value as the server reads it: the listed ones, and the typed ones as "other"
//   multi:  { selected: ["Corrosion", "rayure côté aspiration"] } → { listed: ["Corrosion"], other: "rayure côté aspiration" }
//   single: { selected: "Garder sous réserve" }                     → { listed: null, other: "Garder sous réserve" }
export const otherOf = (value, choices) => {
    const listed = new Set(choices ?? []);
    if (Array.isArray(value?.selected)) {
        const typed = value.selected.filter((c) => !listed.has(c));
        return { listed: value.selected.filter((c) => listed.has(c)), other: typed.join(OTHER_SEPARATOR) || null };
    }
    const s = value?.selected ?? null;
    return s === null ? { listed: null, other: null } : listed.has(s) ? { listed: s, other: null } : { listed: null, other: s };
};

// the question whose answer is the report's equipment / inspection date (options.meta)
export const metaQuestion = (questions, meta) => questions.find((q) => optionsOf(q).meta === meta) ?? null;

// photos still sending or refused: the report can't go while there are some
export const photoProblems = (answers, extraParts) => {
    const all = [
        ...Object.values(answers).flatMap((a) => (Array.isArray(a?.value) ? a.value : [])),
        ...extraParts.flatMap((p) => p.photos),
    ];
    return { uploading: all.filter((p) => p.status === "uploading").length, failed: all.filter((p) => p.status === "error").length };
};

const photosOut = (photos) => photos.filter((p) => p.imageId).map((p) => ({
    imageId: p.imageId, title: p.title?.trim() || null, comment: p.comment?.trim() || null,
}));

// one answer as the server reads it (SubmissionRequest.AnswerItem.value): text, or JSON for the v2 types
const valueOut = (q, value) => {
    switch (q.answerType) {
        case "IMAGE": {
            const photos = photosOut(value ?? []);
            return photos.length ? JSON.stringify(photos) : "";
        }
        case "MULTI_CHOICE": {
            if (!value?.selected?.length) return "";
            const { listed, other } = otherOf(value, optionsOf(q).choices);
            return JSON.stringify({ selected: listed, other });
        }
        case "SINGLE_CHOICE": {
            if (!value?.selected) return "";
            const { listed, other } = otherOf(value, optionsOf(q).choices);
            return JSON.stringify({ selected: listed, other });
        }
        case "MEASURE": {
            const readings = (value?.readings ?? []).map(readingOf).filter((n) => n !== null);
            if (!readings.length) return "";
            return JSON.stringify(value?.out ? { readings, out: true } : { readings });
        }
        case "PARTS_SUMMARY": {
            const rows = (value?.rows ?? []).filter((r) => r.description?.trim()).map((r) => ({
                quantity: r.quantity === "" || r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
                description: r.description.trim(),
                code: r.code?.trim() || null,
                recommendation: r.recommendation?.trim() || null,
                decision: r.decision?.trim() || null,
                remark: r.remark?.trim() || null,
            }));
            return rows.length ? JSON.stringify({ rows }) : "";
        }
        case "TABLE": {
            const options = optionsOf(q);
            const rows = (value?.rows ?? []).filter((r) => isRowFilled(options, r)).map((r) =>
                Object.fromEntries(typedColumns(options).map((c) => [c.key, String(r[c.key] ?? "").trim() || null])));
            return rows.length ? JSON.stringify({ rows }) : "";
        }
        default: return (value ?? "").toString().trim();
    }
};

// the request (SubmissionRequest): every question answered or blank, the added parts, the task
export const requestBody = ({ template, answers, extraParts, remarks, taskId }) => {
    const equipmentQ = metaQuestion(template.questions, "equipment");
    const dateQ = metaQuestion(template.questions, "inspectionDate");
    return {
        templateId: template.id,
        ...(taskId ? { taskId } : {}),
        equipment: (answers[equipmentQ?.id]?.value ?? "").trim(),
        inspectionDate: answers[dateQ?.id]?.value || null,
        remarks: remarks.trim() || null,
        answers: template.questions.map((q) => ({
            itemId: q.id,
            value: valueOut(q, answers[q.id]?.value),
            comment: answers[q.id]?.comment?.trim() || null,
        })),
        extraParts: extraParts.filter((p) => p.name.trim()).map((p) => {
            const findings = otherOf(p.findings, EXTRA_PART_FINDINGS);
            const recommendation = otherOf(p.recommendation, EXTRA_PART_RECOMMENDATIONS);
            return {
                name: p.name.trim(),
                photos: photosOut(p.photos),
                findings: findings.listed,
                findingsOther: findings.other,
                comment: p.comment.trim() || null,
                recommendation: recommendation.listed,
                recommendationOther: recommendation.other,
            };
        }),
    };
};

// The summary's rows from the inspection (report_ui.md écran 7): every part page with a
// recommendation, and every added part with one. The recommendation is turned into the table's
// Garder / Réparer / Changer when it says so; the client's decision stays the technician's to fill.
const tableRecommendation = (text) => {
    const t = (text ?? "").toLowerCase();
    if (/remplacement|changement|nouveau/.test(t)) return "Changer";
    if (/réparation|rodage|polissage/.test(t)) return "Réparer";
    if (/nettoyage|réutilisation/.test(t)) return "Garder";
    return text ?? "";
};

export const summaryRowsFrom = (pages, answers, extraParts) => {
    const rows = [];
    pages.filter((p) => p.page).forEach((p) => {
        const rec = p.questions.find((q) => q.answerType === "SINGLE_CHOICE" && splitLabel(q.labelFr).field === "Recommandation");
        const chosen = rec && chosenOf(answers[rec.id]?.value);
        if (chosen) rows.push({ description: p.page, recommendation: tableRecommendation(chosen) });
    });
    extraParts.forEach((part) => {
        const chosen = chosenOf(part.recommendation);
        if (part.name.trim() && chosen) rows.push({ description: part.name.trim(), recommendation: tableRecommendation(chosen) });
    });
    return rows;
};

// a new row of the parts summary table (row: what it starts with)
let rowKey = 0;
export const newSummaryRow = (row = {}) => ({ key: `row-${rowKey++}`, quantity: "1", description: "", code: "", recommendation: "", decision: "", remark: "", ...row });

// "2026-11-08", the device's own day (an ISO string would be UTC's)
export const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- drafts (form-draft-persistence.md)

// What a draft keeps: the answers, the added parts, the remarks and the page shown. A photo keeps its id,
// title and comment only (never the photo, nor a preview that only lives in this tab); one still uploading
// or refused is left out, it would have to be taken again.
const DRAFT_VERSION = 1;
const photoForDraft = (p) => ({ key: p.key, imageId: p.imageId, title: p.title ?? "", comment: p.comment ?? "" });
const photosForDraft = (list) => (list ?? []).filter((p) => p.imageId && p.status === "done").map(photoForDraft);

export const draftPayload = ({ answers, extraParts, remarks, index }) => JSON.stringify({
    v: DRAFT_VERSION,
    index,
    remarks,
    answers: Object.fromEntries(Object.entries(answers).map(([id, a]) =>
        [id, Array.isArray(a.value) ? { ...a, value: photosForDraft(a.value) } : a])),
    extraParts: extraParts.map((p) => ({ ...p, photos: photosForDraft(p.photos) })),
});

// a photo back from a draft: uploaded already; its preview is fetched again (url null until then)
const photoFromDraft = (p) => ({ key: p.key, imageId: p.imageId, title: p.title ?? "", comment: p.comment ?? "", status: "done", url: null, error: null });

// The form's state back from a draft, or null if it can't be read. A question the draft doesn't know (the form
// changed since) starts empty; an answer whose shape doesn't fit its question's type is dropped.
export const restoreDraft = (payload, template, fresh) => {
    let saved;
    try { saved = JSON.parse(payload); } catch { return null; }
    if (!saved || saved.v !== DRAFT_VERSION || typeof saved.answers !== "object") return null;
    const answers = { ...fresh };
    template.questions.forEach((q) => {
        const a = saved.answers[q.id];
        if (!a) return;
        const empty = emptyValue(q.answerType);
        const fits = Array.isArray(empty) ? Array.isArray(a.value)
            : typeof empty === "object" ? a.value && typeof a.value === "object" && !Array.isArray(a.value)
            : typeof a.value === "string";
        if (!fits) return;
        answers[q.id] = { ...fresh[q.id], ...a, value: Array.isArray(a.value) ? a.value.map(photoFromDraft) : a.value, comment: a.comment ?? "" };
    });
    const extraParts = Array.isArray(saved.extraParts)
        ? saved.extraParts.map((p) => ({ ...newExtraPart(p.key), ...p, photos: (p.photos ?? []).map(photoFromDraft) }))
        : [];
    return { answers, extraParts, remarks: typeof saved.remarks === "string" ? saved.remarks : "", index: Number(saved.index) || 0 };
};

// ---------------------------------------------------------------- searchable lists

// the group of Informations générales whose fields are searchable lists (report_ui.md: « Text, searchable lists »)
export const SEARCHABLE_GROUP = "Client / dossier";

// lower case, no accents: "Jorf" finds "Complexe industriel Jorf Lasfar"
export const searchKey = (text) => (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// a field's list: its suggestions first, then the values already written in earlier reports, each once
export const listOptions = (suggestions, known) => {
    const seen = new Set();
    const out = [];
    (suggestions ?? []).forEach((value) => { if (!seen.has(searchKey(value))) { seen.add(searchKey(value)); out.push({ value, kind: "suggestion" }); } });
    (known ?? []).forEach((value) => { if (!seen.has(searchKey(value))) { seen.add(searchKey(value)); out.push({ value, kind: "known" }); } });
    return out;
};
