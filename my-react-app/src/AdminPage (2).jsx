import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";

export default function AdminPage() {
  const { user, isAdmin, isLoading } = useAuth();

  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    apiClient
      .get("/v1/users")
      .then(({ data }) => {
        setUsers(data.users ?? []);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [isAdmin]);

  // TEMPORARY — remove once admin page is confirmed working
  console.log("[AdminPage] user:", user, "| isAdmin:", isAdmin);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/users" replace />;

  async function handleDelete(u) {
    if (!window.confirm(`Delete ${u.name}? This can't be undone.`)) return;
    setDeletingId(u.id);
    setDeleteError(null);
    try {
      await apiClient.delete(`/v1/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setDeleteError(
        `Couldn't delete ${u.name}. ${err.response?.status === 404 ? "Already gone?" : "Try again."}`
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Layout active="admin">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Manage members</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Admin only — deleting a user is permanent.</p>

      {deleteError && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {deleteError}
        </p>
      )}

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
        {status === "success" && (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{u.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {u.role}
                  </span>
                </div>
                <button onClick={() => handleDelete(u)} disabled={deletingId === u.id}
                  className="text-sm font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300">
                  {deletingId === u.id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
