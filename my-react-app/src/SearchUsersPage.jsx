import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import TopBaro from "./TopBaro";
import Layout from "./Layout";

export default function SearchUsersPage() {
  const { isAdmin, logout } = useAuth();
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
    <div className="min-h-screen bg-slate-50">
    <TopBaro isAdmin={isAdmin} onLogout={() => logout().then(() => navigate("/login"))} />

      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900">Workspace members</h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          autoFocus
          className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />

        <div className="mt-6">
          {status === "loading" && (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />
              ))}
            </ul>
          )}

          {status === "error" && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Couldn't load members. Try again.
            </p>
          )}

          {status === "success" && filtered.length === 0 && (
            <p className="text-sm text-slate-400">No members match "{query.trim()}".</p>
          )}

          {status === "success" && filtered.length > 0 && (
            <ul className="space-y-2">
              {filtered.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-sm font-medium text-slate-900">
                {user.name}
              </span>

              <div className="flex items-center gap-2">
                <button className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600"
                  onClick = {() => navigate("/uploadedFiles", {state : {user}})}>
                  uploads
                </button>

                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
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

