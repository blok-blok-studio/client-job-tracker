"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Send, Link2, Download, FilePlus2 } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";
import Badge from "@/components/shared/Badge";
import { VAT_OVERRIDE_OPTIONS, type VatOverride, type InvoiceTemplate, type InvoiceLanguage } from "@/lib/invoicing/vat";
import { CURRENCY_OPTIONS } from "@/lib/invoicing/settings-core";
import { inputCls, labelCls, chipCls, btnPrimary, btnGhost, readJsonSafe, money, shortDate } from "./shared";

interface QuoteRow {
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CONVERTED";
  currency: string;
  total: number;
  issueDate: string;
  validUntil: string;
  acceptedAt: string | null;
  acceptedName: string | null;
  schedule: Array<{ label: string; percent: number }> | null;
  publicUrl: string;
  client: { id: string; name: string; company: string | null };
}

const TONE: Record<QuoteRow["status"], "gray" | "blue" | "green" | "red" | "yellow" | "orange"> = { DRAFT: "gray", SENT: "blue", ACCEPTED: "green", CONVERTED: "green", DECLINED: "red", EXPIRED: "yellow" };

export default function QuotesPanel({ onInvoiceDrafted }: { onInvoiceDrafted: (invoiceId: string) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await readJsonSafe(await fetch("/api/studio-invoices/quotes"));
    if (j.success) setRows(j.data as QuoteRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function send(q: QuoteRow) {
    setBusy(q.id);
    try {
      const j = await readJsonSafe(await fetch(`/api/studio-invoices/quotes/${q.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
      if (!j.success) throw new Error(j.error || "Failed");
      toast(`Quote emailed to ${(j.data as { sentTo: string }).sentTo}`, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }
  async function nextInvoice(q: QuoteRow) {
    setBusy(q.id);
    try {
      const j = await readJsonSafe(await fetch(`/api/studio-invoices/quotes/${q.id}/next-invoice`, { method: "POST" }));
      if (!j.success) throw new Error(j.error || "Failed");
      const d = j.data as { id: string; milestoneLabel: string; milestoneIndex: number; milestones: number };
      toast(`Draft created: ${d.milestoneLabel} (${d.milestoneIndex}/${d.milestones}). Review and issue it.`, "success");
      await load();
      onInvoiceDrafted(d.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }
  async function remove(q: QuoteRow) {
    const j = await readJsonSafe(await fetch(`/api/studio-invoices/quotes/${q.id}`, { method: "DELETE" }));
    if (!j.success) return toast(j.error || "Failed", "error");
    toast("Draft quote deleted", "success");
    load();
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Quote link copied", "success");
    } catch {
      toast(url, "info");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-sm text-white font-medium">Quotes (Angebote)</p>
          <p className="text-xs text-bb-dim">Numbered BBS-Q-…, same look as an invoice, accepted online. Acceptance drafts the deposit invoice; later milestones with one click.</p>
        </div>
        <button className={`${btnPrimary} inline-flex items-center gap-1.5`} onClick={() => setEditorOpen(true)}><Plus size={14} /> New quote</button>
      </div>
      {loading ? (
        <div className="h-16 bg-bb-surface border border-bb-border rounded-lg animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-bb-surface border border-bb-border rounded-xl"><p className="text-bb-dim text-sm">No quotes yet.</p></div>
      ) : (
        <div className="bg-bb-surface border border-bb-border rounded-xl divide-y divide-bb-border/60">
          {rows.map((q) => (
            <div key={q.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-mono">{q.number} <span className="font-sans text-bb-dim">· {q.client.company || q.client.name}</span></p>
                <p className="text-xs text-bb-dim">
                  {money(q.total, q.currency)} · {shortDate(q.issueDate)} · valid until {shortDate(q.validUntil)}
                  {q.schedule?.length ? ` · ${q.schedule.map((s) => `${s.percent}% ${s.label}`).join(", ")}` : ""}
                  {q.acceptedAt ? ` · accepted ${shortDate(q.acceptedAt)}${q.acceptedName ? ` by ${q.acceptedName}` : ""}` : ""}
                </p>
              </div>
              <Badge variant={TONE[q.status]}>{q.status.charAt(0) + q.status.slice(1).toLowerCase()}</Badge>
              <div className="flex items-center gap-1.5">
                <a href={`/api/studio-invoices/quotes/${q.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className={`${btnGhost} py-1.5`} title="PDF"><Download size={12} /></a>
                {q.status !== "DRAFT" && <button className={`${btnGhost} py-1.5`} onClick={() => copy(q.publicUrl)} title="Copy link"><Link2 size={12} /></button>}
                {(q.status === "DRAFT" || q.status === "SENT") && <button className={`${btnGhost} py-1.5 inline-flex items-center gap-1`} disabled={busy === q.id} onClick={() => send(q)}><Send size={12} /> {q.status === "DRAFT" ? "Send" : "Resend"}</button>}
                {(q.status === "ACCEPTED" || q.status === "CONVERTED") && <button className={`${btnGhost} py-1.5 inline-flex items-center gap-1`} disabled={busy === q.id} onClick={() => nextInvoice(q)}><FilePlus2 size={12} /> Next invoice</button>}
                {q.status === "DRAFT" && <button className={`${btnGhost} py-1.5 text-red-400`} onClick={() => remove(q)}><Trash2 size={12} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {editorOpen && <QuoteEditor onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); load(); }} />}
    </div>
  );
}

function QuoteEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [clients, setClients] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    clientId: "",
    template: "US" as InvoiceTemplate,
    language: "en" as InvoiceLanguage,
    currency: "EUR",
    vatOverride: "AUTO" as VatOverride,
    validDays: 30,
    items: [{ description: "", qty: "1", unitPrice: "" }],
    notes: "",
    schedule: [{ label: "Deposit at signing", percent: "50" }, { label: "On completion", percent: "50" }],
    useSchedule: true,
    sendNow: true,
  });
  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      const list = (d?.data || []).map((c: { id: string; name: string; company: string | null }) => ({ id: c.id, name: c.name, company: c.company }));
      list.sort((a: { name: string; company: string | null }, b: { name: string; company: string | null }) => (a.company || a.name).localeCompare(b.company || b.name));
      setClients(list);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!f.clientId) return;
    fetch(`/api/studio-invoices/prepare?clientId=${encodeURIComponent(f.clientId)}`).then(readJsonSafe).then((j) => {
      if (!j.success) return;
      const p = j.data as { template: InvoiceTemplate; language: InvoiceLanguage; currency: string };
      setF((prev) => ({ ...prev, template: p.template, language: p.language, currency: p.currency, schedule: p.language === "de" ? [{ label: "Anzahlung bei Auftrag", percent: "50" }, { label: "Bei Fertigstellung", percent: "50" }] : prev.schedule }));
    }).catch(() => {});
  }, [f.clientId]);
  const items = f.items.map((i) => ({ description: i.description.trim(), qty: Number(i.qty), unitPrice: Number(i.unitPrice) })).filter((i) => i.description && i.qty > 0 && i.unitPrice >= 0);
  const total = Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;
  const schedule = f.useSchedule ? f.schedule.map((s) => ({ label: s.label.trim(), percent: Number(s.percent) })).filter((s) => s.label && s.percent > 0) : null;
  const schedOk = !schedule || Math.round(schedule.reduce((s, x) => s + x.percent, 0)) === 100;

  async function save() {
    if (!f.clientId) return toast("Pick a client", "error");
    if (!items.length) return toast("Add at least one line", "error");
    if (!schedOk) return toast("Payment schedule must add up to 100%", "error");
    setSaving(true);
    try {
      const j = await readJsonSafe(await fetch("/api/studio-invoices/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: f.clientId, template: f.template, language: f.language, currency: f.currency, vatOverride: f.vatOverride, validDays: f.validDays, items, notes: f.notes || null, schedule }) }));
      if (!j.success) throw new Error(j.error || "Failed");
      const q = j.data as { id: string; number: string };
      if (f.sendNow) {
        const s = await readJsonSafe(await fetch(`/api/studio-invoices/quotes/${q.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
        toast(s.success ? `Quote ${q.number} created and emailed` : `Quote ${q.number} saved as draft. Not emailed: ${s.error}`, s.success ? "success" : "info");
      } else toast(`Quote ${q.number} saved as draft`, "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New quote" className="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Client</label>
          <select className={inputCls} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
            <option value="">Choose…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Template</label>
            <div className="flex gap-1">{(["DE", "US", "EU"] as const).map((t) => <button key={t} type="button" className={chipCls(f.template === t)} onClick={() => setF({ ...f, template: t, language: t === "DE" ? "de" : "en" })}>{t}</button>)}</div>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select className={inputCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className={labelCls}>VAT</label>
            <select className={inputCls} value={f.vatOverride} onChange={(e) => setF({ ...f, vatOverride: e.target.value as VatOverride })}>{VAT_OVERRIDE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </div>
          <div>
            <label className={labelCls}>Valid (days)</label>
            <input type="number" min={1} max={180} className={inputCls} value={f.validDays} onChange={(e) => setF({ ...f, validDays: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Line items</label>
            <button type="button" className="text-xs text-bb-orange hover:underline inline-flex items-center gap-1" onClick={() => setF({ ...f, items: [...f.items, { description: "", qty: "1", unitPrice: "" }] })}><Plus size={12} /> Add line</button>
          </div>
          <div className="space-y-2">
            {f.items.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_110px_28px] gap-2">
                <input className={inputCls} placeholder="Description" value={row.description} onChange={(e) => setF({ ...f, items: f.items.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)) })} />
                <input className={inputCls} inputMode="decimal" value={row.qty} onChange={(e) => setF({ ...f, items: f.items.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)) })} />
                <input className={inputCls} inputMode="decimal" placeholder={`Unit ${f.currency}`} value={row.unitPrice} onChange={(e) => setF({ ...f, items: f.items.map((r, j) => (j === i ? { ...r, unitPrice: e.target.value } : r)) })} />
                <button type="button" className="p-2 text-bb-dim hover:text-red-400" onClick={() => setF({ ...f, items: f.items.length > 1 ? f.items.filter((_, j) => j !== i) : f.items })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <p className="text-sm text-white text-right mt-2">{money(total, f.currency)} (net)</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-bb-muted mb-2"><input type="checkbox" checked={f.useSchedule} onChange={(e) => setF({ ...f, useSchedule: e.target.checked })} /> Payment schedule (project deposit / balance)</label>
          {f.useSchedule && (
            <div className="space-y-2">
              {f.schedule.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_28px] gap-2">
                  <input className={inputCls} value={s.label} onChange={(e) => setF({ ...f, schedule: f.schedule.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)) })} />
                  <input className={inputCls} inputMode="decimal" placeholder="%" value={s.percent} onChange={(e) => setF({ ...f, schedule: f.schedule.map((r, j) => (j === i ? { ...r, percent: e.target.value } : r)) })} />
                  <button type="button" className="p-2 text-bb-dim hover:text-red-400" onClick={() => setF({ ...f, schedule: f.schedule.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" className="text-xs text-bb-orange hover:underline" onClick={() => setF({ ...f, schedule: [...f.schedule, { label: "", percent: "" }] })}>+ Add milestone</button>
              {!schedOk && <p className="text-xs text-red-400">Must add up to 100%.</p>}
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Notes (printed, e.g. scope, timeline, terms)</label>
          <textarea className={inputCls} rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-bb-muted"><input type="checkbox" checked={f.sendNow} onChange={(e) => setF({ ...f, sendNow: e.target.checked })} /> Email it to the client now (PDF + accept link)</label>
        <div className="flex justify-end gap-2 pt-2 border-t border-bb-border">
          <button className={btnGhost} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : f.sendNow ? "Create and send" : "Save draft"}</button>
        </div>
      </div>
    </Modal>
  );
}
