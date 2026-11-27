// One pump model's spec sheet (« Fiche technique OTW », plan_pump_manuals.md §7), on « Fiches techniques », in the
// pump page's « Fiche » tab, and behind the task page's link. Everyone reads it; the admin keeps it up to date:
//
//   « Modifier »   → PUT  /api/admin/specs/{model}       { text }   (also « Ajouter » for a model without a sheet)
//   « Remplacer »  → POST /api/admin/specs/{model}/file  a .txt, .md or .pdf
//   « Télécharger »← GET  /api/v1/files/id/{fileId}
//
// A change makes a new document and deletes the old one on the server, so the assistant never reads two versions.
// The text is shown as written, with a little structure read from it: the title, « Label : valeur. » lines as a
// table, a section whose heading says « à compléter » as missing values. Anything else is shown as paragraphs.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText, Pencil, Plus, Upload } from "lucide-react";
import { apiClient } from "./apiClient";
import { formatDateTime, serverMessage } from "./managerUtils";
import { downloadDocument, openDocument } from "./pumpDocuments";
import { parseSheet } from "./specSheet";

const actionClass = "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-foreground/[0.04] disabled:opacity-50";

export default function SpecSheetCard({ sheet, canEdit = false, onChanged, highlighted = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const model = sheet.model;
  const hasSheet = Boolean(sheet.fileId);
  const isPdf = hasSheet && sheet.text == null;
  const parsed = sheet.text ? parseSheet(sheet.text) : null;

  const startEditing = () => {
    setDraft(sheet.text ?? `Fiche technique PHOVA : pompe ${model}.\nModèle : ${model}.\nSource : \n\nDescription.\n\n\nCaractéristiques de la série ${model}.\nDébit : .\nHauteur : .\nVitesse de rotation : .\nPression : .\nTempérature : .\n`);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.put(`/api/admin/specs/${encodeURIComponent(model)}`, { text: draft });
      setEditing(false);
      onChanged?.(data);
    }
    catch (err) {
      console.log("Error while saving a spec sheet", err);
      setError(serverMessage(err, "La fiche n'a pas pu être enregistrée."));
    }
    finally {
      setBusy(false);
    }
  };

  const replace = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await apiClient.post(`/api/admin/specs/${encodeURIComponent(model)}/file`, form);
      onChanged?.(data);
    }
    catch (err) {
      console.log("Error while replacing a spec sheet", err);
      setError(serverMessage(err, "Le fichier n'a pas pu remplacer la fiche."));
    }
    finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const download = async () => {
    try {
      await downloadDocument(sheet.fileId, `${sheet.title}${sheet.contentType?.includes("pdf") ? ".pdf" : ".txt"}`);
    }
    catch (err) {
      console.log("Error while downloading a spec sheet", err);
      setError("La fiche n'a pas pu être téléchargée.");
    }
  };

  return (
    <section id={`fiche-${model}`}
      className={`scroll-mt-24 rounded-md border bg-card p-5 transition ${highlighted ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Fiche technique {model}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {!hasSheet ? "Pas encore de fiche pour ce modèle."
              : sheet.origin === "INSTALLED" ? "Installée par l'application, d'après le catalogue PHOVA."
              : `Modifiée par ${sheet.changedBy}${sheet.changedAt ? `, le ${formatDateTime(sheet.changedAt)}` : ""}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasSheet && !editing && (
            <button type="button" onClick={download} className={actionClass}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Télécharger
            </button>
          )}
          {canEdit && !editing && !isPdf && (
            <button type="button" onClick={startEditing} disabled={busy} className={actionClass}>
              {hasSheet ? <><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifier</>
                : <><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Ajouter</>}
            </button>
          )}
          {canEdit && !editing && (
            <>
              <input ref={fileRef} type="file" accept=".txt,.md,.pdf" className="hidden" onChange={(e) => replace(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={actionClass}>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" /> {hasSheet ? "Remplacer" : "Importer un fichier"}
              </button>
            </>
          )}
        </div>
      </header>

      {error && <p role="alert" className="mt-3 rounded-md border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}

      {editing ? (
        <div className="mt-4">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} disabled={busy}
            aria-label={`Texte de la fiche technique ${model}`}
            className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40" />
          <p className="mt-1 text-xs text-muted-foreground">
            Une valeur par ligne, « Libellé : valeur. », avec son unité ; une ligne vide sépare les parties.
            Ce qui manque va sous « Non indiqué dans la source, à compléter par PHOVA. ».
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={actionClass}>Annuler</button>
            <button type="button" onClick={save} disabled={busy || !draft.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : isPdf ? (
        <button type="button" onClick={() => openDocument(sheet.fileId, sheet.title)}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <FileText className="h-4 w-4" aria-hidden="true" /> Ouvrir la fiche (PDF)
        </button>
      ) : parsed ? (
        <SheetBody parsed={parsed} />
      ) : hasSheet ? (
        <pre className="mt-4 whitespace-pre-wrap text-sm text-foreground">{sheet.text}</pre>
      ) : null}
    </section>
  );
}

function SheetBody({ parsed }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div>
        <p className="font-medium text-foreground">{parsed.title}</p>
        {parsed.meta.map((item, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            {item.label ? <><span className="text-subtle">{item.label} :</span> {item.value}</> : item.value}
          </p>
        ))}
      </div>
      {parsed.sections.map((section, i) => (
        <div key={i}>
          {section.heading && (
            <h3 className="mb-1.5 font-data text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">{section.heading}</h3>
          )}
          {section.rows && (
            <dl className="divide-y divide-border rounded-md border border-border">
              {section.rows.map((row, j) => (
                <div key={j} className="flex justify-between gap-4 px-3 py-1.5">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-medium tabular-nums text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {section.missing && (
            <dl className="divide-y divide-border rounded-md border border-warn/30">
              {section.missing.map((label, j) => (
                <div key={j} className="flex justify-between gap-4 px-3 py-1.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right text-warn">à compléter</dd>
                </div>
              ))}
            </dl>
          )}
          {section.paragraphs?.map((paragraph, j) => (
            <p key={j} className="leading-relaxed text-foreground/90">{paragraph}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// One model's sheet, loaded by itself: the pump page's « Fiche » tab, under the pump's own record
//   sheet ← GET /api/v1/specs/{model}
export function ModelSpecSheet({ model, canEdit = false }) {
  const [state, setState] = useState({ model: null, sheet: null, error: null });

  useEffect(() => {
    if (!model) return undefined;
    let cancelled = false;
    apiClient.get(`/api/v1/specs/${encodeURIComponent(model)}`)
      .then(({ data }) => !cancelled && setState({ model, sheet: data, error: null }))
      .catch((err) => {
        console.log("Error while fetching a spec sheet", err);
        if (!cancelled) setState({ model, sheet: null, error: serverMessage(err, "La fiche technique n'a pas pu être chargée.") });
      });
    return () => { cancelled = true; };
  }, [model]);

  if (!model) return null;
  const current = state.model === model ? state : null; // a result for the previous pump isn't shown
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Fiche technique {model}</p>
        <Link to={`/fiches?modele=${encodeURIComponent(model)}`} className="text-xs font-medium text-primary hover:underline">
          Toutes les fiches techniques →
        </Link>
      </div>
      {!current && <p className="text-sm text-muted-foreground">Chargement de la fiche technique…</p>}
      {current?.error && <p role="alert" className="text-sm text-crit">{current.error}</p>}
      {current?.sheet && (
        <SpecSheetCard sheet={current.sheet} canEdit={canEdit}
          onChanged={(saved) => setState({ model, sheet: saved, error: null })} />
      )}
    </div>
  );
}
