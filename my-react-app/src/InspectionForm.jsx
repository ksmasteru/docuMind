// Fillable checklist, styled as a white A4 PHOVA sheet: the web twin of the mobile app's
// components/checklist-sheet.jsx.
//
//   template   ← GET  /api/v1/forms/inspectionForm/{id}   (title, instructions, questions)
//   answers    ← local state, keyed by question id: { [questionId]: { value, comment } }
//   photos     → POST /api/v1/images                      (each photo as soon as it's picked → { imageId })
//   submit     → POST /api/v1/submissions                 (SubmissionRequest → { id, status })
//   pdf        ← GET  /api/v1/submissions/{id}/preview + /pdf   (SentReport, once the sheet is sent)
//
// The server re-checks everything (all questions answered, critical MAUVAIS has a comment,
// valid values) and decides the status. The checks here only help the technician.
//
// Every free-text field can be dictated in French (useVoiceInput.js). The transcript is
// appended, so typing and dictating mix.
//
// An IMAGE question's value is the imageId the server returned for its photo, so the photo
// must be uploaded before the sheet can be sent.
import { shrinkPhoto } from "./photoUtils";
import PhovaLogo from "./PhovaLogo";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { useEffect, useRef, useState } from "react";
import {
  Camera, Check, CheckCheck, ChevronLeft, ChevronRight, Download, ImagePlus, Loader2, Mic, RefreshCw, Send, Share2, Square, X,
} from "lucide-react";
import { useVoiceInput } from "./useVoiceInput";
import { isExpertiseTitle, sameText, sectionsFor, usesCompleteLayout } from "./expertiseForm";
import {
  COMPLETE_META, DIMENSION_DRAWINGS, DIMENSION_KEYS, DIMENSIONS_SECTION, GEOMETRIC_CHECKS,
  GEOMETRIC_SECTION, INFO_SECTION, OUT_OF_TOLERANCE, PART_DECISIONS, PART_RECOMMENDATIONS, PARTS_HINT, PARTS_SECTION,
  SPARE_PARTS, parsePartLines, partLinesOf,
  choicesFor, completeContext, detectChoices, dictatedMeasure, encodeChoices, isDateField, isLongField, isMeasure,
  isMeasureValue, pickedSuggestion, splitLabel, suggestionsFor,
} from "./expertiseComplet";

// Put in front of every dictation context so the transcriber expects the faults a technician reports
// on pumps, hoists and similar equipment. Same text as mobile: Whisper copies the prompt's style and
// only reads its last 224 tokens, so the item-specific part goes after it, closest to the audio.
const MAINTENANCE_VOCABULARY =
  "Bruit anormal. Fuite d'huile. Fuite d'eau. Usure du câble, câble effiloché. Ça vibre beaucoup. " +
  "Le moteur chauffe. Odeur de brûlé. Boulons desserrés. Pièce cassée, fissure. Rouille, corrosion. " +
  "Il y a du jeu. Ça frotte. Bloqué, grippé. Encrassé, bouché. Manque de graisse. Joint abîmé. " +
  "Pression faible. Ne démarre pas. S'arrête tout seul. Crochet déformé. Fil électrique abîmé. " +
  "À remplacer.";

// The same idea for the pump expertise report: short, plain teardown findings, with the part
// names (garniture, chemise, bague d'usure, clavette…) so they come out spelled right.
const EXPERTISE_VOCABULARY =
  "Rien à signaler. La pompe est bonne. Le corps est bon. La roue est usée. Les aubes sont " +
  "cassées. L'arbre est rayé. La clavette est abîmée. Les roulements sont bloqués. Il faut " +
  "changer les roulements. La garniture fuit. Le joint torique est abîmé. La chemise est usée. " +
  "La bague d'usure est usée. Le palier est bon. Il y a de la rouille. Il y a de la corrosion. " +
  "Il y a une fissure. Il y a du produit collé. Il faut changer. Il faut réparer. Il faut nettoyer.";

// Short typed answers on the expertise report: dictation there only produces spelling guesses
// of company and product names, so these fields have no mic.
const NO_MIC_EXPERTISE = new Set(["client", "fluide pompé"]);

// "(dictée vocale)" in a label is an instruction to the technician, not something they say
const spokenLabel = (label) => label.replace(/\s*\(dictée vocale\)\s*/i, "").trim();

// a dictated sentence goes after what's already typed, never over it
const appendText = (current, text) => (current?.trim() ? `${current.trimEnd()} ${text}` : text);

// 7400 → "0:07"
const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// today as "YYYY-MM-DD" in the user's own timezone (toISOString() alone would use UTC)
const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// The wizard's cards: each section with its questions (in position order), then an "Autres points"
// card for any question no section names, then remarks and sending. A section left without
// questions is dropped, unless it holds the sheet's own fields.
const buildSteps = (sections, questions) => {
  const placed = new Set();
  const steps = sections
    .map((section) => {
      const own = questions.filter((q) => section.labels.some((label) => sameText(q.labelFr, label)));
      own.forEach((q) => placed.add(q.id));
      return { title: section.title, meta: !!section.meta, questions: own };
    })
    .filter((step) => step.meta || step.questions.length);
  const others = questions.filter((q) => !placed.has(q.id));
  if (others.length) steps.push({ title: "Autres points", questions: others });
  steps.push({ title: "Remarques et envoi", questions: [], remarks: true });
  return steps;
};

// The full expertise report: one card per "Section : …" of its labels, in sheet order. The
// general information card also holds the sheet's own fields; the measurement cards are laid out
// like the paper report, and the parts are a table of quantities (layout: GeometricChecks /
// DimensionTable / PartsTable).
const stepsFromLabels = (questions) => {
  const steps = [];
  for (const q of questions) {
    const title = splitLabel(q.labelFr).section || "Autres points";
    let step = steps.find((s) => s.title === title);
    if (!step) {
      const layout = { [GEOMETRIC_SECTION]: "geometric", [DIMENSIONS_SECTION]: "dimensions", [PARTS_SECTION]: "parts" }[title] ?? null;
      step = { title, meta: title === INFO_SECTION, layout, questions: [] };
      steps.push(step);
    }
    step.questions.push(q);
  }
  if (!steps.some((s) => s.meta)) steps.unshift({ title: INFO_SECTION, meta: true, questions: [] });
  steps.push({ title: "Remarques et envoi", questions: [], remarks: true });
  return steps;
};

// a photo question's value: the ids of its uploaded photos, "id1,id2" (one id for the other forms)
const photoValue = (photos) =>
  photos
    .filter((p) => p.status === "done")
    .map((p) => p.imageId)
    .join(",");

// A text with tick boxes (the full report's Commentaires / Recommandations): a box newly said in
// the text gets ticked; one unticked by hand stays unticked until it's said again.
const withValue = (answer, value, choices) => {
  if (!choices) return { ...answer, value };
  const before = detectChoices(answer?.value, choices);
  const said = detectChoices(value, choices).filter((c) => !before.includes(c));
  const checked = answer?.checked ?? [];
  return { ...answer, value, checked: [...checked, ...said.filter((c) => !checked.includes(c))] };
};

// Off while the forms are being tried out: the cards can be browsed freely, and only Envoyer
// checks the report. Set back to true to check each card on "Suivant" (leaveCard).
const CHECK_EACH_CARD = false;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50";

// taskId: the task this report is sent for (the task page's Rapport tab), so the server marks it
// submitted; initialEquipment pre-fills the pump; onSubmitted(SubmissionResponse) once it's sent
export default function InspectionForm({ id, taskId = null, initialEquipment = "", onSubmitted }) {
  const { user } = useAuth();

  // the blank form, fetched from the backend
  const [template, setTemplate] = useState(null);

  // what the technician fills in
  const [answers, setAnswers] = useState({});
  const [equipment, setEquipment] = useState(initialEquipment);
  const [inspectionDate, setInspectionDate] = useState(todayLocal);
  const [remarks, setRemarks] = useState("");

  // sending + outcome
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);   // SubmissionResponse { id, status }
  const [errors, setErrors] = useState([]);     // messages shown above the footer

  // the card on screen, for the forms shown section by section (sectionsFor)
  const [step, setStep] = useState(0);

  // one recorder for the whole sheet; dictatingField is the field that last used it,
  // which is where its "recording…" line and errors show
  const voice = useVoiceInput({ language: "fr" });
  const [dictatingField, setDictatingField] = useState(null);
  // the take in progress: where its text goes, and what it's about
  const take = useRef({ deliver: null, context: null });

  // the photos' local previews, released when the sheet goes away
  const previewUrls = useRef([]);
  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const { data } = await apiClient.get("/api/v1/forms/inspectionForm/" + id);
        setTemplate(data);
      } catch (err) {
        console.log("error fetching for template ", err);
      }
    };
    fetchForm();
  }, [id]);

  // replace state, never modify it: copy the old answers, then overwrite one.
  // choices: the question's tick boxes, ticked from what the text says (full report)
  const onAnswer = (questionId, value, choices = null) =>
    setAnswers((prev) => ({ ...prev, [questionId]: withValue(prev[questionId], value, choices) }));

  const onComment = (questionId, comment) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], comment } }));

  const onToggleOut = (questionId) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], out: !prev[questionId]?.out } }));

  // A tapped box rewrites the field: it then holds the ticked boxes, in the report's order.
  // (Dictating still adds to the text, and ticks what it names.)
  const onToggleChoice = (questionId, choice, choices) =>
    setAnswers((prev) => {
      const checked = prev[questionId]?.checked ?? [];
      const next = checked.includes(choice) ? checked.filter((c) => c !== choice) : [...checked, choice];
      const ordered = choices.filter((c) => next.includes(c));
      return { ...prev, [questionId]: { ...prev[questionId], checked: ordered, value: ordered.join(", ") } };
    });

  // A photo question's photos: [{ key, file, url, status, imageId, error }],
  // status 'uploading' | 'done' | 'error'. Each photo is shown at once and uploaded in the
  // background; value only lists the uploaded ones, so the sheet can't be sent with a photo
  // still on its way. replaceKey: the photo this one replaces (Reprendre, Réessayer).
  const setPhotos = (questionId, change) =>
    setAnswers((prev) => {
      const photos = change(prev[questionId]?.photos ?? []);
      return { ...prev, [questionId]: { ...prev[questionId], photos, value: photoValue(photos) } };
    });

  const onPhoto = async (questionId, file, replaceKey = null) => {
    const url = URL.createObjectURL(file);
    previewUrls.current.push(url);
    const key = `${Date.now()}-${Math.random()}`;
    const photo = { key, file, url, status: "uploading", imageId: null, error: null };
    setPhotos(questionId, (photos) =>
      replaceKey ? photos.map((p) => (p.key === replaceKey ? photo : p)) : [...photos, photo]
    );

    let saved = null;
    let error = null;
    try {
      const formData = new FormData();
      formData.append("image", await shrinkPhoto(file));
      if (equipment.trim()) formData.append("equipementId", equipment.trim());
      ({ data: saved } = await apiClient.post("/api/v1/images", formData));
    } catch (err) {
      console.log("photo refused", err);
      error = err.response
        ? err.response.data?.message || `Photo refusée (${err.response.status}), réessayer.`
        : "Envoi de la photo impossible : vérifier la connexion.";
    }

    // a photo replaced or removed while it was uploading is simply not found any more
    setPhotos(questionId, (photos) =>
      photos.map((p) =>
        p.key !== key ? p : saved ? { ...p, status: "done", imageId: saved.imageId } : { ...p, status: "error", error }
      )
    );
  };

  const onRemovePhoto = (questionId, key) => setPhotos(questionId, (photos) => photos.filter((p) => p.key !== key));

  // transcripts land after the recording ends, so these read the latest state, not a copy
  const dictateInto = (questionId, key, choices = null) => (text) =>
    setAnswers((prev) => {
      const answer = prev[questionId];
      const next = appendText(answer?.[key], text);
      return {
        ...prev,
        [questionId]: key === "value" ? withValue(answer, next, choices) : { ...answer, [key]: next },
      };
    });

  // A short field (a name, a reference, a measure) takes the dictation in place of what it held:
  // a measure as a number, a field with suggestions as the suggestion it names when it names one.
  const dictateShort = (questionId, { measure = false, options = null } = {}) => (text) => {
    let value = measure ? dictatedMeasure(text) : text.trim().replace(/[.!?]+$/, "");
    if (options) value = detectChoices(value, options)[0] ?? pickedSuggestion(value, options) ?? value;
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], value } }));
  };

  const dictateRemarks = (text) => setRemarks((prev) => appendText(prev, text));

  // Any mic stops the current take, and the text still goes to the field that started it.
  // Otherwise switching an answer back to Bon mid-recording would hide the only stop button.
  const toggleDictation = async (field, onTranscript, context) => {
    if (voice.status === "transcribing") return;
    if (voice.status === "recording") {
      const { deliver, context: about } = take.current;
      const text = await voice.stopReport(about);
      if (text) deliver?.(text);
      return;
    }
    take.current = { deliver: onTranscript, context };
    setDictatingField(field);
    await voice.start();
  };

  const dictation = {
    field: dictatingField,
    status: voice.status,
    error: voice.error,
    durationMillis: voice.durationMillis,
    toggle: toggleDictation,
  };

  const questions = [...(template?.questions ?? [])].sort((a, b) => a.position - b.position);
  if (!template) return <p>Loading...</p>;

  // The full expertise report (expertiseComplet.js), or its démontage part: its labels name their section, a photo
  // question takes up to 4 photos, Commentaires / Recommandations have the paper report's tick
  // boxes, and only the Bon / Mauvais checks must be answered.
  const isComplete = usesCompleteLayout(template.title);
  const maxPhotos = isComplete ? 4 : 1;
  const isOptional = (q) => isComplete && q.answerType !== "BON_MAUVAIS";
  const choicesOf = (q) => (isComplete ? choicesFor(q.labelFr) : null);
  const isAnswered = (q) => !!answers[q.id]?.value?.trim() || (answers[q.id]?.checked?.length ?? 0) > 0;

  const answeredCount = questions.filter(isAnswered).length;
  const submitted = result !== null;
  const locked = submitted || sending;

  // What each mic is about, sent with the audio so the transcriber expects the item's own
  // words (linguet, moufle, élingue…) instead of guessing. Written as the text that would
  // come just before the technician's sentence, which is how Whisper reads it.
  const isExpertise = isExpertiseTitle(template.title);
  const vocabulary = isExpertise ? EXPERTISE_VOCABULARY : MAINTENANCE_VOCABULARY;
  const subject = isExpertise ? "Rapport d'expertise pompe" : template.title;
  const itemContext = (q, lead) =>
    `${vocabulary} ${subject}. Point ${q.position} : ${spokenLabel(q.labelFr)}. ${lead}`;
  const valueContext = (q) =>
    isExpertise
      ? `${vocabulary} ${subject}. ${spokenLabel(q.labelFr)} :`
      : itemContext(q, "Valeur relevée :");
  // the full report has its own contexts: the part and its tick boxes (completeContext)
  const fieldContext = (q) => (isComplete ? completeContext(q.labelFr, vocabulary) : valueContext(q));
  // the full report has a mic on every text field (its dates use a calendar)
  const hasMic = (q) => isComplete || !(isExpertise && NO_MIC_EXPERTISE.has(spokenLabel(q.labelFr).toLowerCase()));
  // general remarks are most likely about what was found wrong
  const flagged = questions.filter((q) => answers[q.id]?.value === "MAUVAIS");
  const listed = (flagged.length ? flagged : questions).map((q) => spokenLabel(q.labelFr)).join(" ; ");
  const remarksContext = `${vocabulary} ${subject}. ${
    flagged.length ? "Points non conformes" : "Points contrôlés"
  } : ${listed}. Remarques :`;

  const sections = sectionsFor(template.title);
  const steps = isComplete ? stepsFromLabels(questions) : sections ? buildSteps(sections, questions) : null;

  // comfort checks before sending (the server checks again); questionId: what the problem is
  // about, null for the sheet's own fields, so the wizard can open the card that has it
  const findProblems = () => {
    const problems = [];
    const add = (questionId, text) => problems.push({ questionId, text });
    if (!equipment.trim())
      add(null, isComplete ? "Renseigner le repère géographique." : "Renseigner l'emplacement / l'équipement.");
    if (!inspectionDate) add(null, "Renseigner la date du contrôle.");
    else if (inspectionDate > todayLocal()) add(null, "La date du contrôle ne peut pas être dans le futur.");
    for (const q of questions) {
      const a = answers[q.id];
      const photos = a?.photos ?? [];
      // the full report's cards already say the section: the field's name is enough
      const name = isComplete ? splitLabel(q.labelFr).field : `Question ${q.position}`;
      if (photos.some((p) => p.status === "uploading")) add(q.id, `${name} : photo en cours d'envoi.`);
      else if (photos.some((p) => p.status === "error"))
        add(q.id, `${name} : une photo n'a pas été envoyée, réessayer ou la retirer.`);
      else if (!isAnswered(q)) {
        if (!isOptional(q)) add(q.id, `${name} : pas de réponse.`);
      } else if (q.critical && a.value === "MAUVAIS" && !a.comment?.trim())
        add(q.id, `${name} : commentaire obligatoire (point critique non conforme).`);
      else if (isComplete && isMeasure(q.labelFr) && !isMeasureValue(a.value))
        add(q.id, `${name} : « ${a.value.trim()} » n'est pas une mesure (ex. 0,08 ou +0,14 mm, ou N/A).`);
    }
    return problems;
  };

  // Section by section, a card is checked as the technician leaves it for the next one: what it
  // still needs is listed on it, and the next card waits until that's fixed. Sending checks them all.
  const leaveCard = (card) => {
    if (!CHECK_EACH_CARD) return true;
    const problems = findProblems().filter((p) =>
      p.questionId === null ? card.meta : card.questions.some((q) => q.id === p.questionId)
    );
    setErrors(problems.map((p) => p.text));
    return problems.length === 0;
  };

  const onSubmit = async () => {
    const problems = findProblems();
    if (problems.length) {
      setErrors(problems.map((p) => p.text));
      // section by section: open the first card that has something to fix
      if (steps) {
        const first = problems[0];
        const at = steps.findIndex((s) =>
          first.questionId === null ? s.meta : s.questions.some((q) => q.id === first.questionId)
        );
        if (at >= 0) setStep(at);
      }
      return;
    }
    setErrors([]);
    setSending(true);
    try {
      // the state is an object keyed by id; the backend expects a list
      const body = {
        templateId: template.id,
        ...(taskId ? { taskId } : {}),
        equipment: equipment.trim(),
        inspectionDate,          // "YYYY-MM-DD" → LocalDate on the server
        remarks,
        // a question with tick boxes sends them as its comment, "☒ Bon état" / "☐ Corrosion";
        // a measure marked out of tolerance, "Hors tolérance"
        answers: questions.map((q) => {
          const choices = choicesOf(q);
          const a = answers[q.id];
          let comment = a?.comment || null;
          if (choices) comment = encodeChoices(choices, a?.checked ?? []);
          else if (isComplete && isMeasure(q.labelFr)) comment = a?.out ? OUT_OF_TOLERANCE : null;
          return { itemId: q.id, value: a?.value ?? "", comment };
        }),
      };
      const { data } = await apiClient.post("/api/v1/submissions", body);
      setResult(data);
      onSubmitted?.(data);
    } catch (err) {
      // ErrorFormat: { message, errors: { field: message } }
      const data = err.response?.data;
      const fieldErrors = data?.errors ? Object.values(data.errors) : [];
      setErrors(fieldErrors.length ? fieldErrors : [data?.message || "Envoi impossible, réessayer."]);
    } finally {
      setSending(false);
    }
  };

  // the same pieces fill the one-page sheet and the wizard's cards
  const metaFields = (
    <MetaFields
      equipment={equipment}
      onEquipment={setEquipment}
      inspectionDate={inspectionDate}
      onInspectionDate={setInspectionDate}
      inspector={user?.email}
      locked={locked}
      {...(isComplete ? COMPLETE_META : {})}
    />
  );

  const questionRow = (q) => {
    const choices = choicesOf(q);
    // how this form shows the question: the full report's cards already name the section
    const view = {
      label: isComplete ? splitLabel(q.labelFr).field : q.labelFr,
      choices,
      multiline: isComplete && isLongField(q.labelFr),
      placeholder: isComplete && splitLabel(q.labelFr).field === "Liste des pièces" ? PARTS_HINT : "Saisir une valeur…",
      maxPhotos,
      suggestions: isComplete ? suggestionsFor(q.labelFr) : null,
      date: isComplete && isDateField(q.labelFr),
    };
    return (
      <QuestionRow
        key={q.id}
        question={q}
        view={view}
        answer={answers[q.id]}
        locked={locked}
        onAnswer={onAnswer}
        onComment={onComment}
        onToggleChoice={onToggleChoice}
        onPhoto={onPhoto}
        onRemovePhoto={onRemovePhoto}
        dictation={dictation}
        onDictateComment={dictateInto(q.id, "comment")}
        onDictateValue={
          isComplete && !isLongField(q.labelFr)
            ? dictateShort(q.id, { measure: isMeasure(q.labelFr), options: view.suggestions })
            : dictateInto(q.id, "value", choices)
        }
        commentContext={itemContext(q, "Anomalie constatée :")}
        valueContext={fieldContext(q)}
        valueMic={hasMic(q)}
      />
    );
  };

  const remarksField = (
    <RemarksField
      value={remarks}
      onChange={setRemarks}
      dictation={dictation}
      onTranscript={dictateRemarks}
      context={remarksContext}
      locked={locked}
    />
  );

  if (steps)
    return (
      <div className="py-8">
        <SectionWizard
          template={template}
          steps={steps}
          step={step}
          onStep={setStep}
          isAnswered={isAnswered}
          isOptional={isOptional}
          equipmentDone={!!equipment.trim() && !!inspectionDate}
          locked={locked}
          dictating={voice.status !== "idle"}
          metaFields={metaFields}
          questionRow={questionRow}
          onLeave={leaveCard}
          layoutCard={(card) => {
            const props = {
              questions: card.questions,
              answers,
              locked,
              onAnswer,
              onToggleOut,
              questionRow,
              dictation,
              contextOf: fieldContext,
              dictateOf: (q) => dictateShort(q.id, { measure: true }),
            };
            if (card.layout === "parts") return <PartsTable {...props} />;
            return card.layout === "dimensions" ? <DimensionTable {...props} /> : <GeometricChecks {...props} />;
          }}
          remarksField={remarksField}
          errors={errors}
          sending={sending}
          submitted={submitted}
          onSubmit={onSubmit}
        />

        {submitted && <SentReport submissionId={result.id} status={result.status} />}
      </div>
    );

  return (
    // A4 sheet: at least 210 × 297 proportions, always white (paper).
    // No overflow-hidden: with aspect-ratio it would freeze the height and clip
    // whatever doesn't fit (the footer and its Envoyer button). Without it, the sheet grows.
    <div className="py-8">
      <div
        className="mx-auto w-full max-w-[1000px] bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200"
        style={{ aspectRatio: "210 / 297" }}
      >
        <FormHeader template={template}>{metaFields}</FormHeader>

        <ProgressBar answered={answeredCount} total={questions.length} />

        {/* once sent, the sheet is read-only */}
        <fieldset disabled={locked}>
          <ol className="divide-y divide-slate-100">{questions.map(questionRow)}</ol>
          {remarksField}
        </fieldset>

        {errors.length > 0 && <ErrorList errors={errors} />}

        <FormFooter
          status={result?.status}
          inspector={user?.email}
          sending={sending}
          submitted={submitted}
          dictating={voice.status !== "idle"}
          onSubmit={onSubmit}
        />
      </div>

      {submitted && <SentReport submissionId={result.id} status={result.status} />}
    </div>
  );
}

// ─── Section by section: one card at a time ────────────────────────────────
// The report's band and title, a strip of numbered steps (a ✓ once a card is filled in, click
// to jump), then the current card with Précédent / Suivant, and Envoyer on the last one.
// While a dictation is recording or transcribing the steps stay put: its text goes back to the
// field that started it, which must still be on screen to show it.
function SectionWizard({
  template,
  steps,
  step,
  onStep,
  isAnswered,
  isOptional,
  equipmentDone,
  locked,
  dictating,
  metaFields,
  questionRow,
  onLeave,
  layoutCard,
  remarksField,
  errors,
  sending,
  submitted,
  onSubmit,
}) {
  const current = steps[step];
  const last = step === steps.length - 1;
  const card = useRef(null);
  const moved = useRef(false);

  // a new card starts at its top; not on the first render, the page has just opened
  useEffect(() => {
    if (moved.current) card.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    moved.current = true;
  }, [step]);

  // filled in: everything that must be answered is, and the card isn't left empty
  const done = (s) =>
    s.remarks
      ? submitted
      : (!s.meta || equipmentDone) &&
        s.questions.every((q) => isOptional(q) || isAnswered(q)) &&
        (s.meta || s.questions.some(isAnswered));

  // moving on (Suivant, or a later step) checks the card being left; going back never does
  const go = (to) => {
    if (dictating || to < 0 || to >= steps.length) return;
    if (to > step && !onLeave(current)) return;
    onStep(to);
  };

  const navClass =
    "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between bg-[#0F2A49] px-6 py-4">
          <PhovaLogo className="h-7 rounded-md bg-white px-2 py-1" />
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#5BC6E8] px-3 py-1 text-xs font-semibold tracking-wide text-[#0F2A49]">
              {template.type}
            </span>
            <span className="text-xs text-slate-300">v{template.version}</span>
          </div>
        </div>
        <div className="h-1 bg-[#5BC6E8]" />
        <div className="px-6 py-4 text-center">
          <h2 className="text-lg font-bold uppercase tracking-wide text-[#1A75BC]">{template.title}</h2>
          {template.instructions && <p className="mx-auto mt-1 max-w-2xl text-sm text-slate-500">{template.instructions}</p>}
        </div>
      </div>

      {/* one scrolling row on a phone, wrapped on wider screens */}
      <nav aria-label="Sections du rapport" className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {steps.map((s, i) => {
          const here = i === step;
          const filled = done(s);
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => go(i)}
              disabled={dictating}
              aria-current={here ? "step" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
                here
                  ? "border-[#1A75BC] bg-[#1A75BC] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  here
                    ? "bg-white text-[#1A75BC]"
                    : filled
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {filled && !here ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.title}
            </button>
          );
        })}
      </nav>

      <section
        ref={card}
        className="mt-3 scroll-mt-4 overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl ring-1 ring-slate-200"
      >
        <header className="border-b border-slate-200 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Étape {step + 1} / {steps.length}
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-[#0F2A49]">{current.title}</h3>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-[#1A75BC] transition-all"
              style={{ width: `${Math.round(((step + 1) / steps.length) * 100)}%` }}
            />
          </div>
        </header>

        {/* once sent, the report is read-only */}
        <fieldset disabled={locked}>
          {current.meta && <div className="pb-1 [&>dl]:mt-5">{metaFields}</div>}
          {current.layout
            ? layoutCard(current)
            : current.questions.length > 0 && (
                <ol className={`divide-y divide-slate-100 ${current.meta ? "mt-2 border-t border-slate-100" : ""}`}>
                  {current.questions.map(questionRow)}
                </ol>
              )}
          {current.remarks && remarksField}
        </fieldset>

        {errors.length > 0 && (
          <div className="pt-4">
            {/* before the last card, these are what keeps the technician from going on */}
            <ErrorList errors={errors} title={last ? undefined : "À corriger avant de continuer :"} />
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0 || dictating}
            className={`${navClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}
          >
            <ChevronLeft className="h-4 w-4" /> Précédent
          </button>

          {dictating && <span className="hidden text-xs text-slate-500 sm:inline">Dictée en cours…</span>}

          {last ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={sending || submitted || dictating}
              className={`${navClass} bg-[#0F2A49] text-white hover:bg-[#1A75BC]`}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitted ? "Envoyé" : sending ? "Envoi…" : "Envoyer"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(step + 1)}
              disabled={dictating}
              className={`${navClass} bg-[#0F2A49] text-white hover:bg-[#1A75BC]`}
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

// ─── The full report's measurement cards ───────────────────────────────────
// A measurement question of the card, by its field ("J5 au démontage"); the card's questions
// no layout slot takes are listed under it as ordinary rows, so none is ever hidden.
const byField = (questions, field) => questions.find((q) => splitLabel(q.labelFr).field === field);

function Leftovers({ questions, used, questionRow }) {
  const rest = questions.filter((q) => !used.includes(q));
  if (!rest.length) return null;
  return <ol className="divide-y divide-slate-100 border-t border-slate-100">{rest.map(questionRow)}</ol>;
}

// A measured value and, under it, its mic and the technician's mark for a value out of
// tolerance: the cell turns red, as it will in the PDF. The mic replaces the value.
function MeasureInput({ question, answer, locked, onAnswer, onToggleOut, measureMic, label, className = "" }) {
  if (!question) return <span className="text-xs text-slate-300">—</span>;
  const out = !!answer?.out;
  const { dictation, context, onTranscript } = measureMic;
  const field = `value:${question.id}`;
  const mine = dictation.field === field;
  const recording = mine && dictation.status === "recording";
  const transcribing = mine && dictation.status === "transcribing";
  return (
    <div className={className}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        title={label}
        value={answer?.value ?? ""}
        onChange={(e) => onAnswer(question.id, e.target.value)}
        disabled={locked}
        placeholder="—"
        className={`w-full min-w-0 rounded-lg border px-2 py-1.5 text-center text-sm outline-none focus:ring-2 disabled:opacity-80 ${
          out
            ? "border-red-500 bg-red-500 font-semibold text-white placeholder:text-red-100 focus:ring-red-300"
            : "border-slate-200 bg-white text-slate-900 focus:border-[#1A75BC] focus:ring-[#1A75BC]/20 disabled:bg-slate-50"
        }`}
      />
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          onClick={() => dictation.toggle(field, onTranscript, context)}
          disabled={locked || dictation.status === "transcribing"}
          aria-label={recording ? `Arrêter la dictée : ${label}` : `Dicter : ${label}`}
          title={recording ? "Arrêter la dictée" : "Dicter la valeur"}
          className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
            recording ? "border-red-300 bg-red-50 text-red-600" : "border-slate-200 text-slate-500 hover:border-[#1A75BC] hover:text-[#1A75BC]"
          }`}
        >
          {transcribing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : recording ? (
            <Square className="h-2.5 w-2.5 fill-current" />
          ) : (
            <Mic className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onToggleOut(question.id)}
          disabled={locked}
          aria-pressed={out}
          title={out ? "Valeur hors tolérance : toucher pour annuler" : "Marquer la valeur hors tolérance"}
          className={`min-w-0 flex-1 rounded-md border px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed ${
            out ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-600"
          }`}
        >
          {out ? "Hors tol. ✓" : "Hors tol."}
        </button>
      </div>
      {mine && dictation.error && <p className="mt-1 text-[11px] text-red-700">{dictation.error}</p>}
    </div>
  );
}

// "Contrôles géométriques": each check under its drawing, its values at dismantling and at
// reassembly side by side, as on the paper report
function GeometricChecks({ questions, answers, locked, onAnswer, onToggleOut, questionRow, dictation, contextOf, dictateOf }) {
  const used = [];
  const take = (field) => {
    const q = byField(questions, field);
    if (q) used.push(q);
    return q;
  };
  const checks = GEOMETRIC_CHECKS.map((c) => ({
    ...c,
    dismantled: take(`${c.name} au démontage`),
    mounted: take(`${c.name} au remontage`),
  }));
  const micFor = (q) => q && { dictation, context: contextOf(q), onTranscript: dictateOf(q) };
  return (
    <>
      <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6">
        {checks.map((c) => (
          <div key={c.name} className="rounded-xl border border-slate-200 p-3">
            <img src={c.drawing} alt={c.name} className="mx-auto h-36 w-full object-contain" />
            <p className="mt-2 text-sm font-medium text-slate-900">{c.name}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ["Au démontage", c.dismantled],
                ["Au remontage", c.mounted],
              ].map(([when, q]) => (
                <label key={when} className="text-xs text-slate-500">
                  {when}
                  <MeasureInput question={q} answer={q && answers[q.id]} locked={locked} onAnswer={onAnswer}
                    onToggleOut={onToggleOut} measureMic={micFor(q)} label={`${c.name} ${when.toLowerCase()}`} className="mt-1" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Leftovers questions={questions} used={used} questionRow={questionRow} />
    </>
  );
}

// where J5–J8 sit under the shaft drawing (% of its width): each pair of clearances is read at
// the two faces of a bearing, as on the paper report
const BEARING_LABELS = [
  ["J5", 36.7],
  ["J6", 41.5],
  ["J7", 69.8],
  ["J8", 75.2],
];

// the column groups of the paper report's table
const DIMENSION_GROUP = { J5: "Jeux palier/arbre", C1: "Concentricités" };

// "Contrôles dimensionnels arbre/palier": the shaft and pump drawings, then the values at
// dismantling and at reassembly for J, X, J5–J8, C1–C5. On a computer one table, as on the paper
// report; on a phone, too narrow for 11 columns, one line per measure.
function DimensionTable({ questions, answers, locked, onAnswer, onToggleOut, questionRow, dictation, contextOf, dictateOf }) {
  const used = [];
  const cell = (key, when) => {
    const q = byField(questions, `${key} au ${when}`);
    if (q) used.push(q);
    return q;
  };
  const measures = DIMENSION_KEYS.map((key) => ({ key, dismantled: cell(key, "démontage"), mounted: cell(key, "montage") }));
  const rows = [
    ["dismantled", "Valeurs de démontage"],
    ["mounted", "Valeurs de montage"],
  ];
  const input = (q, label) => (
    <MeasureInput
      question={q}
      answer={q && answers[q.id]}
      locked={locked}
      onAnswer={onAnswer}
      onToggleOut={onToggleOut}
      measureMic={q && { dictation, context: contextOf(q), onTranscript: dictateOf(q) }}
      label={label}
    />
  );

  return (
    <>
      <div className="px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <img src={DIMENSION_DRAWINGS.pump} alt="Coupe de la pompe : jeux J et X" className="mx-auto h-40 w-auto object-contain sm:mx-0" />
          <div className="min-w-0 flex-1">
            <img src={DIMENSION_DRAWINGS.shaft} alt="Arbre et paliers : points de mesure C1 à C5" className="w-full object-contain" />
            <div className="relative h-5 text-xs font-semibold text-slate-700">
              {BEARING_LABELS.map(([key, at]) => (
                <span key={key} className="absolute -translate-x-1/2" style={{ left: `${at}%` }}>
                  {key}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* phone: one line per measure */}
        <div className="mt-5 sm:hidden">
          <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span />
            <span className="text-center">Démontage</span>
            <span className="text-center">Montage</span>
          </div>
          {measures.map((m) => (
            <div key={m.key}>
              {DIMENSION_GROUP[m.key] && (
                <p className="mt-3 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-700">{DIMENSION_GROUP[m.key]}</p>
              )}
              <div className="mt-2 grid grid-cols-[2.5rem_1fr_1fr] items-start gap-2">
                <span className="pt-2 text-sm font-semibold text-slate-800">{m.key}</span>
                {input(m.dismantled, `${m.key} — valeurs de démontage`)}
                {input(m.mounted, `${m.key} — valeurs de montage`)}
              </div>
            </div>
          ))}
        </div>

        {/* computer: the paper report's table */}
        <div className="mt-5 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-slate-600">
                <th colSpan={3} />
                <th colSpan={4} className="border border-slate-200 bg-slate-50 py-1.5 font-semibold">Jeux palier/arbre</th>
                <th colSpan={5} className="border border-slate-200 bg-slate-50 py-1.5 font-semibold">Concentricités</th>
              </tr>
              <tr className="text-xs text-slate-600">
                <th />
                {DIMENSION_KEYS.map((k) => (
                  <th key={k} className="border border-slate-200 bg-slate-50 py-1.5 font-semibold">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([which, label]) => (
                <tr key={which}>
                  <th className="whitespace-nowrap border border-slate-200 bg-slate-50 px-2 text-left text-xs font-semibold text-slate-700">
                    {label}
                  </th>
                  {measures.map((m) => (
                    <td key={m.key} className="border border-slate-200 p-1 align-top">
                      {input(m[which], `${m.key} — ${label.toLowerCase()}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Leftovers questions={questions} used={used} questionRow={questionRow} />
    </>
  );
}

// ─── The full report's parts ───────────────────────────────────────────────
// "Pièces": every part a teardown usually replaces, with its quantity (− / +), and any other part
// the technician adds. A part with a quantity opens the paper report's other columns: code,
// recommandation, décision client (OCP from its stock, or PHOVA), remarque. Stored as the paper
// report's table, one line per part (parsePartLines / partLinesOf).
function PartsTable({ questions, answers, locked, onAnswer, questionRow, dictation }) {
  const question = byField(questions, "Liste des pièces");
  const [newPart, setNewPart] = useState("");
  if (!question) return <Leftovers questions={questions} used={[]} questionRow={questionRow} />;

  const parts = parsePartLines(answers[question.id]?.value);
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const find = (name) => parts.find((p) => same(p.name, name));
  // the suggested parts in their order, then the ones added by hand
  const rows = [
    ...SPARE_PARTS.map((name) => find(name) ?? { name, quantity: "" }),
    ...parts.filter((p) => !SPARE_PARTS.some((name) => same(name, p.name))),
  ];
  const save = (next) => onAnswer(question.id, partLinesOf(next));
  const change = (name, patch) => {
    const known = rows.find((r) => same(r.name, name));
    save(rows.map((r) => (r === known ? { ...r, ...patch } : r)));
  };
  const quantity = (row) => Number(row.quantity) || 0;
  const add = () => {
    const name = newPart.trim().replace(/[.!?]+$/, "");
    if (!name) return;
    const known = rows.find((r) => same(r.name, name));
    if (known) change(known.name, { quantity: String(Math.max(1, quantity(known))) });
    else save([...rows, { name, quantity: "1" }]);
    setNewPart("");
  };
  const chosen = rows.filter((r) => quantity(r) > 0).length;
  const mic = (key, onTranscript, context) => ({
    field: `parts:${question.id}:${key}`,
    dictation,
    onTranscript,
    context,
    locked,
  });
  const selectClass =
    "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50";

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-slate-600">Indiquez la quantité de chaque pièce à changer ; ajoutez celles qui manquent.</p>
        <span className="shrink-0 text-xs font-medium text-slate-500">
          {chosen} pièce{chosen > 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[1fr_auto] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Pièce</span>
          <span className="w-28 text-center">Quantité</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const n = quantity(row);
            return (
              <li key={row.name} className={n > 0 ? "bg-[#1A75BC]/5" : ""}>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2">
                  <span className={`text-sm ${n > 0 ? "font-semibold text-[#0F2A49]" : "text-slate-700"}`}>{row.name}</span>
                  <div className="flex w-28 items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => change(row.name, { quantity: String(Math.max(0, n - 1)) })}
                      disabled={locked || n === 0}
                      aria-label={`Retirer une unité : ${row.name}`}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-lg leading-none text-slate-600 hover:border-slate-400 disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={n > 0 ? String(n) : ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        // a part added by hand would vanish with its quantity: "−" to 0 removes it
                        if (!digits && !SPARE_PARTS.some((name) => same(name, row.name))) return;
                        change(row.name, { quantity: digits });
                      }}
                      disabled={locked}
                      placeholder="0"
                      aria-label={`Quantité : ${row.name}`}
                      className="h-8 w-9 rounded-lg border border-slate-200 text-center text-sm text-slate-900 outline-none focus:border-[#1A75BC] disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => change(row.name, { quantity: String(n + 1) })}
                      disabled={locked}
                      aria-label={`Ajouter une unité : ${row.name}`}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-lg leading-none text-slate-600 hover:border-[#1A75BC] hover:text-[#1A75BC] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                {n > 0 && (
                  <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      Code
                      <DictationInput
                        {...mic(`${row.name}:code`, (text) => change(row.name, { code: text.trim().replace(/[.!?]+$/, "") }),
                          `Rapport d'expertise pompe. Pièces. ${row.name}. Code de la pièce :`)}
                        value={row.code ?? ""}
                        onChange={(e) => change(row.name, { code: e.target.value })}
                        placeholder="ex. 6313"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Recommandation
                      <select value={row.recommendation ?? ""} onChange={(e) => change(row.name, { recommendation: e.target.value })}
                        disabled={locked} className={`mt-1 ${selectClass}`}>
                        <option value="">—</option>
                        {PART_RECOMMENDATIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">
                      Décision client
                      <select value={row.decision ?? ""} onChange={(e) => change(row.name, { decision: e.target.value })}
                        disabled={locked} className={`mt-1 ${selectClass}`}>
                        <option value="">—</option>
                        {[...PART_DECISIONS, ...(row.decision && !PART_DECISIONS.includes(row.decision) ? [row.decision] : [])].map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">
                      Remarque
                      <DictationInput
                        {...mic(`${row.name}:remark`, (text) => change(row.name, { remark: appendText(row.remark, text) }),
                          `Rapport d'expertise pompe. Pièces. ${row.name}. Remarque :`)}
                        value={row.remark ?? ""}
                        onChange={(e) => change(row.name, { remark: e.target.value })}
                        placeholder="ex. Non conforme (ogive)"
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* a part the list doesn't have */}
      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-slate-600">Autre pièce</p>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <DictationInput
              {...mic("new", (text) => setNewPart(text.trim().replace(/[.!?]+$/, "")),
                `Rapport d'expertise pompe. Pièces à changer : ${SPARE_PARTS.join(". ")}. Autre pièce :`)}
              value={newPart}
              onChange={(e) => setNewPart(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Nom de la pièce, ex. Écrou de roue"
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={locked || !newPart.trim()}
            className="h-10 shrink-0 rounded-xl bg-[#0F2A49] px-4 text-sm font-medium text-white hover:bg-[#1A75BC] disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </div>

      <Leftovers questions={questions} used={[question]} questionRow={questionRow} />
    </div>
  );
}

// ─── Header: logo band, title, instructions, metadata (children: MetaFields) ─
function FormHeader({ template, children }) {
  return (
    <header>
      <div className="flex items-center justify-between bg-[#0F2A49] px-6 py-4">
        <PhovaLogo className="h-7 rounded-md bg-white px-2 py-1" />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#5BC6E8] px-3 py-1 text-xs font-semibold tracking-wide text-[#0F2A49]">
            {template.type}
          </span>
          <span className="text-xs text-slate-300">v{template.version}</span>
        </div>
      </div>
      <div className="h-1 bg-[#5BC6E8]" />

      <div className="px-6 pt-5">
        <h2 className="text-center text-xl font-bold uppercase tracking-wide text-[#1A75BC]">
          {template.title}
        </h2>
        {template.instructions && (
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-500">
            {template.instructions}
          </p>
        )}
      </div>

      {children}
    </header>
  );
}

// the sheet's own fields: where, when, who (the full report calls them repère / date d'expertise)
function MetaFields({
  equipment,
  onEquipment,
  inspectionDate,
  onInspectionDate,
  inspector,
  locked,
  equipmentLabel = "Emplacement",
  dateLabel = "Date du contrôle",
  placeholder = "ex. MP1",
}) {
  return (
    <dl className="mx-6 mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-sm sm:grid-cols-3">
      <div className="bg-slate-50 px-3 py-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {equipmentLabel} <span className="text-red-600">*</span>
        </dt>
        <dd className="mt-0.5">
          <input
            type="text"
            value={equipment}
            onChange={(e) => onEquipment(e.target.value)}
            disabled={locked}
            placeholder={placeholder}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50"
          />
        </dd>
      </div>
      <div className="bg-slate-50 px-3 py-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {dateLabel} <span className="text-red-600">*</span>
        </dt>
        <dd className="mt-0.5">
          <input
            type="date"
            value={inspectionDate}
            max={todayLocal()}
            onChange={(e) => onInspectionDate(e.target.value)}
            disabled={locked}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50"
          />
        </dd>
      </div>
      <MetaCell label="Vérificateur" value={inspector} />
    </dl>
  );
}

function MetaCell({ label, value }) {
  return (
    <div className="bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1.5 truncate font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}

function ProgressBar({ answered, total }) {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="px-6 pb-2 pt-5">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>Points de contrôle</span>
        <span>
          {answered} / {total} renseignés
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-[#1A75BC] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── One question row ──────────────────────────────────────────────────────
// view: how this form shows it (QuestionRow's caller): label, tick boxes, paragraph or line,
// placeholder, how many photos
function QuestionRow({
  question,
  view,
  answer,
  locked,
  onAnswer,
  onComment,
  onToggleChoice,
  onPhoto,
  onRemovePhoto,
  dictation,
  onDictateComment,
  onDictateValue,
  commentContext,
  valueContext,
  valueMic,
}) {
  const isBad = answer?.value === "MAUVAIS";
  const commentRequired = isBad && question.critical;
  // Bon / Mauvais fits beside the label; a text with its mic or a photo needs the row's width
  const wide = question.answerType === "TEXT" || question.answerType === "IMAGE";

  const control = (
    <AnswerControl
      question={question}
      view={view}
      answer={answer}
      locked={locked}
      onAnswer={onAnswer}
      onToggleChoice={onToggleChoice}
      onPhoto={onPhoto}
      onRemovePhoto={onRemovePhoto}
      dictation={dictation}
      onDictate={onDictateValue}
      dictationContext={valueContext}
      mic={valueMic}
    />
  );

  return (
    <li className={`px-6 py-4 ${isBad ? "bg-red-50/60" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F2A49] text-xs font-semibold text-white">
            {question.position}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {view.label}
              {question.critical && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">
                  ⚠ Critique
                </span>
              )}
            </p>
            {question.labelAr && (
              <p dir="rtl" lang="ar" className="mt-0.5 text-sm text-slate-500">
                {question.labelAr}
              </p>
            )}
          </div>
        </div>

        {!wide && control}
      </div>

      {wide && <div className="mt-3 sm:ml-10">{control}</div>}

      {isBad && (
        <div className="mt-3 sm:ml-10">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Commentaire {commentRequired ? <span className="text-red-600">(obligatoire)</span> : "(optionnel)"}
          </label>
          <DictationInput
            field={`comment:${question.id}`}
            dictation={dictation}
            onTranscript={onDictateComment}
            context={commentContext}
            locked={locked}
            multiline
            rows={2}
            value={answer?.comment ?? ""}
            onChange={(e) => onComment(question.id, e.target.value)}
            placeholder="Décrire l'anomalie constatée…"
          />
          {commentRequired && (
            <p className="mt-1 text-xs text-red-700">
              Point critique non conforme : ne pas commencer les travaux, prévenir le responsable.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// Picks the input to draw from the question's answerType
function AnswerControl({
  question,
  view,
  answer,
  locked,
  onAnswer,
  onToggleChoice,
  onPhoto,
  onRemovePhoto,
  dictation,
  onDictate,
  dictationContext,
  mic,
}) {
  switch (question.answerType) {
    case "BON_MAUVAIS":
      return (
        <div className="flex shrink-0 gap-2">
          <ChoiceButton
            label="Bon"
            selected={answer?.value === "BON"}
            tone="good"
            onClick={() => onAnswer(question.id, "BON")}
          />
          <ChoiceButton
            label="Mauvais"
            selected={answer?.value === "MAUVAIS"}
            tone="bad"
            onClick={() => onAnswer(question.id, "MAUVAIS")}
          />
        </div>
      );
    case "TEXT":
      if (view.date)
        return <DateAnswer value={answer?.value ?? ""} locked={locked} onChange={(v) => onAnswer(question.id, v)} />;
      return (
        <>
          <DictationInput
            field={`value:${question.id}`}
            dictation={dictation}
            onTranscript={onDictate}
            context={dictationContext}
            mic={mic}
            locked={locked}
            multiline={view.multiline}
            rows={view.multiline ? 3 : undefined}
            value={answer?.value ?? ""}
            onChange={(e) => onAnswer(question.id, e.target.value, view.choices)}
            placeholder={view.multiline && view.choices ? "Dicter ou écrire ce qui a été constaté…" : view.placeholder}
          />
          {view.choices && (
            <ChoiceChips
              choices={view.choices}
              checked={answer?.checked ?? []}
              locked={locked}
              onToggle={(choice) => onToggleChoice(question.id, choice, view.choices)}
            />
          )}
          {view.suggestions && (
            // one value: ticking replaces the field's text, unticking empties it
            <ChoiceChips
              hint="Suggestions : cochez une valeur pour remplir le champ, ou écrivez / dictez la vôtre."
              choices={view.suggestions}
              checked={[pickedSuggestion(answer?.value, view.suggestions)].filter(Boolean)}
              locked={locked}
              onToggle={(option) =>
                onAnswer(question.id, pickedSuggestion(answer?.value, [option]) ? "" : option)
              }
            />
          )}
        </>
      );
    case "IMAGE":
      return (
        <PhotoAnswer
          answer={answer}
          locked={locked}
          max={view.maxPhotos}
          onPicked={(file, replaceKey) => onPhoto(question.id, file, replaceKey)}
          onRemove={(key) => onRemovePhoto(question.id, key)}
        />
      );
    default:
      return <span className="text-xs text-slate-400">Type de réponse inconnu</span>;
  }
}

function ChoiceButton({ label, selected, tone, onClick }) {
  const selectedStyle =
    tone === "good"
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-red-600 bg-red-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-w-24 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
        selected ? selectedStyle : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

// Photo from the camera or a file. On a phone `capture` opens the camera straight away;
// a desktop browser ignores it, so both buttons open the file picker there.
// Listing the types (rather than image/*) makes iOS hand over a JPEG instead of a HEIC.
const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

// max 1 (the checklists): one photo, "Reprendre" replaces it. More (the full expertise report):
// photos are added up to max, each can be removed.
function PhotoAnswer({ answer, locked, max, onPicked, onRemove }) {
  const photos = answer?.photos ?? [];
  const single = max === 1;
  const room = max - photos.length;
  const busy = single && photos.some((p) => p.status === "uploading");

  const pick = (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // picking the same file again must still fire onChange
    if (single) {
      if (files[0]) onPicked(files[0], photos[0]?.key ?? null);
      return;
    }
    files.slice(0, room).forEach((file) => onPicked(file));
  };

  return (
    <div>
      {photos.length > 0 && (
        <div className={single ? "w-full max-w-sm" : "grid max-w-xl grid-cols-2 gap-2"}>
          {photos.map((photo) => (
            <PhotoTile
              key={photo.key}
              photo={photo}
              locked={locked}
              removable={!single}
              onRetry={() => onPicked(photo.file, photo.key)}
              onRemove={() => onRemove(photo.key)}
            />
          ))}
        </div>
      )}
      {!single && (
        <p className="mt-1 text-xs text-slate-500">
          {photos.length} / {max} photos
        </p>
      )}

      {(single || room > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <PhotoButton
            icon={Camera}
            label={single && photos.length ? "Reprendre" : "Prendre une photo"}
            capture
            disabled={locked || busy}
            onChange={pick}
          />
          <PhotoButton
            icon={ImagePlus}
            label={single ? "Choisir un fichier" : "Ajouter des fichiers"}
            multiple={!single}
            disabled={locked || busy}
            onChange={pick}
          />
        </div>
      )}
    </div>
  );
}

// one photo: the picture, its upload state, and for several photos a button to take it out
function PhotoTile({ photo, locked, removable, onRetry, onRemove }) {
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-slate-200">
        <img src={photo.url} alt="Photo du point de contrôle" className="aspect-[4/3] w-full object-cover" />
        {photo.status === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
        {removable && !locked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Retirer la photo"
            title="Retirer la photo"
            className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {photo.status === "uploading" && <p className="mt-1 text-xs text-slate-500">Envoi de la photo…</p>}
      {photo.status === "done" && <p className="mt-1 text-xs text-emerald-700">✓ Photo enregistrée</p>}
      {photo.status === "error" && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-red-700">{photo.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

// A date of the full report (réception, montage): a calendar, kept as the paper report writes
// it, "22/02/2024"
function DateAnswer({ value, locked, onChange }) {
  const iso = /^(\d{2})\/(\d{2})\/(\d{4})$/.test(value) ? value.split("/").reverse().join("-") : "";
  return (
    <input
      type="date"
      value={iso}
      onChange={(e) => onChange(e.target.value ? e.target.value.split("-").reverse().join("/") : "")}
      disabled={locked}
      className={`${inputClass} sm:w-56`}
    />
  );
}

// The paper report's tick boxes under a Commentaires / Recommandations: ticked from what is
// dictated or typed, a tap corrects them. They go into the PDF as they are here.
function ChoiceChips({
  choices,
  checked,
  locked,
  onToggle,
  hint = "Cases du rapport : elles se cochent d'après la dictée ; une case touchée réécrit le texte.",
}) {
  return (
    <div className="mt-2">
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const on = checked.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              onClick={() => onToggle(choice)}
              disabled={locked}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed ${
                on
                  ? "border-[#1A75BC] bg-[#1A75BC]/10 text-[#0F2A49]"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
              }`}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                  on ? "border-[#1A75BC] bg-[#1A75BC] text-white" : "border-slate-300"
                }`}
              >
                {on && <Check className="h-3 w-3" />}
              </span>
              {choice}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// a file input dressed as a button: the label opens it
function PhotoButton({ icon: Icon, label, capture = false, multiple = false, disabled, onChange }) {
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-slate-400"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      <input
        type="file"
        accept={PHOTO_TYPES}
        capture={capture ? "environment" : undefined}
        multiple={multiple}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
    </label>
  );
}

// A text field with a mic beside it. `field` names it so the sheet's single recorder
// knows which field the "recording…" line and errors belong to; `context` says what
// the technician is describing, for the transcriber. mic={false} leaves a plain text field.
function DictationInput({ field, dictation, onTranscript, context, locked, mic = true, multiline = false, ...inputProps }) {
  const Input = multiline ? "textarea" : "input";
  const input = <Input type={multiline ? undefined : "text"} {...inputProps} className={inputClass} />;
  if (!mic) return input;

  const mine = dictation.field === field;
  const recording = mine && dictation.status === "recording";
  const transcribing = mine && dictation.status === "transcribing";

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{input}</div>
        <button
          type="button"
          onClick={() => dictation.toggle(field, onTranscript, context)}
          disabled={locked || dictation.status === "transcribing"}
          aria-label={recording ? "Arrêter la dictée" : "Dicter"}
          title={recording ? "Arrêter la dictée" : "Dicter"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
            recording
              ? "border-red-300 bg-red-50 text-red-600"
              : "border-slate-200 bg-white text-slate-600 hover:border-[#1A75BC] hover:text-[#1A75BC]"
          }`}
        >
          {transcribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : recording ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      </div>
      {recording && (
        <p className="mt-1 text-xs text-red-600">
          ● Enregistrement {formatDuration(dictation.durationMillis)} · cliquer ■ pour arrêter
        </p>
      )}
      {transcribing && <p className="mt-1 text-xs text-slate-500">Transcription…</p>}
      {mine && dictation.error && <p className="mt-1 text-xs text-red-700">{dictation.error}</p>}
    </div>
  );
}

// ─── Remarks, errors and footer ────────────────────────────────────────────
function RemarksField({ value, onChange, dictation, onTranscript, context, locked }) {
  return (
    <div className="border-t border-slate-200 px-6 py-4">
      <label className="mb-1 block text-sm font-semibold text-slate-900">Remarques</label>
      <DictationInput
        field="remarks"
        dictation={dictation}
        onTranscript={onTranscript}
        context={context}
        locked={locked}
        multiline
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Observations générales…"
      />
    </div>
  );
}

function ErrorList({ errors, title = "Le formulaire ne peut pas être envoyé :" }) {
  return (
    <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_STYLES = {
  DRAFT: "bg-slate-100 text-slate-700",
  CONFORME: "bg-emerald-100 text-emerald-800",
  NON_CONFORME: "bg-red-100 text-red-800",
  VALIDATED: "bg-[#5BC6E8]/20 text-[#0F2A49]",
};

const STATUS_LABELS = {
  DRAFT: "Brouillon",
  CONFORME: "Conforme",
  NON_CONFORME: "Non conforme",
  VALIDATED: "Validé",
};

// ─── After sending: outcome and PDF ────────────────────────────────────────

// the PDF as a File, named the way the server names it ("checklist-MP1-12-10-2026.pdf")
const fetchPdf = async (submissionId) => {
  const response = await apiClient.get(`/api/v1/submissions/${submissionId}/pdf`, { responseType: "blob" });
  const disposition = response.headers["content-disposition"] ?? "";
  const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `rapport-${submissionId}.pdf`;
  return new File([response.data], name, { type: "application/pdf" });
};

// fetched once and kept in `ref` for both buttons; a failed fetch is forgotten so the next click retries
const pdfOnce = (ref, submissionId) => {
  if (!ref.current) {
    ref.current = fetchPdf(submissionId);
    ref.current.catch(() => {
      ref.current = null;
    });
  }
  return ref.current;
};

// phones and tablets can hand a file to another app (WhatsApp, mail…); most desktops can't
const canShareFiles = () => {
  try {
    return !!navigator.canShare?.({ files: [new File([""], "rapport.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
};

// The sent sheet's PDF, laid out like the mobile app: outcome, the pages shown in place as
// images the server renders, then the buttons for the real file. It's rebuilt from the saved
// submission on each request; nothing about the PDF is stored.
export function SentReport({ submissionId, status }) {
  const [pages, setPages] = useState(null); // base64 PNGs; null while loading
  const [attempt, setAttempt] = useState(0);
  const [previewError, setPreviewError] = useState(false);
  const [busy, setBusy] = useState(null); // 'download' | 'share' | null
  const [message, setMessage] = useState(null); // { ok, text } under the buttons
  const [shareable] = useState(canShareFiles);
  const pdf = useRef(null);
  const box = useRef(null);

  // the sheet was sent from its footer: bring the outcome into view
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Sharing must start right after the tap, and Safari refuses it once a download has been
  // awaited in between, so the file is fetched ahead where it can be shared.
  useEffect(() => {
    if (shareable) pdfOnce(pdf, submissionId).catch(() => {});
  }, [shareable, submissionId]);

  // attempt: bumped by Réessayer to run this again
  useEffect(() => {
    const loadPreview = async () => {
      try {
        const { data } = await apiClient.get(`/api/v1/submissions/${submissionId}/preview`);
        if (data.pages?.length) setPages(data.pages);
        else setPreviewError(true);
      } catch (err) {
        console.log("error while fetching the report preview", err);
        setPreviewError(true);
      }
    };
    loadPreview();
  }, [submissionId, attempt]);

  const retryPreview = () => {
    setPreviewError(false);
    setPages(null);
    setAttempt((n) => n + 1);
  };

  const onDownload = async () => {
    setBusy("download");
    setMessage(null);
    try {
      const file = await pdfOnce(pdf, submissionId);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      // revoked a moment later: Safari may still be reading it right after the click
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage({ ok: true, text: `Téléchargé : ${file.name}` });
    } catch (err) {
      console.log("error while downloading the report", err);
      setMessage({ ok: false, text: "Téléchargement impossible. Vérifier la connexion et réessayer." });
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    setBusy("share");
    setMessage(null);
    try {
      const file = await pdfOnce(pdf, submissionId);
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      // AbortError: the share sheet was closed without picking an app
      if (err?.name !== "AbortError") {
        console.log("error while sharing the report", err);
        setMessage({ ok: false, text: "Partage impossible. Télécharger le PDF à la place." });
      }
    } finally {
      setBusy(null);
    }
  };

  const shown = status ?? "DRAFT";
  const actionClass =
    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

  return (
    <div ref={box} className="mx-auto mt-6 w-full max-w-[1000px] scroll-mt-6 space-y-3">
      <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${STATUS_STYLES[shown]}`}>
        <CheckCheck className="h-5 w-5" />
        Envoyé · {STATUS_LABELS[shown] ?? shown}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rapport PDF</p>

        {pages === null && !previewError && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#1A75BC]" />
            Génération du rapport…
          </div>
        )}

        {previewError && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-red-700 dark:text-red-300">
            L'aperçu n'a pas pu être chargé.
            <button
              type="button"
              onClick={retryPreview}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </button>
          </div>
        )}

        {/* a sheet of paper: white whatever the theme, like the PDF */}
        {pages?.map((page, i) => (
          <img
            key={i}
            src={`data:image/png;base64,${page}`}
            alt={`Page ${i + 1} du rapport`}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
          />
        ))}
        {pages?.length > 1 && (
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">{pages.length} pages</p>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onDownload} disabled={busy !== null} className={actionClass}>
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Télécharger
          </button>
          {shareable && (
            <button type="button" onClick={onShare} disabled={busy !== null} className={actionClass}>
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Partager
            </button>
          )}
        </div>

        {message && (
          <p className={`mt-3 text-sm ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-300"}`}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}

// dictating: a transcript still on its way would miss the submission, so sending waits for it
function FormFooter({ status, inspector, sending, submitted, dictating, onSubmit }) {
  const shown = status ?? "DRAFT";
  return (
    <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">
        <span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[shown]}`}>
          {STATUS_LABELS[shown] ?? shown}
        </span>
        Visa : <span className="font-medium">{inspector || "—"}</span>
        {submitted && <span className="ml-2 text-emerald-700">· envoyé</span>}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={sending || submitted || dictating}
        className="rounded-xl bg-[#0F2A49] px-5 py-2 text-sm font-medium text-white hover:bg-[#1A75BC] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitted ? "Envoyé" : sending ? "Envoi…" : dictating ? "Dictée en cours…" : "Envoyer"}
      </button>
    </footer>
  );
}
