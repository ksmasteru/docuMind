// Where a report's QR code lands: /verify/:code shows what the server saved for that report, so
// whoever holds the paper (a client, an auditor) can compare. No login. /verify alone asks for
// the code printed under the QR code, for when it can't be scanned.
//
//   code → GET /api/public/verify/{code}           (VerificationResponse; 404 unknown, 429 too many checks)
//        → GET /api/public/verify/{code}/preview   (the report's pages as PNGs, to compare with the paper)
//        → GET /api/public/verify/{code}/pdf       (the report itself)
//
// Plain axios, not apiClient: this page has no session, and apiClient's 401 handling would
// send the visitor to the login page.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { Download, Eye, EyeOff, Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import PhovaLogo from "./PhovaLogo";

const baseURL = import.meta.env.VITE_API_URL;

// the task's status, as the person checking should read it
const REVIEW = {
  SUBMITTED: "En attente de validation",
  APPROVED: "Validé par le responsable",
  RETURNED: "Renvoyé pour correction",
  REJECTED: "Rejeté par le responsable",
  CANCELED: "Tâche annulée",
};

const STATUS = { CONFORME: "Conforme", NON_CONFORME: "Non conforme" };

// the verdict at the top: the worst thing that applies wins
function verdictOf(r) {
  if (r.result === "ALTERED")
    return {
      tone: "bad",
      title: "Ce rapport a été modifié après son envoi",
      text: "Les données enregistrées ne correspondent plus au rapport d'origine. Ne vous fiez pas à ce document et contactez PHOVA.",
    };
  if (!r.current)
    return {
      tone: "warn",
      title: "Une version plus récente existe",
      text: `Ce rapport a été renvoyé pour correction puis remplacé${r.replacedAt ? ` le ${r.replacedAt}` : ""}. Demandez la dernière version.`,
    };
  if (r.review === "REJECTED" || r.review === "CANCELED")
    return {
      tone: "warn",
      title: "Document authentique, mais non valable",
      text: r.review === "REJECTED" ? "Le responsable a rejeté ce rapport." : "La tâche de ce rapport a été annulée.",
    };
  return {
    tone: "ok",
    title: "Document authentique",
    text: "Ce rapport a bien été émis par PHOVA et n'a pas été modifié. Vérifiez que les informations ci-dessous correspondent au document.",
  };
}

const TONES = {
  ok: { box: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40", icon: ShieldCheck, color: "text-emerald-600 dark:text-emerald-400" },
  warn: { box: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40", icon: ShieldAlert, color: "text-amber-600 dark:text-amber-400" },
  bad: { box: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40", icon: ShieldX, color: "text-red-600 dark:text-red-400" },
};

function Verdict({ tone, title, text }) {
  const { box, icon: Icon, color } = TONES[tone];
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-left ${box}`}>
      <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${color}`} />
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-700">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-900 dark:text-slate-100">{value || "—"}</dd>
    </div>
  );
}

// The report as the server holds it, to compare with the copy in hand: the visitor is asked to
// look through it, since a checked code only proves the report exists, not that their paper
// matches it. Pages are loaded on demand: rendering them is the slow part.
function DocumentCopy({ code, altered }) {
  const [pages, setPages] = useState(null); // base64 PNGs once loaded
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(null); // 'preview' | 'download' | null
  const [error, setError] = useState(null);

  const failure = (err) =>
    err.response?.status === 429
      ? "Trop de vérifications : réessayez dans une minute."
      : "Le document n'a pas pu être chargé. Réessayez.";

  const onPreview = async () => {
    if (pages) return setShown((s) => !s);
    setBusy("preview");
    setError(null);
    try {
      const { data } = await axios.get(`${baseURL ?? ""}/api/public/verify/${encodeURIComponent(code)}/preview`);
      setPages(data.pages);
      setShown(true);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    setBusy("download");
    setError(null);
    try {
      const response = await axios.get(`${baseURL ?? ""}/api/public/verify/${encodeURIComponent(code)}/pdf`, {
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] ?? "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `rapport-${code}.pdf`;
      const url = URL.createObjectURL(new File([response.data], name, { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      // revoked a moment later: Safari may still be reading it right after the click
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(null);
    }
  };

  const actionClass =
    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

  return (
    <section className="mt-6 border-t border-slate-200 pt-5 text-left dark:border-slate-700">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comparez avec votre exemplaire</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {altered
          ? "Voici le rapport tel qu'il est enregistré aujourd'hui. Il a été modifié après son envoi : il peut différer de votre exemplaire."
          : "Pour confirmer la validité de votre document, parcourez le rapport original ci-dessous et vérifiez qu'il est identique au vôtre : informations, résultats, commentaires et photos."}
      </p>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onPreview} disabled={busy !== null} className={actionClass}>
          {busy === "preview" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : shown ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {shown ? "Masquer l'aperçu" : "Aperçu"}
        </button>
        <button type="button" onClick={onDownload} disabled={busy !== null} className={actionClass}>
          {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Télécharger le PDF
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {/* a sheet of paper: white whatever the theme, like the PDF */}
      {shown &&
        pages?.map((page, i) => (
          <img
            key={i}
            src={`data:image/png;base64,${page}`}
            alt={`Page ${i + 1} du rapport`}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
          />
        ))}
      {shown && pages?.length > 1 && (
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">{pages.length} pages</p>
      )}
    </section>
  );
}

// /verify with no code: type the one printed under the QR code
function CodeEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (code.trim()) navigate(`/verify/${encodeURIComponent(code.trim().toUpperCase())}`);
  };
  return (
    <form onSubmit={submit} className="mt-6 text-left">
      <label htmlFor="code" className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Code de vérification
      </label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wider text-slate-900 focus:border-[#1A75BC] focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Imprimé sous le code QR, en bas du rapport.</p>
      <button
        type="submit"
        className="mt-4 w-full rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white hover:bg-[#15639f]"
      >
        Vérifier
      </button>
    </form>
  );
}

export default function VerifyReport() {
  const { code } = useParams();
  // { report } | { error: "unknown" | "busy" | "network" }
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setState(null);
    axios
      .get(`${baseURL ?? ""}/api/public/verify/${encodeURIComponent(code)}`)
      .then(({ data }) => !cancelled && setState({ report: data }))
      .catch((err) => {
        if (cancelled) return;
        const status = err.response?.status;
        setState({ error: status === 404 ? "unknown" : status === 429 ? "busy" : "network" });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const r = state?.report;

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10 dark:bg-slate-900">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <PhovaLogo className="mx-auto h-8" />
        <h1 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">Vérification d'un rapport</h1>

        {!code && <CodeEntry />}

        {code && !state && (
          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#1A75BC]" />
            Vérification…
          </div>
        )}

        {state?.error === "unknown" && (
          <div className="mt-6">
            <Verdict
              tone="bad"
              title="Document inconnu"
              text={`Aucun rapport ne porte le code ${code}. Vérifiez la saisie : si le code est correct, ce document n'a pas été émis par PHOVA.`}
            />
            <CodeEntry />
          </div>
        )}
        {state?.error === "busy" && (
          <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">Trop de vérifications : réessayez dans une minute.</p>
        )}
        {state?.error === "network" && (
          <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            Le service de vérification ne répond pas. Réessayez plus tard.
          </p>
        )}

        {r && (
          <>
            <div className="mt-6">
              <Verdict {...verdictOf(r)} />
            </div>
            <dl className="mt-5 text-left">
              <Row label="Rapport" value={`${r.title} (v${r.version})`} />
              <Row label="Équipement" value={r.equipment} />
              <Row label="Date d'inspection" value={r.inspectionDate} />
              <Row label="Inspecteur" value={r.inspector} />
              <Row label="Envoyé le" value={r.submittedAt} />
              <Row label="Résultat" value={STATUS[r.status] ?? r.status} />
              {r.review && <Row label="Validation" value={REVIEW[r.review] ?? "En cours"} />}
              <Row label="Code" value={<span className="font-mono">{r.code}</span>} />
            </dl>
            <DocumentCopy code={code} altered={r.result === "ALTERED"} />
          </>
        )}
      </div>
    </div>
  );
}
