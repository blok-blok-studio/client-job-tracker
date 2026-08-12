"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Second-factor step
  const [stage, setStage] = useState<"password" | "mfa">("password");
  const [mfaToken, setMfaToken] = useState("");
  const [methods, setMethods] = useState<{ totp: boolean; pin: boolean }>({ totp: false, pin: false });
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");

  const inputClass =
    "w-full px-4 py-3 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange focus:border-transparent font-mono";

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setMethods(data.methods);
        setStage("mfa");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken, code, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        // A truly expired token sends the user back to step one
        if (res.status === 401 && /sign in again/i.test(data.error || "")) {
          setStage("password");
          setPassword("");
          setCode("");
          setPin("");
        }
        return;
      }
      router.push("/");
      router.refresh();
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

        {stage === "password" ? (
          <form onSubmit={handlePassword} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="username"
              className={inputClass}
              autoFocus
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className={inputClass}
              required
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-display font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Authenticating..." : "Enter Command Center"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <p className="text-center text-bb-muted text-sm">
              Two-factor verification
            </p>
            {methods.totp && (
              <div>
                <label className="block text-xs text-bb-dim mb-1 text-center">
                  Code from your authenticator app (or a backup code)
                </label>
                <input
                  type="text"
                  inputMode="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  className={`${inputClass} text-center tracking-widest`}
                  autoFocus
                />
              </div>
            )}
            {methods.pin && (
              <div>
                <label className="block text-xs text-bb-dim mb-1 text-center">Your PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  autoComplete="off"
                  className={`${inputClass} text-center tracking-widest`}
                  autoFocus={!methods.totp}
                />
              </div>
            )}
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || (methods.totp && !code) || (methods.pin && !pin)}
              className="w-full py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-display font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying..." : "Verify & Enter"}
            </button>
            <button
              type="button"
              onClick={() => { setStage("password"); setError(""); setCode(""); setPin(""); }}
              className="w-full text-bb-dim text-xs hover:text-white transition-colors"
            >
              Back
            </button>
          </form>
        )}

        <p className="text-center text-bb-dim text-xs">
          Blok Blok Studio Command Center
        </p>
      </div>
    </div>
  );
}
