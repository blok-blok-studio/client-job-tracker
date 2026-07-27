"use client";

import { useMemo, useState } from "react";
import { SERVICE_PACKAGES, ADDON_PACKAGES, PACKAGE_CATEGORIES } from "@/lib/contract-templates";
import { cn } from "@/lib/utils";

export interface ServiceFormValues {
  clientId: string;
  name: string;
  category: string | null;
  status: string;
  recurring: boolean;
  price: number | null;
  startedAt: string | null;
  endedAt: string | null;
  notes: string;
}

export interface ServiceFormInitial extends Partial<ServiceFormValues> {
  id?: string;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface ServiceFormProps {
  /** Pass the client list to show a client picker (overview page); omit when the client is fixed */
  clients?: ClientOption[];
  /** Fixed client id (client detail page) */
  clientId?: string;
  initial?: ServiceFormInitial;
  onSubmit: (values: ServiceFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const STATUS_OPTIONS = [
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

// Full catalog (packages + add-ons) powers the suggestion list so service
// names stay consistent with what contracts sell
const CATALOG = [...SERVICE_PACKAGES, ...ADDON_PACKAGES];

export default function ServiceForm({ clients, clientId, initial, onSubmit, onCancel }: ServiceFormProps) {
  const [form, setForm] = useState({
    clientId: initial?.clientId || clientId || "",
    name: initial?.name || "",
    category: initial?.category || "",
    status: initial?.status || "ACTIVE",
    recurring: initial?.recurring ?? false,
    price: initial?.price != null ? String(initial.price) : "",
    startedAt: initial?.startedAt ? initial.startedAt.slice(0, 10) : "",
    endedAt: initial?.endedAt ? initial.endedAt.slice(0, 10) : "",
    notes: initial?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    const q = form.name.trim().toLowerCase();
    if (!q) return CATALOG.slice(0, 8);
    return CATALOG.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [form.name]);

  function pickSuggestion(pkg: (typeof CATALOG)[number]) {
    setForm((f) => ({
      ...f,
      name: pkg.name,
      category: pkg.category,
      recurring: !!pkg.recurring,
      price: f.price || String(pkg.price),
    }));
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) { setError("Pick a client"); return; }
    if (!form.name.trim()) { setError("Service name is required"); return; }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        clientId: form.clientId,
        name: form.name.trim(),
        category: form.category || null,
        status: form.status,
        recurring: form.recurring,
        price: form.price === "" ? null : Number(form.price),
        startedAt: form.startedAt || null,
        endedAt: form.endedAt || null,
        notes: form.notes,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";
  const labelCls = "block text-xs font-medium text-bb-muted mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {clients && (
        <div>
          <label className={labelCls}>Client</label>
          <select
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            className={inputCls}
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` — ${c.company}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="relative">
        <label className={labelCls}>Service</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="e.g. Social Growth, Starter Launch, custom…"
          className={inputCls}
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-bb-elevated border border-bb-border rounded-md shadow-xl">
            {suggestions.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pickSuggestion(pkg); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-bb-muted hover:bg-bb-surface hover:text-white transition-colors"
              >
                <span className="truncate">{pkg.name}</span>
                <span className="text-xs text-bb-dim shrink-0">
                  ${pkg.price.toLocaleString()}{pkg.recurring ? "/mo" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className={inputCls}
          >
            <option value="">None</option>
            {PACKAGE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Price (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-bb-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
              className="accent-bb-orange w-4 h-4"
            />
            Monthly recurring
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Started</label>
          <input
            type="date"
            value={form.startedAt}
            onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Ended</label>
          <input
            type="date"
            value={form.endedAt}
            onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          placeholder="Scope details, links, anything worth remembering…"
          className={cn(inputCls, "resize-none")}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {saving ? "Saving…" : initial?.id ? "Save Changes" : "Add Service"}
        </button>
      </div>
    </form>
  );
}
