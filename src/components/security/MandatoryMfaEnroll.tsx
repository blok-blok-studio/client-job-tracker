"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone, AlertTriangle, Copy, Check, Loader2, ExternalLink } from "lucide-react";

// Full-screen, blocking two-factor enrollment. The dashboard layout renders this
// instead of the app for any team member who hasn't set up an authenticator, so
// 2FA is mandatory without ever locking anyone out at login.
export default function MandatoryMfaEnroll({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "scan" | "backup">("password");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const inputClass =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/security/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error || "Couldn't start setup");
        return;
      }
      setQr({ qrDataUrl: json.data.qrDataUrl, secret: json.data.secret, uri: json.data.uri });
      setStep("scan");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/security/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", password, code }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error || "That code didn't match");
        return;
      }
      setBackupCodes(json.data.backupCodes);
      setStep("backup");
    } finally {
      setBusy(false);
    }
  }

  function copyBackup() {
    navigator.clipboard.writeText(backupCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyKey() {
    if (!qr) return;
    navigator.clipboard.writeText(qr.secret).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <ShieldCheck size={32} className="text-bb-orange mx-auto" />
          <h1 className="text-xl font-semibold text-white">Two-factor authentication required</h1>
          <p className="text-sm text-bb-dim">
            Every account must have an authenticator app before using the Command Center. This takes about a
            minute — set it up for <span className="text-white">{email}</span>.
          </p>
        </div>

        <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
          {step === "password" && (
            <form onSubmit={startSetup} className="space-y-3">
              <label className="block text-xs text-bb-muted">Confirm your password to begin</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className={inputClass}
                autoFocus
                required
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={busy || !password}
                className="w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />}
                Begin setup
              </button>
            </form>
          )}

          {step === "scan" && qr && (
            <form onSubmit={confirmEnable} className="space-y-3">
              {/* On this phone: one tap adds the account to the authenticator app */}
              <a
                href={qr.uri}
                className="sm:hidden flex items-center justify-center gap-2 w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-semibold rounded-md transition-colors"
              >
                <ExternalLink size={15} />
                Add to my authenticator app
              </a>
              <p className="sm:hidden text-center text-[11px] text-bb-dim">
                Tap above if your authenticator app is on this phone. On a computer, scan the code below.
              </p>

              <p className="hidden sm:block text-xs text-bb-muted">
                Scan with Google Authenticator, Authy, or 1Password, then enter the 6-digit code.
              </p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.qrDataUrl} alt="2FA QR code" width={180} height={180} className="rounded-md bg-white p-1" />
              </div>

              {/* Manual key — works everywhere, especially if the tap/scan won't */}
              <div className="space-y-1">
                <p className="text-[11px] text-bb-dim">Or enter this key manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-white bg-bb-black border border-bb-border rounded px-2 py-1.5 text-xs">
                    {qr.secret}
                  </code>
                  <button
                    type="button"
                    onClick={copyKey}
                    className="shrink-0 p-2 rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors"
                    aria-label="Copy key"
                  >
                    {copiedKey ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter the 6-digit code"
                className={`${inputClass} text-center tracking-widest`}
                autoFocus
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
              >
                {busy ? "Verifying..." : "Verify & turn on"}
              </button>
            </form>
          )}

          {step === "backup" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <AlertTriangle size={15} className="text-bb-orange" />
                Save your backup codes
              </p>
              <p className="text-xs text-bb-dim">
                Each works once if you lose your phone. Store them in your password manager — they are shown
                only now.
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-sm text-white bg-bb-black border border-bb-border rounded-md p-3">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <button
                onClick={copyBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors"
              >
                {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy all"}
              </button>
              <button
                onClick={() => router.refresh()}
                className="w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-semibold rounded-md transition-colors"
              >
                I&apos;ve saved them — enter the Command Center
              </button>
            </div>
          )}
        </div>

        <button onClick={logout} className="w-full text-bb-dim text-xs hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </div>
  );
}
