import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import {useAuth} from "./AuthContext";
import Layout from "./Layout";
import { ThemeToggle } from "./Layout";

export default function SignupPage() {
  
  const navigate = useNavigate();
  const { login } = useAuth(); 
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
      const result = await apiClient.post("/api/auth/register", {"name" : name, "email" : email, "password" : password});
      //console.log(`result is : ${JSON.stringify(result)}`);
      if (result.data.users) // hna check if registered.
      {
        const data = await login(email,password);
        console.log(`result of login is : ${JSON.stringify(data)}`);
        navigate("/search", { replace: true });
      }
    }
     catch (err) {
      // AuthController.register() returns { error: "<message>" } on failure
      setError(err.response?.data?.error || "Couldn't create that account. Try again.");
      console.log(err.getMessage());
    }
    finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="fixed right-4 top-4">
          <ThemeToggle />
        </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">DocuMind</h1>
          <p className="mt-1 text-sm text-slate-500">Create your workspace account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="you@company.com"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
