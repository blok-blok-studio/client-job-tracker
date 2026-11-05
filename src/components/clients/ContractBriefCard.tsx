"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

/**
 * Owner-only deal terms for the automatic contract draft. When the client
 * finishes onboarding, a DRAFT contract is written from these terms and the
 * owner is pinged to review it. "Draft contract now" does the same on demand.
 * Nothing here sends anything to the client.
 */
export default function ContractBriefCard({
  clientId,
  hasServiceAgreement,
  onDrafted,
  toast,
}: {
  clientId: string;
  hasServiceAgreement: boolean;
  onDrafted: () => void;
  toast: (msg: string, kind?: "success" | "error") => void;
}) {
  const [brief, setBrief] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/contract-brief`);
      const data = await res.json();
      if (data.success) {
        setBrief(data.data.brief);
        setSaved(data.data.brief);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contract-brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(brief.trim());
        toast("Deal terms saved", "success");
      } else toast(data.error || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const draftNow = async () => {
    if (brief.trim() !== saved) await save();
    setDrafting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contract-brief`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast(data.data.aiError ? "Draft made from the standard template (AI drafting failed). Review it below." : "Contract draft ready. Review it below, nothing was sent.", "success");
        onDrafted();
      } else toast(data.error || "Could not draft", "error");
    } finally {
      setDrafting(false);
    }
  };

  if (loading) return null;
  const dirty = brief.trim() !== saved;

  return (
    <div className="p-3 rounded-lg bg-bb-black border border-bb-border space-y-2 mb-4">
      <div>
        <p className="text-sm font-medium">Deal terms</p>
        <p className="text-xs text-bb-dim mt-0.5">
          Scope, price and payment schedule. When the client finishes onboarding, a contract draft is written from this
          and you get a ping to review it. Nothing goes to the client until you send it.
        </p>
      </div>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={5}
        maxLength={200000}
        placeholder="e.g. Website redesign, 5 pages, 2 revision rounds. €6,000: 50% on signing, 50% at launch. Hosting €50/month."
        className="w-full bg-bb-surface border border-bb-border rounded-lg px-3 py-2 text-base sm:text-sm focus:border-bb-blue outline-none resize-y"
      />
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-md bg-bb-elevated hover:bg-bb-border disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save terms"}
        </button>
        <button
          onClick={draftNow}
          disabled={drafting || !brief.trim() || hasServiceAgreement}
          title={hasServiceAgreement ? "This client already has a service agreement" : undefined}
          className="px-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-md bg-bb-blue hover:bg-bb-blue-light text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {drafting ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {drafting ? "Drafting..." : "Draft contract now"}
        </button>
      </div>
      {hasServiceAgreement && (
        <p className="text-[11px] text-bb-dim">A service agreement already exists, so no automatic draft will be made.</p>
      )}
    </div>
  );
}
