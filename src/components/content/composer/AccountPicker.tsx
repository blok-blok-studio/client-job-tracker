"use client";

import { AlertTriangle, Check, ExternalLink, Hand, Link2, Loader2, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import PlatformIcon from "../PlatformIcon";
import { Avatar, Card } from "./ui";
import { platformName, type ComposerAccount } from "./types";
import RedNoteIcon from "./RedNoteIcon";

const HEALTH_BADGE: Record<string, { label: string; className: string } | null> = {
  ok: null,
  unknown: null,
  expiring: { label: "Expires soon", className: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  expired: { label: "Expired", className: "text-red-300 bg-red-500/10 border-red-500/30" },
  needs_reconnect: { label: "Reconnect", className: "text-red-300 bg-red-500/10 border-red-500/30" },
};

const PLATFORM_ORDER = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "REDNOTE", "FACEBOOK", "LINKEDIN", "THREADS", "TWITTER"];

export function AccountIcon({ platform, size = 12 }: { platform: string; size?: number }) {
  return platform === "REDNOTE" ? <RedNoteIcon size={size} /> : <PlatformIcon platform={platform} size={size} />;
}

interface Props {
  clientId: string;
  accounts: ComposerAccount[];
  selected: string[];
  locked: string[];
  loading: boolean;
  onToggle: (key: string) => void;
  onRefresh: () => void;
}

export default function AccountPicker({ clientId, accounts, selected, locked, loading, onToggle, onRefresh }: Props) {
  const sorted = [...accounts].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform) || a.label.localeCompare(b.label)
  );
  const connectedCount = accounts.filter((a) => !a.manualOnly).length;

  return (
    <Card
      title="Post to"
      icon={<Users size={13} />}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={!clientId || loading}
          className="inline-flex items-center gap-1 text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors disabled:opacity-40"
          aria-label="Refresh connected accounts"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
        </button>
      }
    >
      {!clientId ? (
        <p className="text-sm text-bb-dim">Pick a client to see their connected accounts.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sorted.map((account) => {
              const isSelected = selected.includes(account.key);
              const isLocked = locked.includes(account.key);
              const badge = HEALTH_BADGE[account.health];
              return (
                <div
                  key={account.key}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                    isSelected ? "border-bb-orange/70 bg-bb-orange/10" : "border-bb-border bg-bb-elevated hover:border-bb-muted/40"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => !isLocked && onToggle(account.key)}
                    disabled={isLocked}
                    aria-pressed={isSelected}
                    title={isLocked ? "Already published or publishing; it can't be removed" : undefined}
                    className="absolute inset-0 rounded-lg cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-orange/50"
                    aria-label={`${isSelected ? "Remove" : "Add"} ${platformName(account.platform)} ${account.label}`}
                  />
                  <div className="relative pointer-events-none">
                    <Avatar src={account.avatarUrl} name={account.label} size={32} />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-bb-surface p-0.5 border border-bb-border">
                      <AccountIcon platform={account.platform} size={10} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pointer-events-none">
                    <p className="text-sm text-white truncate">{account.manualOnly ? "RedNote" : account.label}</p>
                    <p className="text-[11px] text-bb-dim truncate flex items-center gap-1">
                      {account.manualOnly ? (
                        <>
                          <Hand size={10} /> Posted by hand from a phone
                        </>
                      ) : (
                        platformName(account.platform)
                      )}
                    </p>
                  </div>
                  {badge && (
                    <span className={cn("pointer-events-none text-[10px] rounded-full border px-1.5 py-0.5 shrink-0", badge.className)}>
                      {badge.label}
                    </span>
                  )}
                  <span
                    className={cn(
                      "pointer-events-none w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                      isSelected ? "bg-bb-orange border-bb-orange text-white" : "border-bb-border"
                    )}
                  >
                    {isSelected && <Check size={12} />}
                  </span>
                  {isSelected && badge && account.reconnectProvider && (
                    <a
                      href={`/api/oauth/${account.reconnectProvider}/authorize?clientId=${clientId}&returnTo=${encodeURIComponent(`/clients/${clientId}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="relative z-[1] inline-flex items-center gap-0.5 text-[11px] text-bb-orange hover:text-bb-orange-light"
                      title="Opens in a new tab. Come back and press Refresh."
                    >
                      Fix <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          {connectedCount === 0 && !loading && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-bb-muted">
                No social accounts connected for this client yet.{" "}
                <a href={`/clients/${clientId}`} target="_blank" rel="noreferrer" className="text-bb-orange hover:text-bb-orange-light inline-flex items-center gap-0.5">
                  Connect one <Link2 size={10} />
                </a>{" "}
                then press Refresh. You can still plan RedNote posts.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
