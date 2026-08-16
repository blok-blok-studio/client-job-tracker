"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import LifecycleTimeline from "@/components/automations/LifecycleTimeline";

/**
 * Lifecycle card on the client page: the project fields and dates that drive
 * sequences A–H, plus this client's full automation timeline. Setting a date
 * here is what triggers the matching sequence.
 */

interface LifecycleFields {
  role: string;
  packageTier: string | null;
  projectName: string | null;
  projectPrice: number | null;
  depositReceived: number | null;
  projectBalance: number | null;
  websiteUrl: string | null;
  contractSignedAt: string | null;
  kickoffBookedAt: string | null;
  kickoffHeldAt: string | null;
  assetDeadline: string | null;
  assetsReceivedAt: string | null;
  launchDate: string | null;
  finalPaymentAt: string | null;
  supportEnd: string | null;
  careFreeEnd: string | null;
  careStatus: string;
  careTier: string | null;
}

const DATE_FIELDS: { key: keyof LifecycleFields; label: string; hint?: string }[] = [
  { key: "contractSignedAt", label: "Contract signed", hint: "starts onboarding (A) + content (B)" },
  { key: "kickoffBookedAt", label: "Kickoff booked", hint: "cancels the A2 nudge" },
  { key: "kickoffHeldAt", label: "Kickoff held" },
  { key: "assetDeadline", label: "Asset deadline", hint: "anchors content chasers (B)" },
  { key: "assetsReceivedAt", label: "Assets received", hint: "cancels pending chasers" },
  { key: "launchDate", label: "Launch date", hint: "starts free Care + conversion (E)" },
  { key: "finalPaymentAt", label: "Final payment", hint: "with launch: close-out (D)" },
];

const toDateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export default function ClientLifecycle({ clientId, isOwner = false }: { clientId: string; isOwner?: boolean }) {
  const [fields, setFields] = useState<LifecycleFields | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (data.success) {
      setFields(data.data);
      setDraft({});
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (Object.keys(draft).length === 0) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(draft)) {
        if (["projectPrice", "depositReceived", "projectBalance"].includes(k)) {
          payload[k] = v === "" ? null : Number(v);
        } else if (DATE_FIELDS.some((d) => d.key === k)) {
          payload[k] = v === "" ? null : new Date(v).toISOString();
        } else {
          payload[k] = v === "" ? null : v;
        }
      }
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast("Lifecycle updated — sequences adjusted", "success");
        await load();
        setTimelineKey((k) => k + 1);
      } else {
        toast(data.error || "Failed to save", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!fields) return null;

  const val = (k: keyof LifecycleFields) =>
    draft[k] !== undefined ? draft[k] : ((fields[k] as string | null) ?? "");
  const dateVal = (k: keyof LifecycleFields) =>
    draft[k] !== undefined ? draft[k] : toDateInput(fields[k] as string | null);
  const set = (k: string, v: string) => setDraft((p) => ({ ...p, [k]: v }));
  const dirty = Object.keys(draft).length > 0;
  const inputCls =
    "w-full px-2.5 py-1.5 bg-bb-black border border-bb-border rounded text-sm text-white focus:border-bb-orange outline-none";

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Zap size={15} className="text-bb-orange" /> Lifecycle &amp; automations
        </h3>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs text-bb-dim">Role</label>
          <select value={val("role")} onChange={(e) => set("role", e.target.value)} className={inputCls}>
            <option value="CLIENT">Client</option>
            <option value="PARTNER">Partner</option>
            <option value="LEAD">Lead</option>
            <option value="CONTRACTOR">Contractor</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-bb-dim">Package tier</label>
          <select
            value={val("packageTier")}
            onChange={(e) => set("packageTier", e.target.value)}
            className={inputCls}
          >
            <option value="">—</option>
            <option value="LAUNCH">Launch</option>
            <option value="ESSENTIAL">Essential</option>
            <option value="GROWTH">Growth</option>
            <option value="SCALE">Scale</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-bb-dim">Project name</label>
          <input value={val("projectName")} onChange={(e) => set("projectName", e.target.value)} className={inputCls} />
        </div>
        {isOwner && (
          <>
            <div>
              <label className="text-xs text-bb-dim">Price</label>
              <input type="number" value={val("projectPrice")} onChange={(e) => set("projectPrice", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-bb-dim">Deposit received</label>
              <input type="number" value={val("depositReceived")} onChange={(e) => set("depositReceived", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-bb-dim">Balance due</label>
              <input type="number" value={val("projectBalance")} onChange={(e) => set("projectBalance", e.target.value)} className={inputCls} />
            </div>
          </>
        )}
        <div className="col-span-2">
          <label className="text-xs text-bb-dim">Live site URL ({"{{url}}"} in emails)</label>
          <input value={val("websiteUrl")} onChange={(e) => set("websiteUrl", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-bb-dim">Care status</label>
          <select value={val("careStatus")} onChange={(e) => set("careStatus", e.target.value)} className={inputCls}>
            <option value="NONE">None</option>
            <option value="FREE">Free period</option>
            <option value="PAYING">Paying</option>
            <option value="DECLINED">Declined</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-bb-dim">Care tier</label>
          <select value={val("careTier")} onChange={(e) => set("careTier", e.target.value)} className={inputCls}>
            <option value="">—</option>
            <option value="CARE">Care (200)</option>
            <option value="CARE_PLUS">Care Plus (500)</option>
            <option value="CARE_PRO">Care Pro (1000)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        {DATE_FIELDS.map((d) => (
          <div key={d.key}>
            <label className="text-xs text-bb-dim" title={d.hint}>
              {d.label}
            </label>
            <input
              type="date"
              value={dateVal(d.key)}
              onChange={(e) => set(d.key, e.target.value)}
              className={inputCls}
            />
            {d.hint && <p className="text-[10px] text-bb-dim/60 mt-0.5">{d.hint}</p>}
          </div>
        ))}
        <div>
          <label className="text-xs text-bb-dim">Support until (computed)</label>
          <p className="text-sm text-bb-muted py-1.5">
            {fields.supportEnd ? new Date(fields.supportEnd).toLocaleDateString() : "—"}
          </p>
        </div>
        <div>
          <label className="text-xs text-bb-dim">Free Care until (computed)</label>
          <p className="text-sm text-bb-muted py-1.5">
            {fields.careFreeEnd ? new Date(fields.careFreeEnd).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      <div className="pt-3 border-t border-bb-border">
        <LifecycleTimeline key={timelineKey} clientId={clientId} />
      </div>
    </div>
  );
}
