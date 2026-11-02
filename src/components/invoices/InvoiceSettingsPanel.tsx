"use client";

import { useEffect, useState } from "react";
import { Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { DEFAULT_INVOICE_SETTINGS, isValidIban, CURRENCY_OPTIONS, type InvoiceSettings, type OtherBank } from "@/lib/invoicing/settings-core";
import { Plus, Trash2 } from "lucide-react";
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
  const setOther = (i: number, patch: Partial<OtherBank>) => setS((p) => ({ ...p, otherBanks: p.otherBanks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const setOtherLine = (i: number, li: number, patch: Partial<{ label: string; value: string }>) =>
    setS((p) => ({ ...p, otherBanks: p.otherBanks.map((b, j) => (j === i ? { ...b, lines: b.lines.map((l, k) => (k === li ? { ...l, ...patch } : l)) } : b)) }));

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
          <Field label="Wise pay link (optional, must be https://wise.com/…; the USD QR opens it)" className="sm:col-span-2">
            <input className={inputCls} placeholder="https://wise.com/pay/…" value={s.wisePayLink} onChange={(e) => set("wisePayLink", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Other currencies (GBP, CHF, CAD, AUD, … via Wise)">
        <p className="text-xs text-bb-dim mb-3">One receiving account per currency. Copy the fields exactly as Wise shows them (for GBP: sort code + account number; AUD: BSB + account; CAD: institution + transit + account). Invoices in that currency print these lines; the QR opens your Wise link.</p>
        <div className="space-y-3">
          {s.otherBanks.map((b, i) => (
            <div key={i} className="rounded-lg border border-bb-border p-3 space-y-2">
              <div className="grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-end">
                <Field label="Currency">
                  <select className={inputCls} value={b.currency} onChange={(e) => setOther(i, { currency: e.target.value })}>
                    {CURRENCY_OPTIONS.filter((c) => c !== "EUR" && c !== "USD").map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Account holder"><input className={inputCls} value={b.holder} onChange={(e) => setOther(i, { holder: e.target.value })} /></Field>
                <Field label="Bank"><input className={inputCls} value={b.bank} onChange={(e) => setOther(i, { bank: e.target.value })} /></Field>
                <button type="button" aria-label="Remove currency" className="p-2 text-bb-dim hover:text-red-400" onClick={() => set("otherBanks", s.otherBanks.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
              {b.lines.map((l, li) => (
                <div key={li} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input className={inputCls} placeholder="Label (e.g. Sort code)" value={l.label} onChange={(e) => setOtherLine(i, li, { label: e.target.value })} />
                  <input className={`${inputCls} font-mono`} placeholder="Value" value={l.value} onChange={(e) => setOtherLine(i, li, { value: e.target.value })} />
                  <button type="button" aria-label="Remove line" className="p-2 text-bb-dim hover:text-red-400" onClick={() => setOther(i, { lines: b.lines.filter((_, j) => j !== li) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" className="text-xs text-bb-accent hover:underline inline-flex items-center gap-1" onClick={() => setOther(i, { lines: [...b.lines, { label: "", value: "" }] })}><Plus size={12} /> Add line</button>
            </div>
          ))}
          <button type="button" className="text-xs text-bb-accent hover:underline inline-flex items-center gap-1" onClick={() => set("otherBanks", [...s.otherBanks, { currency: "GBP", holder: s.eur.holder || s.sellerName, bank: "Wise", lines: [{ label: "", value: "" }] }])}><Plus size={12} /> Add a currency</button>
        </div>
      </Section>

      <Section title="Payment reminders (dunning)">
        <label className="flex items-center gap-2 text-sm text-bb-muted">
          <input type="checkbox" checked={s.reminders.enabled} onChange={(e) => set("reminders", { ...s.reminders, enabled: e.target.checked })} />
          Email reminders automatically: due soon, then overdue steps, the last one being the final notice (Mahnung)
        </label>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="Days before due date (0 = off)">
            <input type="number" min={0} max={14} className={inputCls} value={s.reminders.beforeDueDays} onChange={(e) => set("reminders", { ...s.reminders, beforeDueDays: Number(e.target.value) })} />
          </Field>
          <Field label="Days after due date, comma separated (last = final notice)">
            <input className={inputCls} value={s.reminders.overdueDays.join(", ")} onChange={(e) => set("reminders", { ...s.reminders, overdueDays: e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0) })} />
          </Field>
        </div>
        <p className="text-xs text-bb-dim mt-2">Reminders stop the moment the client presses &quot;I have paid&quot; on the pay page (you get asked to confirm instead) or the invoice is marked paid.</p>
      </Section>

      <Section title="DATEV export (for BD Berlin Digital Tax)">
        <p className="text-xs text-bb-dim mb-3">The monthly pack can export a DATEV Buchungsstapel (EXTF 700). Ask the advisor for the Berater- and Mandantennummer and to confirm the revenue accounts; these are SKR defaults.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Kontenrahmen">
            <select className={inputCls} value={s.datev.skr} onChange={(e) => set("datev", { ...s.datev, skr: e.target.value as "SKR03" | "SKR04" })}><option>SKR03</option><option>SKR04</option></select>
          </Field>
          <Field label="Beraternummer"><input className={inputCls} value={s.datev.beraterNr} onChange={(e) => set("datev", { ...s.datev, beraterNr: e.target.value })} /></Field>
          <Field label="Mandantennummer"><input className={inputCls} value={s.datev.mandantNr} onChange={(e) => set("datev", { ...s.datev, mandantNr: e.target.value })} /></Field>
          <Field label="Debitor (Sammelkonto)"><input className={inputCls} value={s.datev.debtorAccount} onChange={(e) => set("datev", { ...s.datev, debtorAccount: e.target.value })} /></Field>
          <Field label="Erlöse § 19"><input className={inputCls} value={s.datev.accounts.KLEINUNTERNEHMER} onChange={(e) => set("datev", { ...s.datev, accounts: { ...s.datev.accounts, KLEINUNTERNEHMER: e.target.value } })} /></Field>
          <Field label="Erlöse 19 %"><input className={inputCls} value={s.datev.accounts.REGULAR} onChange={(e) => set("datev", { ...s.datev, accounts: { ...s.datev.accounts, REGULAR: e.target.value } })} /></Field>
          <Field label="Erlöse EU reverse charge"><input className={inputCls} value={s.datev.accounts.REVERSE_CHARGE} onChange={(e) => set("datev", { ...s.datev, accounts: { ...s.datev.accounts, REVERSE_CHARGE: e.target.value } })} /></Field>
          <Field label="Erlöse Drittland"><input className={inputCls} value={s.datev.accounts.DRITTLAND} onChange={(e) => set("datev", { ...s.datev, accounts: { ...s.datev.accounts, DRITTLAND: e.target.value } })} /></Field>
        </div>
      </Section>

      <Section title="Numbering, terms and VAT dates">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Default due days">
            <input type="number" min={0} max={90} className={inputCls} value={s.defaultDueDays} onChange={(e) => set("defaultDueDays", Number(e.target.value))} />
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
        <label className="flex items-center gap-2 text-sm text-bb-muted mt-4">
          <input type="checkbox" checked={s.autoSendOnIssue} onChange={(e) => set("autoSendOnIssue", e.target.checked)} />
          Email every invoice to the client automatically when it is issued (PDF + pay link)
        </label>
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
