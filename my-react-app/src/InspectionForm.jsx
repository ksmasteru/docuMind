// Fillable checklist, styled as a white A4 PHOVA sheet.
//
//   template   ← GET  /api/v1/forms/inspectionForm/{id}   (title, instructions, questions)
//   answers    ← local state, keyed by question id: { [questionId]: { value, comment } }
//   submit     → POST /api/v1/submissions                 (SubmissionRequest → { id, status })
//
// The server re-checks everything (all questions answered, critical MAUVAIS has a comment,
// valid values) and decides the status. The checks here only help the technician.
import PhovaLogo from "./PhovaLogo";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { useEffect, useState } from "react";

// today as "YYYY-MM-DD" in the user's own timezone (toISOString() alone would use UTC)
const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

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

  const questions = [...(template?.questions ?? [])].sort((a, b) => a.position - b.position);
  if (!template) return <p>Loading...</p>;

  const answeredCount = questions.filter((q) => answers[q.id]?.value?.trim()).length;

  // comfort checks before sending (the server checks again)
  const findProblems = () => {
    const problems = [];
    if (!equipment.trim()) problems.push("Renseigner l'emplacement / l'équipement.");
    if (!inspectionDate) problems.push("Renseigner la date du contrôle.");
    else if (inspectionDate > todayLocal()) problems.push("La date du contrôle ne peut pas être dans le futur.");
    for (const q of questions) {
      const a = answers[q.id];
      if (!a?.value?.trim()) problems.push(`Question ${q.position} : pas de réponse.`);
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

  const submitted = result !== null;

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
          locked={submitted}
        />

        <ProgressBar answered={answeredCount} total={questions.length} />

        {/* once sent, the sheet is read-only */}
        <fieldset disabled={submitted || sending}>
          <ol className="divide-y divide-slate-100">
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                answer={answers[q.id]}
                onAnswer={onAnswer}
                onComment={onComment}
              />
            ))}
          </ol>

          <RemarksField value={remarks} onChange={setRemarks} />
        </fieldset>

        {errors.length > 0 && <ErrorList errors={errors} />}

        <FormFooter
          status={result?.status}
          inspector={user?.email}
          sending={sending}
          submitted={submitted}
          onSubmit={onSubmit}
        />
      </div>
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
function QuestionRow({ question, answer, onAnswer, onComment }) {
  const isBad = answer?.value === "MAUVAIS";
  const commentRequired = isBad && question.critical;

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

        <AnswerControl question={question} answer={answer} onAnswer={onAnswer} />
      </div>

      {isBad && (
        <div className="mt-3 sm:ml-10">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Commentaire {commentRequired ? <span className="text-red-600">(obligatoire)</span> : "(optionnel)"}
          </label>
          <textarea
            rows={2}
            value={answer?.comment ?? ""}
            onChange={(e) => onComment(question.id, e.target.value)}
            placeholder="Décrire l'anomalie constatée…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20"
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
function AnswerControl({ question, answer, onAnswer }) {
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
        <input
          type="text"
          value={answer?.value ?? ""}
          onChange={(e) => onAnswer(question.id, e.target.value)}
          placeholder="Saisir une valeur…"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 sm:w-64"
        />
      );
    case "IMAGE":
      // photo upload isn't built yet (needs its own backend endpoint)
      return (
        <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-400">
          📷 Photo : bientôt disponible
        </span>
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

// ─── Remarks, errors and footer ────────────────────────────────────────────
function RemarksField({ value, onChange }) {
  return (
    <div className="border-t border-slate-200 px-6 py-4">
      <label className="mb-1 block text-sm font-semibold text-slate-900">Remarques</label>
      <textarea
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Observations générales…"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:bg-slate-50"
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

function FormFooter({ status, inspector, sending, submitted, onSubmit }) {
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
        disabled={sending || submitted}
        className="rounded-xl bg-[#0F2A49] px-5 py-2 text-sm font-medium text-white hover:bg-[#1A75BC] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitted ? "Envoyé" : sending ? "Envoi…" : "Envoyer"}
      </button>
    </footer>
  );
}
