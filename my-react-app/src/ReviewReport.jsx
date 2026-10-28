// A sent report, read by the manager who created its task. Opened from the Review page as
// /review/:submissionId?taskId=…&title=…, the mobile app's review screen.
//
//   report  ← GET  /api/v1/submissions/{id}          (SubmissionReport, the PDF's data)
//   pdf     ← GET  /api/v1/submissions/{id}/preview  (one base64 PNG per page)
//           ← GET  /api/v1/submissions/{id}/pdf      (the file, for the download button)
//   approve → POST /api/v1/task/{taskId}/approve     (SUBMITTED -> APPROVED)
//   return  → POST /api/v1/task/{taskId}/return      (SUBMITTED -> RETURNED, with a comment)
//
// Laid out like the sheet the technician filled, but nothing here can be changed. After a
// decision the page goes back to the Review list, where the task is gone.
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { ErrorBanner, SectionLabel } from "./managerUi";
import { buttonBase, serverMessage } from "./managerUtils";

const STATUS_INFO = {
    CONFORME:     { label: "Conforme",      style: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
    NON_CONFORME: { label: "Non conforme",  style: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" },
};

// the server stores Bon / Mauvais in lowercase
const choiceOf = (value) => {
    const v = value?.trim().toLowerCase();
    return v === "bon" || v === "mauvais" ? v : null;
};

const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800";

const ReviewReport = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const taskId = searchParams.get("taskId");
    const title = searchParams.get("title");

    const [report, setReport] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadReport = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/submissions/${id}`);
                setLoadError(null);
                setReport(data);
            }
            catch (err) {
                console.log("Error while fetching the report", err);
                setLoadError(serverMessage(err, "Le rapport n'a pas pu être chargé. Vérifiez votre connexion et réessayez."));
            }
        };
        loadReport();
    }, [id, attempt]);

    const onRetry = () => {
        setLoadError(null);
        setAttempt((n) => n + 1);
    };

    return (
    <Layout active="review">
        <Link to="/review" className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            ← Rapports à valider
        </Link>

        <div className="mt-4">
            {!report && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!report && !loadError && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement du rapport…</p>}

            {report && (
            <div className="space-y-3">
                <header className="mb-5">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-[#1A75BC]/10 px-2 py-0.5 font-semibold text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">
                            {report.type}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">v{report.version}</span>
                    </div>
                    <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{report.title}</h1>
                    {report.instructions && (
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">{report.instructions}</p>
                    )}
                </header>

                <dl className={`${cardClass} grid grid-cols-2 gap-x-4 gap-y-3`}>
                    <Fact label="Emplacement" value={report.equipment} />
                    <Fact label="Date d'inspection" value={report.inspectionDate} />
                    <Fact label="Technicien" value={report.inspector} />
                    <Fact label="Envoyé le" value={report.submittedAt} />
                </dl>

                {STATUS_INFO[report.status] && (
                    <p className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${STATUS_INFO[report.status].style}`}>
                        {STATUS_INFO[report.status].label}
                    </p>
                )}

                {(report.answers ?? []).map((row) => <AnswerRow key={row.position} row={row} />)}

                <div className={cardClass}>
                    <SectionLabel>Remarques</SectionLabel>
                    <p className={`mt-1 whitespace-pre-line text-sm ${report.remarks ? "text-slate-700 dark:text-slate-200" : "italic text-slate-400"}`}>
                        {report.remarks || "Aucune remarque."}
                    </p>
                </div>

                <ReportPdf submissionId={id} />

                {taskId && <ReviewActions taskId={taskId} title={title || report.title} />}
            </div>
            )}
        </div>
    </Layout>)
}

const Fact = ({ label, value }) => (
    <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{value || "—"}</dd>
    </div>
);

// One answered question. The report carries no answer type, so it's read from the value:
// a photo, Bon / Mauvais, or typed text. A photo answer whose image couldn't be read has
// neither value nor photo.
const AnswerRow = ({ row }) => {
    const choice = choiceOf(row.value);

    return (
    <div className={`${cardClass} ${choice === "mauvais" ? "border-l-4 border-l-red-500" : ""}`}>
        <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {row.position}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.labelFr}</p>
                {row.labelAr && <p dir="rtl" className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{row.labelAr}</p>}
                {row.critical && <p className="mt-0.5 text-xs font-semibold text-orange-700 dark:text-orange-400">⚠ Critique</p>}
            </div>
        </div>

        <div className="mt-3 pl-9">
            {row.photo ? (
                <img src={row.photo} alt={`Photo du point ${row.position}`}
                    className="max-h-80 rounded-lg border border-slate-200 object-contain dark:border-slate-700" />
            ) : choice ? (
                <div className="flex gap-2">
                    <ChoiceDisplay label="Bon" good selected={choice === "bon"} />
                    <ChoiceDisplay label="Mauvais" selected={choice === "mauvais"} />
                </div>
            ) : row.value ? (
                <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{row.value}</p>
            ) : (
                <p className="text-sm italic text-slate-400">Photo indisponible</p>
            )}

            {row.comment && (
                <div className="mt-3">
                    <SectionLabel>Commentaire</SectionLabel>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{row.comment}</p>
                </div>
            )}
        </div>
    </div>)
};

// the sheet's Bon / Mauvais button, as a picture of the answer: nothing to press
const ChoiceDisplay = ({ label, good, selected }) => {
    const on = good
        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
    return (
        <span className={`rounded-full border px-3 py-1 text-sm ${
            selected ? `font-semibold ${on}` : "border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500"
        }`}>
            {good ? "✓" : "✕"} {label}
        </span>
    );
};

// The PDF the server builds from the same report, shown as page images, plus a download.
// Also shown by InspectionForm under a sheet the technician just sent.
export const ReportPdf = ({ submissionId }) => {
    const [pages, setPages] = useState(null); // base64 PNGs; null while loading
    const [attempt, setAttempt] = useState(0);
    const [previewError, setPreviewError] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState(false);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadPreview = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/submissions/${submissionId}/preview`);
                setPreviewError(false);
                if (data.pages?.length) setPages(data.pages);
                else setPreviewError(true);
            }
            catch (err) {
                console.log("Error while fetching the report preview", err);
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

    const download = async () => {
        setDownloading(true);
        setDownloadError(false);
        try {
            const response = await apiClient.get(`/api/v1/submissions/${submissionId}/pdf`, { responseType: "blob" });
            // the server's name ("checklist-MP1-12-10-2026.pdf"), when CORS lets the header through
            const disposition = response.headers["content-disposition"] ?? "";
            const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `checklist-${submissionId}.pdf`;
            const url = URL.createObjectURL(response.data);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (err) {
            console.log("Error while downloading the report", err);
            setDownloadError(true);
        }
        finally {
            setDownloading(false);
        }
    };

    return (
    <div className={cardClass}>
        <div className="flex items-center justify-between gap-3">
            <SectionLabel>Rapport PDF</SectionLabel>
            <button type="button" onClick={download} disabled={downloading}
                className={`${buttonBase} border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700`}>
                {downloading ? "Téléchargement…" : "Télécharger le PDF"}
            </button>
        </div>
        {downloadError && <p className="mt-2 text-sm text-red-700 dark:text-red-300">Le téléchargement a échoué. Réessayez.</p>}

        {pages === null && !previewError && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Génération du rapport…</p>
        )}

        {previewError && (
            <div className="mt-3"><ErrorBanner message="L'aperçu n'a pas pu être chargé." onRetry={retryPreview} /></div>
        )}

        {pages?.map((page, i) => (
            <img key={i} src={`data:image/png;base64,${page}`} alt={`Page ${i + 1} du rapport`}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
        ))}
    </div>)
};

// Approve, or send back with what to redo.
const ReviewActions = ({ taskId, title }) => {
    const navigate = useNavigate();
    const [returning, setReturning] = useState(false);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(null); // 'approve' | 'return' | null
    const [error, setError] = useState("");

    const send = async (action) => {
        setSending(action);
        setError("");
        try {
            await apiClient.post(`/api/v1/task/${taskId}/${action}`, action === "return" ? { comment: comment.trim() } : undefined);
            navigate("/review", { state: { notice: `${action === "approve" ? "Rapport approuvé" : "Rapport renvoyé"} : « ${title} ».` } });
        }
        catch (err) {
            console.log(`Error while trying to ${action} the task`, err);
            setError(serverMessage(err, "La décision n'a pas pu être envoyée. Réessayez."));
            setSending(null);
        }
    };

    // approving closes the task for good, so it's confirmed first
    const approve = () => {
        if (window.confirm(`Approuver le rapport ? La tâche « ${title} » sera clôturée.`)) send("approve");
    };

    const busy = sending !== null;

    return (
    <div className={cardClass}>
        <SectionLabel>Décision</SectionLabel>

        {!returning ? (
        <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setReturning(true)}
                className={`${buttonBase} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`}>
                Renvoyer
            </button>
            <button type="button" disabled={busy} onClick={approve}
                className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`}>
                {sending === "approve" ? "Approbation…" : "Approuver"}
            </button>
        </div>
        ) : (
        <div className="mt-3 space-y-2">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
                À corriger <span className="text-red-600 dark:text-red-400">*</span>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={busy} rows={3}
                    placeholder="Ce que le technicien doit refaire"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <div className="flex justify-end gap-2">
                <button type="button" disabled={busy} onClick={() => setReturning(false)}
                    className={`${buttonBase} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700`}>
                    Annuler
                </button>
                <button type="button" disabled={busy || !comment.trim()} onClick={() => send("return")}
                    className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}>
                    {sending === "return" ? "Renvoi…" : "Confirmer le renvoi"}
                </button>
            </div>
        </div>
        )}

        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>)
};

export default ReviewReport;
