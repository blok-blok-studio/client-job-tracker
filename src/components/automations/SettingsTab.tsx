"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";
import { readJson, friendlyError } from "@/lib/fetch-json";

interface TierRow {
  label: string;
  revisions: string;
  supportMonths: number;
  timeline: string;
  timelineUpperWeeks: number | null;
  scopeBullets: string[];
}

export interface LifecycleSettings {
  bookingLink: string;
  assetChecklistLink: string;
  liveEmails: boolean;
  tierConstants: Record<string, TierRow>;
  isOwner: boolean;
}

export default function SettingsTab({
  settings,
  onChanged,
}: {
  settings: LifecycleSettings;
  onChanged: () => void;
}) {
  const [bookingLink, setBookingLink] = useState(settings.bookingLink);
  const [checklistLink, setChecklistLink] = useState(settings.assetChecklistLink);
  const [tiers, setTiers] = useState(settings.tierConstants);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const isOwner = settings.isOwner;

  const put = async (payload: Record<string, unknown>, msg: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/lifecycle/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJson(res, "Couldn't save those settings. Please try again.");
      if (result.ok) {
        toast(msg, "success");
        onChanged();
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Couldn't save those settings. Please try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  const setTier = (key: string, patch: Partial<TierRow>) =>
    setTiers((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Master switch */}
      <div
        className={cn(
          "border rounded-lg p-4 flex items-start gap-3",
          settings.liveEmails ? "bg-green-500/10 border-green-500/30" : "bg-bb-surface border-bb-border"
        )}
      >
        <ShieldAlert size={18} className={settings.liveEmails ? "text-green-400" : "text-bb-orange"} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            Live client emails: {settings.liveEmails ? "ON" : "OFF"}
          </p>
          <p className="text-xs text-bb-dim mt-0.5">
            While off, every automated email is recorded as a dry run on the client&apos;s timeline and
            nothing reaches a real inbox. Internal tasks and drafts still work. Owner only.
          </p>
        </div>
        <button
          onClick={() => {
            if (!isOwner) return;
            const turningOn = !settings.liveEmails;
            if (
              !turningOn ||
              confirm(
                "Turn live emails ON? Enabled sequences will start sending real emails to clients on schedule."
              )
            ) {
              put({ liveEmails: turningOn }, `Live emails ${turningOn ? "ON" : "OFF"}`);
            }
          }}
          disabled={!isOwner || saving}
          title={isOwner ? undefined : "Owner only"}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0",
            settings.liveEmails
              ? "bg-bb-elevated hover:bg-bb-border"
              : "bg-bb-orange hover:bg-bb-orange-light text-white",
            !isOwner && "opacity-40 cursor-not-allowed"
          )}
        >
          {settings.liveEmails ? "Turn off" : "Turn on"}
        </button>
      </div>

      {/* Links */}
      <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Links merged into emails</h3>
        <div>
          <label className="text-xs text-bb-dim uppercase tracking-wide">
            Booking link ({"{{booking_link}}"})
          </label>
          <input
            value={bookingLink}
            onChange={(e) => setBookingLink(e.target.value)}
            placeholder="https://cal.com/…"
            className="mt-1 w-full bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-sm focus:border-bb-orange outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-bb-dim uppercase tracking-wide">
            Asset checklist fallback link (client upload portal wins when the client has one)
          </label>
          <input
            value={checklistLink}
            onChange={(e) => setChecklistLink(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-sm focus:border-bb-orange outline-none"
          />
        </div>
        <button
          onClick={() => put({ bookingLink, assetChecklistLink: checklistLink }, "Links saved")}
          disabled={saving}
          className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors"
        >
          Save links
        </button>
        {!bookingLink && (
          <p className="text-xs text-yellow-400">
            No booking link set — emails that use {"{{booking_link}}"} (A1, A2, E2) will refuse to send
            until this is filled.
          </p>
        )}
      </div>

      {/* Tier constants — owner only */}
      <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tier constants</h3>
          {!isOwner && <span className="text-xs text-bb-dim">Owner only — read view</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-bb-dim text-left">
                <th className="py-1.5 pr-3 font-medium">Tier</th>
                <th className="py-1.5 pr-3 font-medium">Revisions</th>
                <th className="py-1.5 pr-3 font-medium">Support months</th>
                <th className="py-1.5 pr-3 font-medium">Timeline</th>
                <th className="py-1.5 font-medium">Default scope lines</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(tiers).map(([key, t]) => (
                <tr key={key} className="border-t border-bb-border/50 align-top">
                  <td className="py-2 pr-3 font-medium text-bb-muted">{t.label}</td>
                  <td className="py-2 pr-3">
                    <input
                      value={t.revisions}
                      disabled={!isOwner}
                      onChange={(e) => setTier(key, { revisions: e.target.value })}
                      className="w-16 bg-bb-black border border-bb-border rounded px-2 py-1 disabled:opacity-50 outline-none focus:border-bb-orange"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      value={t.supportMonths}
                      disabled={!isOwner}
                      onChange={(e) => setTier(key, { supportMonths: Number(e.target.value) })}
                      className="w-16 bg-bb-black border border-bb-border rounded px-2 py-1 disabled:opacity-50 outline-none focus:border-bb-orange"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={t.timeline}
                      disabled={!isOwner}
                      onChange={(e) => setTier(key, { timeline: e.target.value })}
                      className="w-28 bg-bb-black border border-bb-border rounded px-2 py-1 disabled:opacity-50 outline-none focus:border-bb-orange"
                    />
                  </td>
                  <td className="py-2">
                    <textarea
                      value={t.scopeBullets.join("\n")}
                      disabled={!isOwner}
                      rows={3}
                      onChange={(e) =>
                        setTier(key, { scopeBullets: e.target.value.split("\n").filter(Boolean) })
                      }
                      className="w-full min-w-52 bg-bb-black border border-bb-border rounded px-2 py-1 disabled:opacity-50 outline-none focus:border-bb-orange resize-y"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isOwner && (
          <button
            onClick={() => put({ tierConstants: tiers }, "Tier constants saved")}
            disabled={saving}
            className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors"
          >
            Save tier constants
          </button>
        )}
        <p className="text-xs text-bb-dim">
          Support months drive {"{{support_end}}"} (launch + months). Timelines feed the roadmap and
          projected launch date. Scope lines fill {"{{scope_bullets}}"} when a client has no services on
          record.
        </p>
      </div>
    </div>
  );
}
