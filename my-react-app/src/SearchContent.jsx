import { useEffect, useRef, useState} from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import TopBaro from "./TopBaro";
import Layout from "./Layout";
import FilesList from "./FilesList";

const DEBOUNCE_MS = 350;
const SearchContent = () => {
    const { isAdmin, logout} = useAuth();
    const navigate = useNavigate();

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
            <div className="min-h-screen bg-slate-50">
                <TopBaro isAdmin={isAdmin} onLogout={() => logout().then(() => navigate("/login"))} />
                <main className="mx-auto max-w-2xl px-4 py-10">
                    <h1 className="text-xl font-semibold text-slate-900">Search by content</h1>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by content..."
                      autoFocus
                      className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <div className="mt-6">
                    
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
                    
                    {status === "success" && results.filesCount === 0 && (
                        <p className="text-sm text-slate-400">No documents match "{query.trim()}".</p>
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