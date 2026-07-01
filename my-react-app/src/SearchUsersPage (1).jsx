import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import Layout from "../components/Layout";

export default function SearchUsersPage() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    apiClient
      .get("/v1/users")
      .then(({ data }) => {
        console.log("[users response]", data); // TEMPORARY
        setUsers(data.users ?? []);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, []);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(trimmed));
  }, [users, query]);

  return (
    <Layout active="users">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Workspace members</h1>

      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by name…" autoFocus
        className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:border-indigo-400 dark:focus:ring-indigo-900"
      />

      <div className="mt-6">
        {status === "loading" && (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-12 animate-pulse rounded-md bg-slate-100 dark:bg-slate-700" />
            ))}
          </ul>
        )}
        {status === "error" && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
            Couldn't load members. Try again.
          </p>
        )}
        {status === "success" && filtered.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {query.trim() ? `No members match "${query.trim()}".` : "No members found."}
          </p>
        )}
        {status === "success" && filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map((user) => (
              <li key={user.id}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {user.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
