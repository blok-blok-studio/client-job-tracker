"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";
import { computeTotals, formatMoney } from "@/lib/invoicing/money";
import { decideVat, defaultsForTemplate, VAT_SCHEME_LABELS, VAT_OVERRIDE_OPTIONS, type InvoiceTemplate, type InvoiceLanguage, type InvoiceCurrency, type VatOverride } from "@/lib/invoicing/vat";
import type { BillTo } from "@/lib/invoicing/types";
import { inputCls, labelCls, chipCls, btnPrimary, btnGhost, readJsonSafe, money } from "./shared";
import { CURRENCY_OPTIONS } from "@/lib/invoicing/settings-core";

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  type: string;
}

interface Prepared {
  client: { id: string; name: string; company: string | null; email: string | null };
  country: string | null;
  template: InvoiceTemplate;
  language: InvoiceLanguage;
  currency: InvoiceCurrency;
  billTo: BillTo;
  dueDays: number;
  kleinunternehmerUntil: string;
  missingBank: Record<string, string[]>;
  configuredCurrencies: string[];
  stripeFeePct: number;
  openStripeInvoices: Array<{ id: string; amount: number; currency: string; status: string; dueDate: string | null; stripeInvoiceUrl: string | null }>;
  openStudioInvoices: Array<{ id: string; number: string | null; total: number; currency: string; status: string }>;
}

interface ItemRow {
  description: string;
  qty: string;
  unitPrice: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  draftId?: string | null; // edit an existing draft
  initialClientId?: string | null;
  onSaved: (id: string, issued: boolean) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function InvoiceEditor({ open, onClose, draftId, initialClientId, onSaved }: Props) {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>(initialClientId || "");
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [saving, setSaving] = useState(false);

  const [template, setTemplate] = useState<InvoiceTemplate>("US");
  const [language, setLanguage] = useState<InvoiceLanguage>("en");
  const [currency, setCurrency] = useState<InvoiceCurrency>("USD");
  const [issueDate, setIssueDate] = useState(today());
  const [serviceFrom, setServiceFrom] = useState("");
  const [serviceTo, setServiceTo] = useState("");
  const [dueDays, setDueDays] = useState(14);
  const [items, setItems] = useState<ItemRow[]>([{ description: "", qty: "1", unitPrice: "" }]);
  const [notes, setNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"BANK" | "STRIPE">("BANK");
  const [vatOverride, setVatOverride] = useState<VatOverride>("AUTO");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [billTo, setBillTo] = useState<BillTo>({ name: "", company: null, addressLines: [], email: null, vatId: null, country: null });
  const [showBillTo, setShowBillTo] = useState(false);
  const [ackDuplicate, setAckDuplicate] = useState(false);

  // Opened from a client page: preselect that client
  useEffect(() => {
    if (open && !draftId) setClientId(initialClientId || "");
  }, [open, draftId, initialClientId]);

  // Clients for the picker
  useEffect(() => {
    if (!open) return;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        const list: ClientOption[] = (d?.data || []).map((c: ClientOption) => ({ id: c.id, name: c.name, company: c.company, email: c.email, type: c.type }));
        list.sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
        setClients(list);
      })
      .catch(() => {});
  }, [open]);

  // Editing: load the draft
  useEffect(() => {
    if (!open || !draftId) return;
    (async () => {
      const res = await fetch(`/api/studio-invoices/${draftId}`);
      const json = await readJsonSafe(res);
      if (!json.success) {
        toast(json.error || "Could not load draft", "error");
        return;
      }
      const d = json.data as {
        client: { id: string };
        template: InvoiceTemplate;
        language: InvoiceLanguage;
        currency: InvoiceCurrency;
        issueDate: string | null;
        serviceDateFrom: string | null;
        serviceDateTo: string | null;
        dueDays: number;
        items: Array<{ description: string; qty: number; unitPrice: number }>;
        notes: string | null;
        internalNote: string | null;
        paymentMethod: "BANK" | "STRIPE";
        paymentUrl: string | null;
        billTo: BillTo;
        vatOverride?: VatOverride | null;
      };
      setClientId(d.client.id);
      setTemplate(d.template);
      setLanguage(d.language);
      setCurrency(d.currency);
      setIssueDate(d.issueDate || today());
      setServiceFrom(d.serviceDateFrom || "");
      setServiceTo(d.serviceDateTo || "");
      setDueDays(d.dueDays);
      setItems(d.items.length ? d.items.map((i) => ({ description: i.description, qty: String(i.qty), unitPrice: String(i.unitPrice) })) : [{ description: "", qty: "1", unitPrice: "" }]);
      setNotes(d.notes || "");
      setInternalNote(d.internalNote || "");
      setPaymentMethod(d.paymentMethod);
      setPaymentUrl(d.paymentUrl || "");
      setBillTo(d.billTo);
      setVatOverride(d.vatOverride || "AUTO");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId]);

  // Picking a client: template, currency, bill-to and warnings
  useEffect(() => {
    if (!open || !clientId) {
      setPrep(null);
      return;
    }
    let cancelled = false;
    setLoadingPrep(true);
    fetch(`/api/studio-invoices/prepare?clientId=${encodeURIComponent(clientId)}`)
      .then(readJsonSafe)
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          toast(json.error || "Could not prepare invoice", "error");
          return;
        }
        const p = json.data as Prepared;
        setPrep(p);
        if (!draftId) {
          setTemplate(p.template);
          setLanguage(p.language);
          setCurrency(p.currency);
          setDueDays(p.dueDays);
          setBillTo(p.billTo);
        }
        setAckDuplicate(false);
      })
      .finally(() => !cancelled && setLoadingPrep(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  const vat = useMemo(() => {
    const issue = new Date(issueDate || today());
    return decideVat({ template, issueDate: Number.isNaN(issue.getTime()) ? new Date() : issue, clientVatId: billTo.vatId, settings: { kleinunternehmerUntil: prep?.kleinunternehmerUntil || "2026-12-31" }, override: vatOverride });
  }, [template, issueDate, billTo.vatId, prep?.kleinunternehmerUntil, vatOverride]);

  const parsedItems = useMemo(
    () =>
      items
        .map((i) => ({ description: i.description.trim(), qty: Number(i.qty), unitPrice: Number(i.unitPrice) }))
        .filter((i) => i.description && Number.isFinite(i.qty) && i.qty > 0 && Number.isFinite(i.unitPrice) && i.unitPrice >= 0),
    [items]
  );
  const totals = useMemo(() => computeTotals(parsedItems, vat.rate), [parsedItems, vat.rate]);

  const missingBank = prep ? (prep.missingBank[currency] ?? [`${currency} receiving account (add it under Settings → Other currencies)`]) : [];
  const hasDuplicateRisk = !!prep && (prep.openStripeInvoices.length > 0 || prep.openStudioInvoices.filter((i) => i.id !== draftId).length > 0);

  function pickTemplate(t: InvoiceTemplate) {
    setTemplate(t);
    const d = defaultsForTemplate(t);
    setLanguage(d.language);
    setCurrency(d.currency);
  }

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function save(issue: boolean) {
    if (!clientId) return toast("Pick a client first", "error");
    if (!parsedItems.length) return toast("Add at least one line item with a description and a price", "error");
    if (hasDuplicateRisk && issue && !ackDuplicate) return toast("Confirm the open-invoice check first", "error");
    if (paymentMethod === "STRIPE" && !/^https:\/\//.test(paymentUrl.trim())) return toast("Paste the Stripe payment link, or switch to bank transfer", "error");
    setSaving(true);
    try {
      const payload = {
        clientId,
        template,
        language,
        currency,
        issueDate,
        serviceDateFrom: serviceFrom || null,
        serviceDateTo: serviceTo || null,
        dueDays,
        items: parsedItems,
        notes: notes || null,
        internalNote: internalNote || null,
        paymentMethod,
        vatOverride,
        paymentUrl: paymentMethod === "STRIPE" ? paymentUrl.trim() : null,
        billTo: { ...billTo, addressLines: billTo.addressLines.filter(Boolean), email: billTo.email || "", country: billTo.country || "" },
      };
      const res = await fetch(draftId ? `/api/studio-invoices/${draftId}` : "/api/studio-invoices", {
        method: draftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await readJsonSafe(res);
      if (!json.success) throw new Error(json.error || "Save failed");
      const id = (json.data as { id: string }).id;
      if (!issue) {
        toast(draftId ? "Draft updated" : "Draft saved", "success");
        onSaved(id, false);
        return;
      }
      const issued = await fetch(`/api/studio-invoices/${id}/issue`, { method: "POST" });
      const ij = await readJsonSafe(issued);
      if (!ij.success) {
        toast(`Saved as draft. ${ij.error || "Could not issue."}`, "error");
        onSaved(id, false);
        return;
      }
      const issuedData = ij.data as { number: string; send?: { sent: boolean; to: string | null; error: string | null } };
      if (issuedData.send?.sent) toast(`Issued ${issuedData.number} and emailed to ${issuedData.send.to}`, "success");
      else if (issuedData.send?.error) toast(`Issued ${issuedData.number}. Not emailed: ${issuedData.send.error}`, "info");
      else toast(`Issued ${issuedData.number}`, "success");
      onSaved(id, true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) => formatMoney(n, currency, language);

  return (
    <Modal open={open} onClose={onClose} title={draftId ? "Edit draft" : "New invoice"} className="max-w-3xl">
      <div className="space-y-5">
        {/* Client */}
        <div>
          <label className={labelCls}>Client</label>
          <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!!draftId}>
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company ? `${c.company} (${c.name})` : c.name}
              </option>
            ))}
          </select>
          {loadingPrep && <p className="text-xs text-bb-dim mt-1">Checking client details…</p>}
        </div>

        {prep && (
          <>
            {/* Template / language / currency */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Template {prep.country ? <span className="text-bb-dim">(client country {prep.country})</span> : <span className="text-amber-400">(no country on file)</span>}</label>
                <div className="flex gap-1.5">
                  {(["DE", "US", "EU"] as const).map((t) => (
                    <button key={t} type="button" className={chipCls(template === t)} onClick={() => pickTemplate(t)}>
                      {t === "DE" ? "Germany" : t === "US" ? "US / non-EU" : "EU"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Language</label>
                <div className="flex gap-1.5">
                  {(["de", "en"] as const).map((l) => (
                    <button key={l} type="button" className={chipCls(language === l)} onClick={() => setLanguage(l)}>
                      {l === "de" ? "Deutsch" : "English"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <div className="flex gap-1.5 items-center">
                  {(["EUR", "USD"] as const).map((c) => (
                    <button key={c} type="button" className={chipCls(currency === c)} onClick={() => setCurrency(c)}>
                      {c}
                    </button>
                  ))}
                  <select className={`${inputCls} w-auto py-1.5`} value={currency === "EUR" || currency === "USD" ? "" : currency} onChange={(e) => e.target.value && setCurrency(e.target.value)} aria-label="Other currency">
                    <option value="">Other…</option>
                    {CURRENCY_OPTIONS.filter((c) => c !== "EUR" && c !== "USD").map((c) => (
                      <option key={c} value={c}>{c}{prep.configuredCurrencies.includes(c) ? " ✓" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* VAT + setup warnings */}
            <div className="rounded-lg border border-bb-border bg-bb-black/40 p-3 text-sm space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-white">
                  VAT: <span className="font-medium">{VAT_SCHEME_LABELS[vat.scheme]}</span>
                </p>
                <select className={`${inputCls} w-auto py-1 text-xs ml-auto`} value={vatOverride} onChange={(e) => setVatOverride(e.target.value as VatOverride)} aria-label="VAT treatment">
                  {VAT_OVERRIDE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {vat.notes.map((n) => (
                <p key={n} className="text-xs text-bb-dim">{n}</p>
              ))}
              {vat.warning && (
                <p className="text-xs text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {vat.warning}
                </p>
              )}
              {missingBank.length > 0 && paymentMethod === "BANK" && (
                <p className="text-xs text-red-400 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {currency} bank details missing in Settings ({missingBank.join(", ")}). You can save a draft, but not issue it yet.
                </p>
              )}
            </div>

            {hasDuplicateRisk && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-2">
                <p className="text-amber-200 font-medium">This client already has open invoices. No double billing:</p>
                <ul className="text-xs text-amber-100/90 space-y-0.5">
                  {prep.openStripeInvoices.map((i) => (
                    <li key={i.id}>
                      Stripe · {money(i.amount, i.currency)} · {i.status}
                      {i.stripeInvoiceUrl && (
                        <>
                          {" "}
                          <a href={i.stripeInvoiceUrl} target="_blank" rel="noreferrer" className="underline">open</a>
                        </>
                      )}
                    </li>
                  ))}
                  {prep.openStudioInvoices.filter((i) => i.id !== draftId).map((i) => (
                    <li key={i.id}>
                      {i.number || "Draft"} · {money(i.total, i.currency)} · {i.status}
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-xs text-amber-100">
                  <input type="checkbox" checked={ackDuplicate} onChange={(e) => setAckDuplicate(e.target.checked)} />
                  This invoice is for different work (or the Stripe invoice has been voided).
                </label>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Issue date</label>
                <input type="date" className={inputCls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Due in (days)</label>
                <input type="number" min={0} max={90} className={inputCls} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls}>Service from</label>
                <input type="date" className={inputCls} value={serviceFrom} onChange={(e) => setServiceFrom(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Service to</label>
                <input type="date" className={inputCls} value={serviceTo} onChange={(e) => setServiceTo(e.target.value)} />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Line items</label>
                <button type="button" className="text-xs text-bb-orange hover:underline inline-flex items-center gap-1" onClick={() => setItems((p) => [...p, { description: "", qty: "1", unitPrice: "" }])}>
                  <Plus size={12} /> Add line
                </button>
              </div>
              <div className="space-y-2">
                {items.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_64px_110px_28px] gap-2 items-start">
                    <input className={inputCls} placeholder="Description" value={row.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                    <input className={inputCls} inputMode="decimal" placeholder="Qty" value={row.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} />
                    <input className={inputCls} inputMode="decimal" placeholder={`Unit ${currency}`} value={row.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} />
                    <button type="button" aria-label="Remove line" className="p-2 text-bb-dim hover:text-red-400" onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 ml-auto w-full sm:w-72 text-sm space-y-1">
                <div className="flex justify-between text-bb-muted"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
                <div className="flex justify-between text-bb-muted"><span>VAT {vat.rate}%</span><span>{fmt(totals.vatAmount)}</span></div>
                <div className="flex justify-between text-white font-semibold border-t border-bb-border pt-1"><span>Total</span><span>{fmt(totals.total)}</span></div>
              </div>
            </div>

            {/* Payment method */}
            <div>
              <label className={labelCls}>Payment</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                <button type="button" className={chipCls(paymentMethod === "BANK")} onClick={() => setPaymentMethod("BANK")}>
                  Bank transfer {currency === "EUR" ? "(SEPA + GiroCode)" : currency === "USD" ? "(ACH / wire via Wise)" : `(${currency} account via Wise)`}
                </button>
                <button type="button" className={chipCls(paymentMethod === "STRIPE")} onClick={() => setPaymentMethod("STRIPE")}>
                  Stripe card link
                </button>
                {paymentMethod === "STRIPE" && (
                  <span className="text-xs text-amber-300">Stripe costs about {prep.stripeFeePct}% on EU cards. Only if the client insists or the invoice is small.</span>
                )}
              </div>
              {paymentMethod === "STRIPE" && (
                <input className={`${inputCls} mt-2`} placeholder="https://buy.stripe.com/… or https://invoice.stripe.com/…" value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} />
              )}
            </div>

            {/* Bill to */}
            <div>
              <button type="button" className="text-xs text-bb-orange hover:underline" onClick={() => setShowBillTo((v) => !v)}>
                {showBillTo ? "Hide" : "Edit"} bill-to block ({billTo.company || billTo.name || "empty"}{billTo.addressLines.length ? "" : ", no address"})
              </button>
              {showBillTo && (
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className={labelCls}>Company</label>
                    <input className={inputCls} value={billTo.company || ""} onChange={(e) => setBillTo((b) => ({ ...b, company: e.target.value || null }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Name</label>
                    <input className={inputCls} value={billTo.name} onChange={(e) => setBillTo((b) => ({ ...b, name: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Address (one line per row)</label>
                    <textarea className={inputCls} rows={3} value={billTo.addressLines.join("\n")} onChange={(e) => setBillTo((b) => ({ ...b, addressLines: e.target.value.split("\n") }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Email (invoice goes here)</label>
                    <input className={inputCls} value={billTo.email || ""} onChange={(e) => setBillTo((b) => ({ ...b, email: e.target.value || null }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Client VAT ID {template === "EU" && <span className="text-amber-400">(required for reverse charge)</span>}</label>
                    <input className={inputCls} value={billTo.vatId || ""} onChange={(e) => setBillTo((b) => ({ ...b, vatId: e.target.value || null }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Notes (printed)</label>
                <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={language === "de" ? "Zahlbar innerhalb von 14 Tagen ohne Abzug." : "Thank you. Payable within 14 days."} />
              </div>
              <div>
                <label className={labelCls}>Internal note (never printed)</label>
                <textarea className={inputCls} rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-bb-border">
              <button type="button" className={btnGhost} onClick={onClose} disabled={saving}>Cancel</button>
              <button type="button" className={btnGhost} onClick={() => save(false)} disabled={saving}>Save draft</button>
              <button type="button" className={btnPrimary} onClick={() => save(true)} disabled={saving || (paymentMethod === "BANK" && missingBank.length > 0)} title={missingBank.length ? "Add bank details in Settings first" : undefined}>
                {saving ? "Working…" : billTo.email ? "Issue and email" : "Issue (no email on file)"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
