import { useEffect, useMemo, useState } from "react";
import { apiClient } from "./apiClient";
import Layout from "./Layout";
import FilesList from "./FilesList.jsx";

// « Documents »: the whole library, for every role (plan_documents_list.md). GET /api/v1/files gives every
// document once, when the page opens; the box then filters that list as you type, without a request per key.

// « Procédure » finds « procedure », « OTW fiche » finds « Fiche technique OTW »
const fold = (text) => (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [attempt, setAttempt] = useState(0); // « Réessayer » loads the list again

  const retry = () => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get("/api/v1/files", { signal: controller.signal })
      .then(({ data }) => {
        setFiles(data?.files ?? []);
        setStatus("success");
      })
      .catch((err) => {
        if (err.code === "ERR_CANCELED") return;
        console.log("Error while fetching the documents", err);
        setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  const trimmed = query.trim();
  // every word typed is somewhere in the name, in any order
  const shown = useMemo(() => {
    const words = fold(trimmed).split(/\s+/).filter(Boolean);
    return words.length ? files.filter((file) => words.every((word) => fold(file.name).includes(word))) : files;
  }, [files, trimmed]);

  const count = (n) => `${n} document${n > 1 ? "s" : ""}`;

  return (
    <Layout active="search">
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Documents</h1>
        {status === "success" && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {trimmed && files.length > 0 ? `${shown.length} sur ${count(files.length)}` : count(files.length)}
          </p>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un document par son nom…"
          aria-label="Rechercher un document"
          autoFocus
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
        />

        <div className="mt-6">
          {status === "loading" && (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </ul>
          )}

          {status === "error" && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              <p>La liste des documents n'a pas pu être chargée.</p>
              <button type="button" onClick={retry}
                className="rounded-lg px-2 py-1 font-medium hover:bg-red-100 dark:hover:bg-red-900">
                Réessayer
              </button>
            </div>
          )}

          {status === "success" && files.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">Aucun document pour l'instant.</p>
          )}

          {status === "success" && files.length > 0 && shown.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">Aucun document ne correspond à « {trimmed} ».</p>
          )}

          {status === "success" && shown.length > 0 && (
            <ul className="space-y-2">
              <FilesList filesList={shown} />
            </ul>
          )}
        </div>
      </main>
    </div>
    </Layout>
  );
}
