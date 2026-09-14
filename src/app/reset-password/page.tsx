"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inputClass =
    "w-full px-4 py-3 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange focus:border-transparent font-mono";

  // The emailed link carries the token in the #fragment (never sent to the server
  // in the page request). Read it, then clear it from the address bar.
  useEffect(() => {
    const t = window.location.hash.slice(1);
    setToken(t);
    if (t) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not reset password. Try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bb-black flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={200}
            height={60}
            priority
          />
        </div>

        {token === null ? null : done ? (
          <div className="space-y-4 text-center">
            <p className="text-white text-sm">Password updated</p>
            <p className="text-bb-muted text-sm">Sign in with your new password.</p>
            <Link
              href="/login"
              className="block w-full py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-display font-semibold rounded-md transition-colors"
            >
              Go to sign in
            </Link>
          </div>
        ) : !token ? (
          <div className="space-y-4 text-center">
            <p className="text-bb-muted text-sm">
              This reset link is incomplete. Open the link from your email again, or ask for a new one.
            </p>
            <Link href="/login" className="block text-bb-dim text-xs hover:text-white transition-colors">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-center text-bb-muted text-sm">Choose a new password</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              className={inputClass}
              autoFocus
              required
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className={inputClass}
              required
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-display font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Set new password"}
            </button>
            <Link href="/login" className="block text-center text-bb-dim text-xs hover:text-white transition-colors">
              Back to sign in
            </Link>
          </form>
        )}

        <p className="text-center text-bb-dim text-xs">
          Blok Blok Studio Command Center
        </p>
      </div>
    </div>
  );
}
