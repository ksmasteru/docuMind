import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/apiClient";
import Layout from "../components/Layout";

const DEBOUNCE_MS = 350;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      abortControllerRef.current?.abort();
      return;
    }

    const timeoutId = setTimeout(() => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setStatus("loading");

      apiClient
        .get(`/v1/files/filter/${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(({ data }) => {
          setResults(data.files ?? []);
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
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Search documents</h1>

      <input
        type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by keyword…" autoFocus
        className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:border-indigo-400 dark:focus:ring-indigo-900"
      />

      <div className="mt-6">
        {status === "idle" && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Start typing to search your workspace.</p>
        )}
        {status === "loading" && (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-md bg-slate-100 dark:bg-slate-700" />
            ))}
          </ul>
        )}
        {status === "error" && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
            Search failed. Try again.
          </p>
        )}
        {status === "success" && results.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">No documents match "{query.trim()}".</p>
        )}
        {status === "success" && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((doc) => (
              <li key={doc.name}
                className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{doc.name}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Uploaded by {doc.userId} · {formatBytes(doc.size)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
