import { useEffect, useRef, useState} from "react";
import { Link } from "react-router-dom";
import { apiClient } from "./apiClient";
import Layout from "./Layout";
import FilesList from "./FilesList";

const DEBOUNCE_MS = 350;
const SearchContent = () => {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState({ files: [], filesCount: 0 });
    const [status, setStatus] = useState("idle"); // idle | loading | success | error
    const [fullUrl, setFullUrl] = useState("");
    const abortControllerRef = useRef(null);
    
    useEffect(() => {
        const trimmed = query.trim();
        const url = "/api/v1/files/filter/" + encodeURIComponent(trimmed);
        setFullUrl(trimmed ? url : "");

        if (!trimmed){
            setResults({ files: [], filesCount: 0 });
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
                .get(url, { signal: controller.signal })
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
        <Layout active="/searchContent">
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
                <main className="mx-auto max-w-2xl px-4 py-10">
                    <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Search by content</h1>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by content..."
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
                        <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                          Search failed. Try again.
                        </p>
                    )}

                    {status === "success" && results.filesCount === 0 && (
                        <p className="text-sm text-slate-400 dark:text-slate-500">No documents match "{query.trim()}".</p>
                    )}
                    
                    {status === "success" && results.filesCount > 0 && (
                        <ul className="space-y-2">
                          <FilesList filesList={results.files} />
                        </ul>
                    )}

                    </div>
                </main>
            </div>
        </Layout>
    );
}

export default SearchContent;