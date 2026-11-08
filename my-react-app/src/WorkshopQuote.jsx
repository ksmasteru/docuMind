// The devis of a workshop intervention (Quote on the backend), opened by "Générer le devis" on
// step 10 (Chef de projet). He reads the technician's démontage report, lists the parts to change
// with their quantities (typed, or later extracted from the report) and unit prices in MAD; each
// line's total (quantity × unit price) and the totals HT, TVA (20 %, ticked by default) and TTC follow
// as he types. "Valider" saves them, and the server computes the same totals.
//
//   quote   ← GET /api/v1/quotes/:quoteId          (QuoteDetails: lines, canEdit)
//   details ← GET /api/v1/interventions/:id        (the démontage report: its tasks, latestReportOf)
//   save    → PUT /api/v1/quotes/:quoteId/lines    ({ lines: [{ designation, quantity, unitPrice }], vatApplicable } → QuoteDetails)
//   report  → /atelier/:id/rapport/:submissionId, in a new tab   (the list being typed stays here)
import Layout from "./Layout";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";
import { apiClient } from "./apiClient";
import { Card, ErrorBanner, ListSkeleton, Notice } from "./managerUi";
import { formatDateTime, serverMessage } from "./managerUtils";
import { QUOTE_STATUS, inputClass, latestReportOf } from "./workshopUtils";

// "1 234,50 MAD"
const money = new Intl.NumberFormat("fr-MA", { style: "currency", currency: "MAD" });
const formatMad = (amount) => amount === null || amount === undefined ? "—" : money.format(Number(amount));

// a typed price ("12,5", "12.50", "1 200") in centimes, so the totals are exact; null if it isn't one
const centsOf = (text) => {
    const clean = String(text ?? "").replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    return Math.round(Number(clean) * 100);
};
// a row's total in centimes, null until its quantity and price are both valid
const rowCents = (row) => {
    const quantity = Number(row.quantity);
    const cents = centsOf(row.unitPrice);
    return Number.isInteger(quantity) && quantity >= 1 && cents !== null ? cents * quantity : null;
};

// the editor's rows: quantity and price kept as typed, checked on Valider; key: React's, for new rows too.
// A line saved before prices existed has no price: its field starts empty.
const rowsOf = (quote) => quote.lines.map((line) => ({
    key: line.id,
    designation: line.designation,
    quantity: String(line.quantity),
    unitPrice: line.unitPrice === null || line.unitPrice === undefined ? "" : Number(line.unitPrice).toFixed(2).replace(".", ","),
}));
const sameRows = (a, b) => a.length === b.length
    && a.every((row, i) => row.designation === b[i].designation && row.quantity === b[i].quantity && row.unitPrice === b[i].unitPrice);

const WorkshopQuote = () => {
    const { id, quoteId } = useParams();
    const [quote, setQuote] = useState(null);     // null = still loading
    const [details, setDetails] = useState(null); // the intervention, for its report; null if it didn't load
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    const [rows, setRows] = useState([]);
    const [saved, setSaved] = useState([]);       // the rows as last saved, to tell unsaved changes
    const [vatApplicable, setVatApplicable] = useState(true); // the TVA box, ticked by default
    const [sending, setSending] = useState(false);
    const [errors, setErrors] = useState([]);
    const [notice, setNotice] = useState(null);
    const nextKey = useRef(0);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const load = async () => {
            try {
                const [{ data: q }, intervention] = await Promise.all([
                    apiClient.get(`/api/v1/quotes/${quoteId}`),
                    // the page still works without it: only the report button needs it
                    apiClient.get(`/api/v1/interventions/${id}`).then((r) => r.data).catch(() => null),
                ]);
                setLoadError(null);
                setQuote(q);
                setDetails(intervention);
                setRows(rowsOf(q));
                setSaved(rowsOf(q));
                setVatApplicable(q.vatApplicable);
            }
            catch (err) {
                console.log("Error while fetching the quote", err);
                setLoadError(serverMessage(err, "Le devis n'a pas pu être chargé. Vérifiez votre connexion et réessayez."));
            }
        };
        load();
    }, [id, quoteId, attempt]);

    const newRow = () => ({ key: `new-${nextKey.current++}`, designation: "", quantity: "1", unitPrice: "" });
    const addRow = () => setRows((current) => [...current, newRow()]);
    const removeRow = (key) => setRows((current) => current.filter((row) => row.key !== key));
    const changeRow = (key, field) => (e) =>
        setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: e.target.value } : row));

    // what's wrong before sending, in the page's words
    const problems = (list) => {
        if (list.length === 0) return ["Ajoutez au moins une pièce."];
        const found = [];
        list.forEach((row, i) => {
            if (!row.designation.trim()) found.push(`Ligne ${i + 1} : indiquez la pièce.`);
            const quantity = Number(row.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) found.push(`Ligne ${i + 1} : la quantité est un nombre entier d'au moins 1.`);
            if (centsOf(row.unitPrice) === null) found.push(`Ligne ${i + 1} : indiquez le prix unitaire en MAD (ex. : 1250,50).`);
        });
        return found;
    };

    const validate = async () => {
        const found = problems(rows);
        setErrors(found);
        setNotice(null);
        if (found.length) return;
        setSending(true);
        try {
            const { data } = await apiClient.put(`/api/v1/quotes/${quoteId}/lines`, {
                // the price as text ("1250.50"): read as an exact decimal on the server
                lines: rows.map((row) => ({
                    designation: row.designation.trim(),
                    quantity: Number(row.quantity),
                    unitPrice: (centsOf(row.unitPrice) / 100).toFixed(2),
                })),
                vatApplicable,
            });
            setQuote(data);
            setRows(rowsOf(data));
            setSaved(rowsOf(data));
            setVatApplicable(data.vatApplicable);
            setNotice(`Devis enregistré : ${data.lines.length} pièce${data.lines.length > 1 ? "s" : ""}, total ${formatMad(data.totalAmount)} TTC.`);
        }
        catch (err) {
            console.log("Error while saving the quote", err);
            const fieldErrors = err.response?.data?.errors ? Object.values(err.response.data.errors) : [];
            setErrors(fieldErrors.length ? fieldErrors : [serverMessage(err, "Le devis n'a pas pu être enregistré. Vérifiez votre connexion et réessayez.")]);
        }
        finally {
            setSending(false);
        }
    };

    const backLink = (
        <Link to={`/atelier/${id}`} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            ← {quote?.interventionNumber ?? "Intervention"}
        </Link>
    );

    if (quote === null) {
        return (
        <Layout active="workshop">
            {backLink}
            <div className="mt-4">{loadError ? <ErrorBanner message={loadError} onRetry={() => setAttempt((n) => n + 1)} /> : <ListSkeleton />}</div>
        </Layout>)
    }

    const status = QUOTE_STATUS[quote.status];
    // the démontage report, even once the montage task is the current one (step 15 on)
    const reportId = latestReportOf(details, "DEMONTAGE_EXPERTISE");
    const editable = quote.canEdit;
    const dirty = !sameRows(rows, saved) || vatApplicable !== quote.vatApplicable;
    // the totals as typed, in centimes like the server (TVA rounded to the centime): every row needs a
    // quantity and a price to count
    const rate = Number(quote.vatRate ?? 20);
    const rowTotals = rows.map(rowCents);
    const typedSubtotal = rows.length && rowTotals.every((cents) => cents !== null) ? rowTotals.reduce((sum, cents) => sum + cents, 0) : null;
    const typedVat = typedSubtotal === null ? null : vatApplicable ? Math.round(typedSubtotal * rate / 100) : 0;
    // what the box shows: live while editing, the saved amounts otherwise
    const totals = editable
        ? { vatOn: vatApplicable, subtotal: typedSubtotal === null ? null : typedSubtotal / 100,
            vat: typedVat === null ? null : typedVat / 100, total: typedSubtotal === null ? null : (typedSubtotal + typedVat) / 100 }
        : { vatOn: quote.vatApplicable, subtotal: quote.subtotalAmount, vat: quote.vatAmount, total: quote.totalAmount };
    const rateLabel = `${rate.toLocaleString("fr-FR")} %`;

    return (
    <Layout active="workshop">
        {backLink}

        <header className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Devis {quote.number}</h1>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status?.style}`}>{status?.label ?? quote.status}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {quote.interventionNumber} · {quote.equipmentId}{quote.client ? ` · ${quote.client}` : ""} · version {quote.version}
            </p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Préparé par {quote.createdBy}
                {quote.validatedAt ? ` · enregistré le ${formatDateTime(quote.validatedAt)}` : " · pas encore enregistré"}
            </p>
        </header>

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6 space-y-6">
            {/* the source of the parts: the technician's report */}
            <div className="grid gap-2 sm:grid-cols-2">
                {reportId ? (
                    <Link to={`/atelier/${id}/rapport/${reportId}`} target="_blank" rel="noopener"
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Voir le rapport de démontage
                    </Link>
                ) : (
                    <span className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-400 dark:border-slate-600">
                        Aucun rapport de démontage
                    </span>
                )}
                {/* later: fills the list from the report's parts */}
                <button type="button" disabled title="Bientôt disponible"
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> Extraire les pièces du rapport
                    <span className="text-xs font-normal">· bientôt</span>
                </button>
            </div>

            <Card title="Pièces à changer" subtitle={editable ? "Indiquez chaque pièce, sa quantité et son prix unitaire en MAD, puis validez." : null}>
                {editable ? (
                    <PartsEditor rows={rows} onChange={changeRow} onRemove={removeRow} disabled={sending} />
                ) : (
                    <PartsList lines={quote.lines} />
                )}

                {editable && (
                    <button type="button" onClick={addRow} disabled={sending}
                        className="mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-[#1A75BC] transition hover:bg-[#1A75BC]/10 disabled:opacity-50 dark:text-[#5BC6E8]">
                        <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une pièce
                    </button>
                )}

                {/* the totals: HT, TVA (the box, ticked by default), TTC */}
                <div className="mt-4 space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Total HT</span>
                        <span className="tabular-nums text-slate-800 dark:text-slate-200">{formatMad(totals.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        {editable ? (
                            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                                <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)}
                                    disabled={sending} className="h-4 w-4 accent-[#1A75BC]" />
                                TVA {rateLabel}
                            </label>
                        ) : (
                            <span className="text-slate-500 dark:text-slate-400">{totals.vatOn ? `TVA ${rateLabel}` : "TVA non applicable"}</span>
                        )}
                        <span className={`tabular-nums ${totals.vatOn ? "text-slate-800 dark:text-slate-200" : "text-slate-400"}`}>{formatMad(totals.vat)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                        <span className="font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Total TTC</span>
                        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMad(totals.total)}</span>
                    </div>
                </div>
                {editable && rows.length > 0 && typedSubtotal === null && (
                    <p className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">Les totaux s'affichent quand chaque ligne a une quantité et un prix.</p>
                )}

                {errors.length > 0 && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                        {errors.map((message) => <p key={message}>{message}</p>)}
                    </div>
                )}

                {editable && (
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                        {dirty && <p className="text-sm text-amber-700 dark:text-amber-400">Modifications non enregistrées</p>}
                        <button type="button" onClick={validate} disabled={sending}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">
                            {sending ? "Enregistrement…" : "Valider"}
                        </button>
                    </div>
                )}

                {!editable && (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        {quote.status === "DRAFT"
                            ? "Seul le Chef de projet qui a pris l'étape 10 en charge peut modifier ce devis."
                            : "Ce devis n'est plus modifiable."}
                    </p>
                )}
            </Card>
        </div>
    </Layout>)
}

// the rows being typed: the part, how many, its unit price, the line's total and a bin.
// From sm up one line per part; on a phone the part and its bin on top, quantity × price = total under it.
const PartsEditor = ({ rows, onChange, onRemove, disabled }) => {
    if (rows.length === 0)
        return (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                Aucune pièce pour l'instant. Ajoutez-en une ci-dessous.
            </p>
        );
    return (
    <div>
        <div className="hidden grid-cols-[1.5rem_1fr_5rem_7rem_7.5rem_2.25rem] gap-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid dark:text-slate-400">
            <span>#</span><span>Pièce</span><span>Qté</span><span>Prix unit. (MAD)</span><span className="text-right">Total</span><span />
        </div>
        <ol className="space-y-3 sm:space-y-2">
            {rows.map((row, i) => {
                const cents = rowCents(row);
                return (
                <li key={row.key}
                    className="grid grid-cols-[1.25rem_1fr_2.25rem] items-center gap-x-1.5 gap-y-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1.5rem_1fr_5rem_7rem_7.5rem_2.25rem] sm:gap-2 sm:rounded-none sm:border-0 sm:p-0 dark:border-slate-700">
                    <span className="text-center text-sm tabular-nums text-slate-500 dark:text-slate-400">{i + 1}</span>
                    <input value={row.designation} onChange={onChange(row.key, "designation")} disabled={disabled}
                        placeholder="Ex. : garniture mécanique" aria-label={`Pièce ${i + 1}`}
                        className={`${inputClass} mt-0`} />
                    {/* phone: second line, under the part */}
                    <div className="col-span-3 col-start-1 row-start-2 grid grid-cols-[1.25rem_4rem_1fr_auto] items-center gap-1.5 sm:contents">
                        <span className="text-center text-xs text-slate-400 sm:hidden">×</span>
                        <input type="number" inputMode="numeric" min={1} step={1} value={row.quantity} onChange={onChange(row.key, "quantity")}
                            disabled={disabled} aria-label={`Quantité de la pièce ${i + 1}`}
                            className={`${inputClass} mt-0 tabular-nums sm:col-start-3 sm:row-start-1`} />
                        <input inputMode="decimal" value={row.unitPrice} onChange={onChange(row.key, "unitPrice")}
                            disabled={disabled} placeholder="Prix unit. MAD" aria-label={`Prix unitaire de la pièce ${i + 1}, en MAD`}
                            className={`${inputClass} mt-0 tabular-nums sm:col-start-4 sm:row-start-1`} />
                        <span className="text-right text-sm font-medium tabular-nums text-slate-800 sm:col-start-5 sm:row-start-1 dark:text-slate-200">
                            {cents === null ? "—" : formatMad(cents / 100)}
                        </span>
                    </div>
                    <button type="button" onClick={() => onRemove(row.key)} disabled={disabled} aria-label={`Retirer la pièce ${i + 1}`}
                        className="col-start-3 row-start-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:col-start-6 dark:hover:bg-red-950 dark:hover:text-red-400">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                </li>)
            })}
        </ol>
    </div>)
};

// the saved parts, read-only: quantity × unit price = line total
const PartsList = ({ lines }) => {
    if (lines.length === 0)
        return <p className="text-sm text-slate-500 dark:text-slate-400">Aucune pièce enregistrée.</p>;
    return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-700">
        {lines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="w-6 text-center tabular-nums text-slate-500 dark:text-slate-400">{line.position}</span>
                <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200">{line.designation}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{line.quantity} × {formatMad(line.unitPrice)}</span>
                <span className="w-28 text-right font-medium tabular-nums text-slate-800 dark:text-slate-200">{formatMad(line.lineTotal)}</span>
            </li>
        ))}
    </ol>)
};

export default WorkshopQuote;
