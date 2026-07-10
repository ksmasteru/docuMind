import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import Layout from "./Layout";

export default function SearchUsersPage() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading"); // loading | success | error

useEffect(() => {
  const fetchUsers = async () => {
    try {
      const { data } = await apiClient.get("/api/v1/users");
      // Note: Changed data.user to data.users to match your first prompt
      setUsers(data.users ?? []);
      setStatus("success");
    } catch (err) {
      setStatus("error");
    }
  };

  fetchUsers();
}, []);

  // UserController has no /filter endpoint like DocumentController does, so
  // this filters the already-fetched list in the browser rather than
  // hitting the server on every keystroke. Fine for a small team; if the
  // user list grows large, this is the place a real backend search would
  // replace it.

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(trimmed));
  }, [users, query]);

  return (
    <Layout active="users">
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Workspace members</h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          autoFocus
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-900"
        />

        <div className="mt-6">
          {status === "loading" && (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-12 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </ul>
          )}

          {status === "error" && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Couldn't load members. Try again.
            </p>
          )}

          {status === "success" && filtered.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No members match "{query.trim()}".</p>
          )}

          {status === "success" && filtered.length > 0 && (
            <ul className="space-y-2">
              {filtered.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {user.name}
              </span>

              <div className="flex items-center gap-2">
                <button className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  onClick = {() => navigate("/uploadedFiles", {state : {user}})}>
                  uploads
                </button>

                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {user.role}
                </span>
              </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
    </Layout>
  );
}

