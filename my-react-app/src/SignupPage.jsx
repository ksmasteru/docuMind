import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "./apiClient";
import {useAuth} from "./AuthContext";
import Layout from "./Layout";
import { ThemeToggle } from "./Layout";
import PhovaLogo from "./PhovaLogo";
import { homeFor } from "./roleTabs";

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
        // each role opens on its first link (roleTabs.js), as after a login
        navigate(homeFor(data.Role), { replace: true });
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-ui text-foreground">
        <div className="fixed right-4 top-4">
          <ThemeToggle />
        </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <PhovaLogo className="mx-auto mb-4 h-14" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">GreenSense 4.0</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create your workspace account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-md border border-border bg-card p-6"
        >
          <div className="mb-4">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-foreground">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-ring focus:ring-2 focus:ring-ring/25"
              placeholder="you@company.com"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-ring focus:ring-2 focus:ring-ring/25"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
