import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { ThemeToggle } from "../components/Layout";

export default function SignupPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/register", { name, email, password, role: "MEMBER" });
      navigate("/login", { state: { justRegistered: true, email } });
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create that account. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:border-indigo-400 dark:focus:ring-indigo-900";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">DocuMind</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create your workspace account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-4">
            <label htmlFor="name" className={labelClass}>Name</label>
            <input id="name" type="text" required value={name}
              onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="mb-4">
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" className={inputClass} />
          </div>
          <div className="mb-5">
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" type="password" required minLength={8}
              autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters" className={inputClass} />
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          <button type="submit" disabled={isSubmitting}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-600">
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
