"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { useToast } from "@/components/shared/Toast";

interface SecurityStatus {
  totpEnabled: boolean;
  pinSet: boolean;
  backupCodesRemaining: number;
  mfaUpdatedAt: string | null;
}

const inputClass =
  "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

export default function SecurityPage() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // TOTP setup flow
  const [setupPassword, setSetupPassword] = useState("");
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  // PIN
  const [pinPassword, setPinPassword] = useState("");
  const [pinValue, setPinValue] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/security");
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function totpAction(action: string, extra: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/security/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast(json?.error || "Failed", "error");
        return null;
      }
      if (ok) toast(ok, "success");
      return json.data ?? {};
    } finally {
      setBusy(false);
    }
  }

  async function startSetup() {
    if (!setupPassword) return;
    const data = await totpAction("setup", { password: setupPassword }, "");
    if (data) {
      setQr({ qrDataUrl: data.qrDataUrl, secret: data.secret });
      setBackupCodes(null);
    }
  }

  async function confirmEnable() {
    const data = await totpAction("enable", { password: setupPassword, code: enableCode }, "Two-factor is on");
    if (data) {
      setBackupCodes(data.backupCodes);
      setQr(null);
      setEnableCode("");
      setSetupPassword("");
      load();
    }
  }

  async function disableTotp() {
    const pw = prompt("Confirm your password to turn off two-factor:");
    if (!pw) return;
    const ok = await totpAction("disable", { password: pw }, "Two-factor turned off");
    if (ok) { setBackupCodes(null); load(); }
  }

  async function regenBackup() {
    const pw = prompt("Confirm your password to generate new backup codes:");
    if (!pw) return;
    const data = await totpAction("regenerate-backup", { password: pw }, "New backup codes generated");
    if (data) { setBackupCodes(data.backupCodes); load(); }
  }

  async function pinAction(action: string, extra: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/security/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast(json?.error || "Failed", "error");
        return false;
      }
      toast(ok, "success");
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function setPin() {
    if (await pinAction("set", { password: pinPassword, pin: pinValue }, "PIN set")) {
      setPinPassword("");
      setPinValue("");
      load();
    }
  }

  async function clearPin() {
    const pw = prompt("Confirm your password to remove your PIN:");
    if (!pw) return;
    if (await pinAction("clear", { password: pw }, "PIN removed")) load();
  }

  function copyBackup() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <TopBar title="Security" subtitle="Protect your account with two-factor authentication and a login PIN" />
      <div className="px-4 lg:px-6 max-w-2xl space-y-4 pb-8">
        {/* Status banner */}
        <div
          className={`flex items-center gap-3 p-4 rounded-lg border ${
            status?.totpEnabled
              ? "bg-green-500/5 border-green-500/20"
              : "bg-yellow-500/5 border-yellow-500/20"
          }`}
        >
          {status?.totpEnabled ? (
            <ShieldCheck size={20} className="text-green-400 shrink-0" />
          ) : (
            <ShieldAlert size={20} className="text-yellow-400 shrink-0" />
          )}
          <div>
            <p className="text-sm text-white font-medium">
              {status?.totpEnabled ? "Two-factor authentication is ON" : "Two-factor authentication is off"}
            </p>
            <p className="text-xs text-bb-dim">
              {status?.totpEnabled
                ? `${status.backupCodesRemaining} backup codes remaining${status.pinSet ? " · login PIN set" : ""}`
                : "Add an authenticator app so a stolen password alone can't get in."}
            </p>
          </div>
        </div>

        {/* One-time backup codes display */}
        {backupCodes && (
          <div className="bg-bb-surface border border-bb-orange/40 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <AlertTriangle size={15} className="text-bb-orange" />
              Save these backup codes now — they are shown only once
            </p>
            <p className="text-xs text-bb-dim">
              Each code works once if you lose your authenticator. Store them somewhere safe (password manager).
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
          </div>
        )}

        {/* Authenticator (TOTP) */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Smartphone size={15} className="text-bb-orange" />
            Authenticator app (2FA)
          </h2>

          {status?.totpEnabled ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={regenBackup}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors disabled:opacity-50"
              >
                Generate new backup codes
              </button>
              <button
                onClick={disableTotp}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Turn off 2FA
              </button>
            </div>
          ) : qr ? (
            <div className="space-y-3">
              <p className="text-xs text-bb-muted">
                Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code it shows.
              </p>
              <div className="flex items-start gap-4 flex-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.qrDataUrl} alt="2FA QR code" width={180} height={180} className="rounded-md bg-white p-1" />
                <div className="text-xs text-bb-dim space-y-1">
                  <p>Can&apos;t scan? Enter this key manually:</p>
                  <code className="block break-all text-white bg-bb-black border border-bb-border rounded px-2 py-1">
                    {qr.secret}
                  </code>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={enableCode}
                  onChange={(e) => setEnableCode(e.target.value)}
                  placeholder="123456"
                  className={`${inputClass} max-w-[140px] text-center tracking-widest`}
                />
                <button
                  onClick={confirmEnable}
                  disabled={busy || enableCode.length < 6}
                  className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  Verify & turn on
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-bb-muted">Confirm your password to begin setup.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className={`${inputClass} max-w-xs`}
                />
                <button
                  onClick={startSetup}
                  disabled={busy || !setupPassword}
                  className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  Set up
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PIN */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound size={15} className="text-bb-orange" />
            Login PIN {status?.pinSet && <span className="text-[10px] text-green-400">· set</span>}
          </h2>
          <p className="text-xs text-bb-muted">
            An optional extra numeric code (4-8 digits) asked for at login in addition to your password.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="password"
              value={pinPassword}
              onChange={(e) => setPinPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              className={`${inputClass} max-w-[180px]`}
            />
            <input
              type="password"
              inputMode="numeric"
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              placeholder="New PIN"
              maxLength={8}
              className={`${inputClass} max-w-[120px] text-center tracking-widest`}
            />
            <button
              onClick={setPin}
              disabled={busy || !pinPassword || pinValue.length < 4}
              className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {status?.pinSet ? "Change PIN" : "Set PIN"}
            </button>
            {status?.pinSet && (
              <button
                onClick={clearPin}
                disabled={busy}
                className="px-3 py-2 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <p className="text-[10px] text-bb-dim">
          Lost your device and backup codes? An account owner can reset your 2FA. Sessions last 7 days.
        </p>
      </div>
    </div>
  );
}
