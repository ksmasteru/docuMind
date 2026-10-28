// Fillable checklist, styled as a white A4 PHOVA sheet: the web twin of the mobile app's
// components/checklist-sheet.jsx.
//
//   template   ← GET  /api/v1/forms/inspectionForm/{id}   (title, instructions, questions)
//   answers    ← local state, keyed by question id: { [questionId]: { value, comment } }
//   photos     → POST /api/v1/images                      (each photo as soon as it's picked → { imageId })
//   submit     → POST /api/v1/submissions                 (SubmissionRequest → { id, status })
//   pdf        ← ReportPdf (ReviewReport.jsx), once the sheet is sent
//
// The server re-checks everything (all questions answered, critical MAUVAIS has a comment,
// valid values) and decides the status. The checks here only help the technician.
//
// Every free-text field can be dictated in French (useVoiceInput.js). The transcript is
// appended, so typing and dictating mix.
//
// An IMAGE question's value is the imageId the server returned for its photo, so the photo
// must be uploaded before the sheet can be sent.
import PhovaLogo from "./PhovaLogo";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Mic, RefreshCw, Square } from "lucide-react";
import { useVoiceInput } from "./useVoiceInput";
import { ReportPdf } from "./ReviewReport";
import { EXPERTISE_FORM_TITLE, sameText } from "./expertiseForm";

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

// A phone photo is 3–5 MB; redrawn at 2000 px as a 0.8 JPEG it's well under 1 MB, and whatever
// the browser can open (HEIC on Safari) comes out as a JPEG the server accepts (JPEG, PNG, WebP).
// If the browser can't decode it, the original goes as is and the server decides.
const MAX_PHOTO_SIDE = 2000;

async function shrinkPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch (err) {
    console.log("photo kept as is, the browser could not redraw it", err);
    return file;
  }
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50";

export default function InspectionForm({ id }) {
  const { user } = useAuth();

  // the blank form, fetched from the backend
  const [template, setTemplate] = useState(null);

  // what the technician fills in
  const [answers, setAnswers] = useState({});
  const [equipment, setEquipment] = useState("");
  const [inspectionDate, setInspectionDate] = useState(todayLocal);
  const [remarks, setRemarks] = useState("");

  // sending + outcome
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);   // SubmissionResponse { id, status }
  const [errors, setErrors] = useState([]);     // messages shown above the footer

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

  // replace state, never modify it: copy the old answers, then overwrite one
  const onAnswer = (questionId, value) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], value } }));

  const onComment = (questionId, comment) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], comment } }));

  // The photo is shown at once and uploaded in the background. value stays empty until
  // the server returns its imageId, so the sheet can't be sent with a photo still on its way.
  // photoStatus: 'uploading' | 'done' | 'error'
  const onPhoto = async (questionId, file) => {
    const url = URL.createObjectURL(file);
    previewUrls.current.push(url);
    const photo = { file, url };
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], value: "", photo, photoStatus: "uploading", photoError: null },
    }));

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

    setAnswers((prev) => {
      // a newer photo replaced this one while it was uploading: drop this result
      if (prev[questionId]?.photo !== photo) return prev;
      return {
        ...prev,
        [questionId]: saved
          ? { ...prev[questionId], value: saved.imageId, photoStatus: "done" }
          : { ...prev[questionId], photoStatus: "error", photoError: error },
      };
    });
  };

  // transcripts land after the recording ends, so these read the latest state, not a copy
  const dictateInto = (questionId, key) => (text) =>
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], [key]: appendText(prev[questionId]?.[key], text) },
    }));

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

  const answeredCount = questions.filter((q) => answers[q.id]?.value?.trim()).length;
  const submitted = result !== null;
  const locked = submitted || sending;

  // What each mic is about, sent with the audio so the transcriber expects the item's own
  // words (linguet, moufle, élingue…) instead of guessing. Written as the text that would
  // come just before the technician's sentence, which is how Whisper reads it.
  const isExpertise = sameText(template.title, EXPERTISE_FORM_TITLE);
  const vocabulary = isExpertise ? EXPERTISE_VOCABULARY : MAINTENANCE_VOCABULARY;
  const subject = isExpertise ? "Rapport d'expertise pompe" : template.title;
  const itemContext = (q, lead) =>
    `${vocabulary} ${subject}. Point ${q.position} : ${spokenLabel(q.labelFr)}. ${lead}`;
  const valueContext = (q) =>
    isExpertise
      ? `${vocabulary} ${subject}. ${spokenLabel(q.labelFr)} :`
      : itemContext(q, "Valeur relevée :");
  const hasMic = (q) => !(isExpertise && NO_MIC_EXPERTISE.has(spokenLabel(q.labelFr).toLowerCase()));
  // general remarks are most likely about what was found wrong
  const flagged = questions.filter((q) => answers[q.id]?.value === "MAUVAIS");
  const listed = (flagged.length ? flagged : questions).map((q) => spokenLabel(q.labelFr)).join(" ; ");
  const remarksContext = `${vocabulary} ${subject}. ${
    flagged.length ? "Points non conformes" : "Points contrôlés"
  } : ${listed}. Remarques :`;

  // comfort checks before sending (the server checks again)
  const findProblems = () => {
    const problems = [];
    if (!equipment.trim()) problems.push("Renseigner l'emplacement / l'équipement.");
    if (!inspectionDate) problems.push("Renseigner la date du contrôle.");
    else if (inspectionDate > todayLocal()) problems.push("La date du contrôle ne peut pas être dans le futur.");
    for (const q of questions) {
      const a = answers[q.id];
      if (a?.photoStatus === "uploading") problems.push(`Question ${q.position} : photo en cours d'envoi.`);
      else if (a?.photoStatus === "error")
        problems.push(`Question ${q.position} : la photo n'a pas été envoyée, réessayer.`);
      else if (!a?.value?.trim()) problems.push(`Question ${q.position} : pas de réponse.`);
      else if (q.critical && a.value === "MAUVAIS" && !a.comment?.trim())
        problems.push(`Question ${q.position} : commentaire obligatoire (point critique non conforme).`);
    }
    return problems;
  };

  const onSubmit = async () => {
    const problems = findProblems();
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    setSending(true);
    try {
      // the state is an object keyed by id; the backend expects a list
      const body = {
        templateId: template.id,
        equipment: equipment.trim(),
        inspectionDate,          // "YYYY-MM-DD" → LocalDate on the server
        remarks,
        answers: questions.map((q) => ({
          itemId: q.id,
          value: answers[q.id].value,
          comment: answers[q.id].comment || null,
        })),
      };
      const { data } = await apiClient.post("/api/v1/submissions", body);
      setResult(data);
    } catch (err) {
      // ErrorFormat: { message, errors: { field: message } }
      const data = err.response?.data;
      const fieldErrors = data?.errors ? Object.values(data.errors) : [];
      setErrors(fieldErrors.length ? fieldErrors : [data?.message || "Envoi impossible, réessayer."]);
    } finally {
      setSending(false);
    }
  };

  return (
    // A4 sheet: at least 210 × 297 proportions, always white (paper).
    // No overflow-hidden: with aspect-ratio it would freeze the height and clip
    // whatever doesn't fit (the footer and its Envoyer button). Without it, the sheet grows.
    <div className="py-8">
      <div
        className="mx-auto w-full max-w-[1000px] bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200"
        style={{ aspectRatio: "210 / 297" }}
      >
        <FormHeader
          template={template}
          equipment={equipment}
          onEquipment={setEquipment}
          inspectionDate={inspectionDate}
          onInspectionDate={setInspectionDate}
          inspector={user?.email}
          locked={locked}
        />

        <ProgressBar answered={answeredCount} total={questions.length} />

        {/* once sent, the sheet is read-only */}
        <fieldset disabled={locked}>
          <ol className="divide-y divide-slate-100">
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                answer={answers[q.id]}
                locked={locked}
                onAnswer={onAnswer}
                onComment={onComment}
                onPhoto={onPhoto}
                dictation={dictation}
                onDictateComment={dictateInto(q.id, "comment")}
                onDictateValue={dictateInto(q.id, "value")}
                commentContext={itemContext(q, "Anomalie constatée :")}
                valueContext={valueContext(q)}
                valueMic={hasMic(q)}
              />
            ))}
          </ol>

          <RemarksField
            value={remarks}
            onChange={setRemarks}
            dictation={dictation}
            onTranscript={dictateRemarks}
            context={remarksContext}
            locked={locked}
          />
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

      {submitted && (
        <div className="mx-auto mt-6 w-full max-w-[1000px]">
          <ReportPdf submissionId={result.id} />
        </div>
      )}
    </div>
  );
}

// ─── Header: logo band, title, instructions, metadata ──────────────────────
function FormHeader({ template, equipment, onEquipment, inspectionDate, onInspectionDate, inspector, locked }) {
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

      <dl className="mx-6 mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-sm sm:grid-cols-3">
        <div className="bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Emplacement <span className="text-red-600">*</span>
          </dt>
          <dd className="mt-0.5">
            <input
              type="text"
              value={equipment}
              onChange={(e) => onEquipment(e.target.value)}
              disabled={locked}
              placeholder="ex. MP1"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50"
            />
          </dd>
        </div>
        <div className="bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Date du contrôle <span className="text-red-600">*</span>
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
    </header>
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
function QuestionRow({
  question,
  answer,
  locked,
  onAnswer,
  onComment,
  onPhoto,
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
      answer={answer}
      locked={locked}
      onAnswer={onAnswer}
      onPhoto={onPhoto}
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
              {question.labelFr}
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
function AnswerControl({ question, answer, locked, onAnswer, onPhoto, dictation, onDictate, dictationContext, mic }) {
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
      return (
        <DictationInput
          field={`value:${question.id}`}
          dictation={dictation}
          onTranscript={onDictate}
          context={dictationContext}
          mic={mic}
          locked={locked}
          value={answer?.value ?? ""}
          onChange={(e) => onAnswer(question.id, e.target.value)}
          placeholder="Saisir une valeur…"
        />
      );
    case "IMAGE":
      return <PhotoAnswer answer={answer} locked={locked} onPicked={(file) => onPhoto(question.id, file)} />;
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

function PhotoAnswer({ answer, locked, onPicked }) {
  const status = answer?.photoStatus;
  const uploading = status === "uploading";

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again must still fire onChange
    if (file) onPicked(file);
  };

  return (
    <div>
      {answer?.photo && (
        <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-slate-200">
          <img src={answer.photo.url} alt="Photo du point de contrôle" className="aspect-[4/3] w-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
      )}

      {uploading && <p className="mt-1 text-xs text-slate-500">Envoi de la photo…</p>}
      {status === "done" && <p className="mt-1 text-xs text-emerald-700">✓ Photo enregistrée</p>}
      {status === "error" && (
        <div className="mt-1 flex items-center gap-3">
          <p className="text-xs text-red-700">{answer.photoError}</p>
          <button
            type="button"
            onClick={() => onPicked(answer.photo.file)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Réessayer
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <PhotoButton
          icon={Camera}
          label={answer?.photo ? "Reprendre" : "Prendre une photo"}
          capture
          disabled={locked || uploading}
          onChange={pick}
        />
        <PhotoButton icon={ImagePlus} label="Choisir un fichier" disabled={locked || uploading} onChange={pick} />
      </div>
    </div>
  );
}

// a file input dressed as a button: the label opens it
function PhotoButton({ icon: Icon, label, capture = false, disabled, onChange }) {
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

function ErrorList({ errors }) {
  return (
    <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="font-semibold">Le formulaire ne peut pas être envoyé :</p>
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
