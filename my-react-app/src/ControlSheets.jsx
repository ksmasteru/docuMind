// Fiches qualité: the quality forms sent so far (control sheets, non-conformities, complaints, derogations),
// for the roles their forms let read them (CheckListTemplate.readRoles), plus each person's own.
// Opening one shows its PDF in place, to download.
//
//   list  ← GET /api/v1/submissions/shared        (SharedReport[], newest first)
//   sheet ← GET /api/v1/submissions/{id}/preview + /pdf   (SentReport, as after sending)
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileCheck, Loader2, RefreshCw, Search } from "lucide-react";
import Layout from "./Layout";
import { apiClient } from "./apiClient";
import { SentReport } from "./InspectionForm";
import { searchKey } from "./reportV2";

const STATUS = {
  CONFORME: { label: "Conforme", style: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  NON_CONFORME: { label: "Non conforme", style: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
};

export default function ControlSheets() {
  const [sheets, setSheets] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null); // the id shown with its PDF

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    apiClient
      .get("/api/v1/submissions/shared")
      .then(({ data }) => !cancelled && setSheets(data))
      .catch((err) => {
        console.log("error while loading the control sheets", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // by sheet, reference, serial / batch, inspector or date, accents ignored
  const shown = (sheets ?? []).filter((s) =>
    searchKey([s.title, s.paperReference, s.equipment, s.inspector, s.inspectionDate].join(" ")).includes(searchKey(query))
  );

  return (
    <Layout active="controls">
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-[#1A75BC] dark:text-[#5BC6E8]" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Fiches qualité</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Fiches de contrôle, non-conformités, réclamations et dérogations envoyées, les plus récentes en premier.
        </p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une fiche, un n° de série, un lot, un contrôleur…"
            aria-label="Rechercher une fiche"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {sheets === null && !failed && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-[#1A75BC]" /> Chargement…
          </div>
        )}
        {failed && (
          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-red-700 dark:text-red-300">
            La liste n'a pas pu être chargée.
            <button type="button" onClick={() => setAttempt((n) => n + 1)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </button>
          </div>
        )}
        {sheets !== null && shown.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {sheets.length === 0 ? "Aucune fiche envoyée pour l'instant." : "Aucune fiche ne correspond à la recherche."}
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {shown.map((s) => {
            // a form without a result (a complaint, a certificate) shows none
            const status = s.graded ? (STATUS[s.status] ?? { label: s.status, style: "" }) : null;
            const isOpen = open === s.id;
            return (
              <li key={s.id} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {s.title}
                      {s.paperReference && <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">{s.paperReference}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      {s.equipment} · {s.graded ? "contrôlé" : "rempli"} le {s.inspectionDate} par {s.inspector}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Envoyée le {s.submittedAt}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.style}`}>{status.label}</span>}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 pb-4 dark:border-slate-700">
                    <SentReport submissionId={s.id} status={s.graded ? s.status : null} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Layout>
  );
}
