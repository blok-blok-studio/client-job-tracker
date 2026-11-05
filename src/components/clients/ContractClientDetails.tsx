"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Mail, Pencil, AlertTriangle } from "lucide-react";
import { countryOptions, STATE_REQUIRED_COUNTRIES } from "@/lib/client-party";

interface Details {
  company: string | null;
  email: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyZip: string | null;
  companyCountry: string | null;
  taxId: string | null;
  noTaxId: boolean;
}

interface PartyData {
  details: Details;
  missing: string[];
  block: string;
  onboardedAt: string | null;
  onboardLinkOpen: boolean;
}

/**
 * Shows the CLIENT DETAILS block the contract will carry. When anything is
 * missing it says what, and offers two ways out: email the onboarding form
 * (the client fills it in) or fill the gaps in here.
 */
export default function ContractClientDetails({
  clientId,
  onReadyChange,
  toast,
}: {
  clientId: string;
  onReadyChange: (ready: boolean) => void;
  toast: (msg: string, kind?: "success" | "error") => void;
}) {
  const [data, setData] = useState<PartyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Details | null>(null);
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const countries = useMemo(() => countryOptions(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/party-details`);
      const j = await res.json();
      if (j.success) {
        setData(j.data);
        onReadyChange(j.data.missing.length === 0);
      } else {
        onReadyChange(false);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, onReadyChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/party-details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!j.success) {
        toast(j.error || "Could not save the details", "error");
        return;
      }
      setData(j.data);
      onReadyChange(j.data.missing.length === 0);
      if (j.data.missing.length === 0) setEditing(false);
      toast(j.data.missing.length === 0 ? "Client details complete" : `Saved. Still missing: ${j.data.missing.join(", ")}`, j.data.missing.length === 0 ? "success" : "error");
    } finally {
      setSaving(false);
    }
  }

  async function emailForm() {
    setEmailing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/onboarding-email`, { method: "POST" });
      const j = await res.json();
      if (j.success) toast(`Onboarding form emailed to ${j.data.sentTo}. You'll be able to draft the contract once they submit it.`, "success");
      else toast(j.error || "Could not send the onboarding form", "error");
    } finally {
      setEmailing(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-bb-dim">
        <Loader2 size={12} className="animate-spin" /> Checking client details...
      </div>
    );
  }
  if (!data) return null;

  const complete = data.missing.length === 0;
  const input = "w-full px-2.5 py-1.5 bg-bb-black border border-bb-border rounded-md text-white text-base sm:text-xs focus:outline-none focus:border-bb-blue";
  const set = (k: keyof Details, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const stateNeeded = !!form?.companyCountry && STATE_REQUIRED_COUNTRIES.includes(form.companyCountry);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${complete ? "border-green-500/30 bg-green-500/5" : "border-amber-500/40 bg-amber-500/10"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {complete ? <Check size={14} className="text-green-400 mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />}
          <div>
            <p className="text-sm font-medium text-white">
              {complete ? "Client details for the contract" : "Client details missing"}
            </p>
            <p className="text-xs text-bb-muted">
              {complete
                ? data.onboardedAt
                  ? "From the client's onboarding form. Printed in the contract exactly like this."
                  : "Printed in the contract exactly like this."
                : `The contract needs: ${data.missing.join(", ")}.`}
            </p>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setForm({ ...data.details, companyCountry: data.details.companyCountry || "" });
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs text-bb-accent hover:text-bb-accent-light shrink-0"
          >
            <Pencil size={11} /> {complete ? "Edit" : "Fill in myself"}
          </button>
        )}
      </div>

      {complete && !editing && (
        <pre className="text-xs text-bb-muted whitespace-pre-wrap font-mono bg-bb-black/60 rounded p-2">{data.block}</pre>
      )}

      {!complete && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={emailForm}
            disabled={emailing || !data.details.email}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-blue hover:bg-bb-blue-light text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            {emailing ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
            {data.details.email ? `Email the onboarding form to ${data.details.email}` : "Add an email to send the form"}
          </button>
          {data.onboardLinkOpen && <span className="text-[11px] text-bb-dim">An onboarding link is already open for this client.</span>}
        </div>
      )}

      {editing && form && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={input} placeholder="Legal / company name" value={form.company || ""} onChange={(e) => set("company", e.target.value)} />
            <input className={input} placeholder="Email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <input className={input} placeholder="Street address" value={form.companyAddress || ""} onChange={(e) => set("companyAddress", e.target.value)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className={input} placeholder="Postal code" value={form.companyZip || ""} onChange={(e) => set("companyZip", e.target.value)} />
            <input className={input} placeholder="City" value={form.companyCity || ""} onChange={(e) => set("companyCity", e.target.value)} />
            <input className={input} placeholder={stateNeeded ? "State (required)" : "State / region"} value={form.companyState || ""} onChange={(e) => set("companyState", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select className={input} value={form.companyCountry || ""} onChange={(e) => set("companyCountry", e.target.value)}>
              <option value="">Country...</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <input className={`${input} disabled:opacity-40`} placeholder="VAT / tax ID" disabled={form.noTaxId} value={form.noTaxId ? "" : form.taxId || ""} onChange={(e) => set("taxId", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 py-1 text-xs text-bb-muted">
            <input type="checkbox" checked={form.noTaxId} onChange={(e) => set("noTaxId", e.target.checked)} />
            Client has no VAT / tax ID (private person or not registered)
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-bb-muted hover:text-white">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-blue hover:bg-bb-blue-light text-white text-xs font-medium rounded-md disabled:opacity-50">
              {saving && <Loader2 size={12} className="animate-spin" />} Save details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
