import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import TopBaro from "./TopBaro";
import Layout from "./Layout";

export default function AdminPage() {
  const { logout, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return; // skip the fetch entirely if we're about to redirect below
    apiClient
      .get("/api/v1/users")
      .then(({ data }) => {
        setUsers(data.users ?? []);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [isAdmin]);

  // Wait for session restore to complete before deciding anything.
  // Without this guard, isAdmin is false while isLoading is true (user is null
  // before the silent refresh resolves), causing an immediate redirect to
  // /users before auth state is actually known — which is exactly the symptom.
  if (isLoading) return null;

  // This is a UI convenience, not a security boundary. UserController's
  // deleteUser has no @PreAuthorize, so a non-admin hitting the API directly
  // (curl, devtools, Postman) can still call it right now. Hiding the
  // button here doesn't fix that — it needs @PreAuthorize("hasRole('ADMIN')")
  // on the backend method.
  if (!isAdmin) {
    return <Navigate to="/users" replace />;
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete ${user.name}? This can't be undone.`)) return;

    setDeletingId(user.email);
    setDeleteError(null);

    try {
      await apiClient.delete(`/api/v1/users/${user.email}`);
      setUsers((prev) => prev.filter((u) => u.email !== user.email));
    } catch (err) {
      setDeleteError(`Couldn't delete ${user.name}. ${err.response?.status === 404 ? "Already gone?" : "Try again."}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Layout active="admin">
    <div className="min-h-screen bg-slate-50">
      <TopBaro isAdmin={isAdmin} onLogout={() => logout().then(() => navigate("/login"))} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900">Manage members</h1>
        <p className="mt-1 text-sm text-slate-500">Admin only — deleting a user is permanent.</p>

        {deleteError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {deleteError}
          </p>
        )}

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

          {status === "success" && (
            <ul className="space-y-2">
              {users.map((user) => (
                <li
                  key={user.email}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-900">{user.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      {user.role}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(user)}
                    disabled={deletingId === user.email}
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === user.email ? "Deleting…" : "Delete"}
                  </button>
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
