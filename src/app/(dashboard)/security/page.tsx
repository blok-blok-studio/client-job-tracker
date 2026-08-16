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
  ExternalLink,
  UserRound,
  Camera,
  Mail,
  Loader2,
  X,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { useToast } from "@/components/shared/Toast";

interface SecurityStatus {
  totpEnabled: boolean;
  pinSet: boolean;
  backupCodesRemaining: number;
  mfaUpdatedAt: string | null;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
  color: string | null;
  avatarUrl: string | null;
  jobRole: string | null;
}

const inputClass =
  "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

export default function SecurityPage() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Profile
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);

  // Change password
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");

  // TOTP setup flow
  const [setupPassword, setSetupPassword] = useState("");
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string; uri: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

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

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
        setNameDraft(json.data.name);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadProfile();
  }, [load, loadProfile]);

  async function profileAction(payload: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast(json?.error || "Failed", "error");
        return false;
      }
      if (ok) toast(ok, "success");
      await loadProfile();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || !profile || trimmed === profile.name) return;
    await profileAction({ action: "update", name: trimmed }, "Name updated");
  }

  async function saveColor(color: string) {
    setProfile((p) => (p ? { ...p, color } : p));
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", color }),
    }).catch(() => {});
  }

  async function uploadPhoto(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("Choose an image file", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("Photo must be under 8MB", "error");
      return;
    }
    setUploadingPhoto(true);
    try {
      const res = await fetch(`/api/uploads/stream?filename=${encodeURIComponent(file.name)}`, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.urls?.[0]) {
        toast(json?.error || "Upload failed", "error");
        return;
      }
      await profileAction({ action: "update", avatarUrl: json.urls[0] }, "Photo updated");
    } catch {
      toast("Upload failed", "error");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    await profileAction({ action: "update", avatarUrl: "" }, "Photo removed");
  }

  async function changeEmail() {
    if (
      await profileAction(
        { action: "email", email: emailDraft, password: emailPassword },
        "Email updated — use it next time you log in"
      )
    ) {
      setEmailDraft("");
      setEmailPassword("");
      setEmailOpen(false);
    }
  }

  async function changePassword() {
    if (pwNew !== pwConfirm) {
      toast("New passwords don't match", "error");
      return;
    }
    if (
      await profileAction(
        { action: "password", currentPassword: pwCurrent, newPassword: pwNew },
        "Password changed"
      )
    ) {
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
    }
  }

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
      setQr({ qrDataUrl: data.qrDataUrl, secret: data.secret, uri: data.uri });
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
    const pw = prompt("Confirm your password to reset two-factor (you'll set it up again on the next screen):");
    if (!pw) return;
    const ok = await totpAction("disable", { password: pw }, "Reset — set up your authenticator again");
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

  function copyKey() {
    if (!qr) return;
    navigator.clipboard.writeText(qr.secret).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    });
  }

  return (
    <div>
      <TopBar title="Account" subtitle="Your profile, login details, and security settings" />
      <div className="px-4 lg:px-6 max-w-2xl space-y-4 pb-8">
        {/* Profile */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <UserRound size={15} className="text-bb-orange" />
            Profile
          </h2>

          <div className="flex items-center gap-4">
            {/* Photo — click to upload */}
            <label
              className="relative w-16 h-16 rounded-full shrink-0 cursor-pointer overflow-hidden ring-1 ring-white/10 hover:ring-bb-orange/60 transition-shadow flex items-center justify-center group"
              style={{ backgroundColor: profile?.color || "#1E1E1E" }}
              title="Change profile photo"
            >
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt={profile.name} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span className={`text-xl font-semibold ${profile?.color ? "text-black/80" : "text-white"}`}>
                  {profile?.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              )}
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingPhoto ? (
                  <Loader2 size={18} className="text-white animate-spin" />
                ) : (
                  <Camera size={18} className="text-white" />
                )}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingPhoto}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto(f);
                  e.target.value = "";
                }}
              />
            </label>

            <div className="min-w-0 space-y-1.5">
              <p className="text-xs text-bb-dim">
                Tap the photo to change it. Shown next to your tasks and comments.
              </p>
              <div className="flex items-center gap-2">
                {/* Accent color */}
                <label
                  className="relative w-6 h-6 rounded-md cursor-pointer ring-1 ring-white/10 hover:ring-bb-orange/60 transition-shadow"
                  style={{ backgroundColor: profile?.color || "#FF6B00" }}
                  title="Profile color"
                >
                  <input
                    type="color"
                    value={profile?.color || "#FF6B00"}
                    onChange={(e) => saveColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Profile color"
                  />
                </label>
                <span className="text-[11px] text-bb-dim">Accent color</span>
                {profile?.avatarUrl && (
                  <button
                    onClick={removePhoto}
                    disabled={busy || uploadingPhoto}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-bb-border text-bb-muted hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <X size={11} /> Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] text-bb-dim mb-1">Display name</label>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={80}
                className={inputClass}
              />
            </div>
            <button
              onClick={saveName}
              disabled={busy || !nameDraft.trim() || nameDraft.trim() === profile?.name}
              className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        {/* Login email */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Mail size={15} className="text-bb-orange" />
            Login email
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm text-white bg-bb-black border border-bb-border rounded px-2.5 py-1.5">
              {profile?.email || "…"}
            </code>
            <button
              onClick={() => setEmailOpen((v) => !v)}
              className="px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors"
            >
              {emailOpen ? "Cancel" : "Change email"}
            </button>
          </div>
          {emailOpen && (
            <div className="space-y-2">
              <p className="text-xs text-bb-dim">
                You&apos;ll log in with the new address next time. Confirm your password to change it.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="new@email.com"
                  autoComplete="email"
                  className={`${inputClass} max-w-[220px]`}
                />
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className={`${inputClass} max-w-[180px]`}
                />
                <button
                  onClick={changeEmail}
                  disabled={busy || !emailDraft || !emailPassword}
                  className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  Update email
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Change password */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound size={15} className="text-bb-orange" />
            Change password
          </h2>
          <div className="grid sm:grid-cols-3 gap-2">
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className={inputClass}
            />
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="New password (8+ chars)"
              autoComplete="new-password"
              className={inputClass}
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <button
            onClick={changePassword}
            disabled={busy || !pwCurrent || pwNew.length < 8 || !pwConfirm}
            className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            Change password
          </button>
        </div>

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
            <div className="space-y-2">
              <p className="text-xs text-bb-dim">
                2FA is required for every account. You can generate fresh backup codes, or reset it to move
                to a new phone — resetting sends you back to the setup screen right away.
              </p>
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
                  className="px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors disabled:opacity-50"
                >
                  Reset / new phone
                </button>
              </div>
            </div>
          ) : qr ? (
            <div className="space-y-3">
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
                Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code it shows.
              </p>
              <div className="flex items-start gap-4 flex-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.qrDataUrl} alt="2FA QR code" width={180} height={180} className="rounded-md bg-white p-1" />
                <div className="text-xs text-bb-dim space-y-1 min-w-0">
                  <p>Or enter this key manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all text-white bg-bb-black border border-bb-border rounded px-2 py-1 min-w-0">
                      {qr.secret}
                    </code>
                    <button
                      type="button"
                      onClick={copyKey}
                      className="shrink-0 p-1.5 rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors"
                      aria-label="Copy key"
                    >
                      {copiedKey ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={enableCode}
                  onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ""))}
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
