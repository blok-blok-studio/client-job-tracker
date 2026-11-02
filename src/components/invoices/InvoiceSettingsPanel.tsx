"use client";

import { useEffect, useState } from "react";
import { Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { DEFAULT_INVOICE_SETTINGS, isValidIban, type InvoiceSettings } from "@/lib/invoicing/settings-core";
import { inputCls, labelCls, btnPrimary, readJsonSafe } from "./shared";

/**
 * Seller block, tax ids, bank details (EUR IBAN + USD via Wise), Wise pay
 * link, numbering start and the VAT dates. Nothing here is guessed: bank
 * fields ship empty and the page says so until they are filled in.
 */
export default function InvoiceSettingsPanel({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast();
  const [s, setS] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/studio-invoices/settings");
        const json = await readJsonSafe(res);
        if (json.success && json.data) {
          setS(json.data as InvoiceSettings);
          setWarnings((json.warnings as string[]) || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/studio-invoices/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const json = await readJsonSafe(res);
      if (!json.success) throw new Error(json.error || "Save failed");
      setS(json.data as InvoiceSettings);
      setWarnings((json.warnings as string[]) || []);
      toast("Invoice settings saved", "success");
      onSaved?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const setEur = (k: keyof InvoiceSettings["eur"], v: string) => setS((p) => ({ ...p, eur: { ...p.eur, [k]: v } }));
  const setUsd = (k: keyof InvoiceSettings["usd"], v: string) => setS((p) => ({ ...p, usd: { ...p.usd, [k]: v } }));
  const ibanOk = s.eur.iban ? isValidIban(s.eur.iban) : null;

  if (loading) return <div className="text-sm text-bb-dim py-8">Loading settings…</div>;

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
          {warnings.map((w) => (
            <p key={w} className="text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      <Section title="Seller (printed on every invoice)">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Company">
            <input className={inputCls} value={s.sellerName} onChange={(e) => set("sellerName", e.target.value)} />
          </Field>
          <Field label="Contact name">
            <input className={inputCls} value={s.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} value={s.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Website">
            <input className={inputCls} value={s.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <Field label="Address (one line per row)" className="sm:col-span-2">
            <textarea className={inputCls} rows={3} value={s.addressLines.join("\n")} onChange={(e) => set("addressLines", e.target.value.split("\n"))} />
          </Field>
          <Field label="Steuernummer">
            <input className={inputCls} value={s.steuernummer} onChange={(e) => set("steuernummer", e.target.value)} />
          </Field>
          <Field label="USt-IdNr. (leave empty until issued)">
            <input className={inputCls} placeholder="DE…" value={s.ustIdNr} onChange={(e) => set("ustIdNr", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="EUR account (SEPA, printed on EUR invoices + GiroCode QR)">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Account holder">
            <input className={inputCls} value={s.eur.holder} onChange={(e) => setEur("holder", e.target.value)} />
          </Field>
          <Field label="Bank">
            <input className={inputCls} value={s.eur.bank} onChange={(e) => setEur("bank", e.target.value)} />
          </Field>
          <Field label="IBAN">
            <div className="relative">
              <input className={`${inputCls} font-mono pr-8`} placeholder="DE…" value={s.eur.iban} onChange={(e) => setEur("iban", e.target.value)} />
              {ibanOk !== null && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {ibanOk ? <CheckCircle2 size={16} className="text-green-400" /> : <AlertTriangle size={16} className="text-red-400" />}
                </span>
              )}
            </div>
          </Field>
          <Field label="BIC (optional inside the EEA)">
            <input className={`${inputCls} font-mono`} value={s.eur.bic} onChange={(e) => setEur("bic", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="USD account (Wise, printed on USD invoices)">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Account holder">
            <input className={inputCls} value={s.usd.holder} onChange={(e) => setUsd("holder", e.target.value)} />
          </Field>
          <Field label="Bank name (as Wise shows it)">
            <input className={inputCls} value={s.usd.bank} onChange={(e) => setUsd("bank", e.target.value)} />
          </Field>
          <Field label="Routing number (ACH)">
            <input className={`${inputCls} font-mono`} value={s.usd.routing} onChange={(e) => setUsd("routing", e.target.value)} />
          </Field>
          <Field label="Account number">
            <input className={`${inputCls} font-mono`} value={s.usd.account} onChange={(e) => setUsd("account", e.target.value)} />
          </Field>
          <Field label="SWIFT / BIC (for wires)">
            <input className={`${inputCls} font-mono`} value={s.usd.swift} onChange={(e) => setUsd("swift", e.target.value)} />
          </Field>
          <Field label="Bank address (optional, some payers need it)">
            <input className={inputCls} value={s.usd.bankAddress} onChange={(e) => setUsd("bankAddress", e.target.value)} />
          </Field>
          <Field label="Wise pay link (optional; the USD QR opens it)" className="sm:col-span-2">
            <input className={inputCls} placeholder="https://wise.com/pay/…" value={s.wisePayLink} onChange={(e) => set("wisePayLink", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Numbering, terms and VAT dates">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Default due days">
            <input type="number" min={0} max={90} className={inputCls} value={s.defaultDueDays} onChange={(e) => set("defaultDueDays", Number(e.target.value))} />
          </Field>
          <Field label="Stripe fee shown (%)">
            <input type="number" step="0.1" min={0} className={inputCls} value={s.stripeFeePct} onChange={(e) => set("stripeFeePct", Number(e.target.value))} />
          </Field>
          <Field label="First number year">
            <input type="number" className={inputCls} value={s.sequenceStartYear} onChange={(e) => set("sequenceStartYear", Number(e.target.value))} />
          </Field>
          <Field label="First number in that year">
            <input type="number" min={1} className={inputCls} value={s.sequenceStart} onChange={(e) => set("sequenceStart", Number(e.target.value))} />
          </Field>
          <Field label="§ 19 UStG applies until">
            <input type="date" className={inputCls} value={s.kleinunternehmerUntil} onChange={(e) => set("kleinunternehmerUntil", e.target.value)} />
          </Field>
          <Field label="Revenue ceiling (EUR)">
            <input type="number" min={0} className={inputCls} value={s.revenueCeilingEur} onChange={(e) => set("revenueCeilingEur", Number(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs text-bb-dim mt-3">
          Numbers run BBS-YYYY-001, 002, … per year and are assigned when an invoice is issued. If some 2026 numbers were already used outside this system, set the first number here before issuing. German invoices issued after the § 19 date add 19% USt automatically.
        </p>
      </Section>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <Save size={14} /> {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-display font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}
