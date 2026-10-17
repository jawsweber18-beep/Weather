import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && user && !user.isDevFallback) return <Navigate to="/" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.signIn.email({
      email: email.trim(),
      password,
      rememberMe: true,
    });
    if (failure) {
      setError(
        failure.status === 401
          ? "That email and password don't match."
          : "Sign-in didn't go through. Try again.",
      );
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <main className="w-full max-w-sm">
        <div className="h-1 rounded-full bg-accent" />
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-card bg-surface p-6 shadow-card">
          <div>
            <h1 className="font-display text-3xl tracking-tight">Quorum</h1>
            <p className="mt-1 text-sm text-muted">Sign in to see your forecasts.</p>
          </div>
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base"
            />
          </label>
          {error ? (
            <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-full bg-accent px-4 font-medium text-surface disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-xs text-muted">Accounts are invite-only. Ask the owner for access.</p>
        </form>
      </main>
    </div>
  );
}
