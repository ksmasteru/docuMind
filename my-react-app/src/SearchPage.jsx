import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "./apiClient";
import Layout from "./Layout";
import FilesList from "./FilesList.jsx";
// the backend send takes /api/v1/files/searchkeyword
// and returns fileReponse
const DEBOUNCE_MS = 350;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [fullUrl, setFullUrl] = useState("");
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();
    setFullUrl("/api/v1/files/" + trimmed);
    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      setFullUrl("");
      // Cancel anything still in flight from a previous keystroke
      abortControllerRef.current?.abort();
      return;
    }

    const timeoutId = setTimeout(() => {
      // If the user kept typing, this kills the previous request rather than
      // letting it land after a newer one and overwrite fresher results.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus("loading");

      apiClient
        .get(fullUrl, {})
        .then(({ data }) => {
          setResults(data);
          setStatus("success");
        })
        .catch((err) => {
          if (err.code === "ERR_CANCELED") return;
          setStatus("error");
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <Layout active="search">
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Search documents</h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or tag…"
          autoFocus
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
        />

        <div className="mt-6">
          {status === "idle" && (
            <p className="text-sm text-slate-400 dark:text-slate-500">Start typing to search your workspace.</p>
          )}

          {status === "loading" && (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </ul>
          )}

          {status === "error" && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Search failed. Try again.
            </p>
          )}

          {status === "success" && results.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No documents match "{query.trim()}".</p>
          )}

          {status === "success" && results.filesCount > 0 && (
            <ul className="space-y-2">
              {<FilesList filesList={results.files}></FilesList>}
            </ul>
          )}
        </div>
      </main>
    </div>
    </Layout>
  );
}

function formatDate(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

