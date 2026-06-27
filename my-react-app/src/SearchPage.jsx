import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";

const DEBOUNCE_MS = 350;

export default function SearchPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setStatus("idle");
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
        .get("/documents", { params: { search: trimmed }, signal: controller.signal })
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
    <div className="min-h-screen bg-slate-50">
      <TopBar onLogout={() => logout().then(() => navigate("/login"))} />

      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900">Search documents</h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or tag…"
          autoFocus
          className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />

        <div className="mt-6">
          {status === "idle" && (
            <p className="text-sm text-slate-400">Start typing to search your workspace.</p>
          )}

          {status === "loading" && (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-md bg-slate-100" />
              ))}
            </ul>
          )}

          {status === "error" && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Search failed. Try again.
            </p>
          )}

          {status === "success" && results.length === 0 && (
            <p className="text-sm text-slate-400">No documents match "{query.trim()}".</p>
          )}

          {status === "success" && results.length > 0 && (
            <ul className="space-y-2">
              {results.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm font-medium text-slate-900">{doc.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {doc.uploaderEmail} · {formatDate(doc.uploadedAt)} ·{" "}
                    {formatBytes(doc.sizeBytes)}
                  </p>
                  {doc.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {doc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
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

function TopBar({ onLogout }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <Link to="/search" className="text-sm font-semibold text-slate-900">
        DocuMind
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link to="/search" className="text-slate-900">
          Search
        </Link>
        <Link to="/upload" className="text-slate-500 hover:text-slate-900">
          Upload
        </Link>
        <button onClick={onLogout} className="text-slate-500 hover:text-slate-900">
          Sign out
        </button>
      </nav>
    </header>
  );
}
