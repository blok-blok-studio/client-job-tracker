"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Send, Link2, CheckCircle2, Ban, Pencil, Trash2, Undo2, ExternalLink, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import Modal from "@/components/shared/Modal";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import type { InvoiceView } from "@/lib/invoicing/types";
import { VAT_SCHEME_LABELS } from "@/lib/invoicing/vat";
import { formatMoney } from "@/lib/invoicing/money";
import { StatusBadge, isOverdue, shortDate, inputCls, labelCls, btnPrimary, btnGhost, readJsonSafe } from "./shared";

type Detail = InvoiceView & {
  client: { id: string; name: string; company: string | null; email: string | null };
  internalNote: string | null;
  qrDataUrl: string | null;
  activity: Array<{ id: string; action: string; actor: string; details: string | null; createdAt: string }>;
  contentHash: string | null;
  integrity: "ok" | "mismatch" | "none";
  partnerContext: { partner: { id: string; name: string }; closedBy: string | null; commissions: Array<{ id: string; kind: string; amount: number; status: string }> } | null;
  draftedBy: string | null;
};

interface Props {
  open: boolean;
  id: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onChanged: () => void;
}

export default function InvoiceDetail({ open, id, onClose, onEdit, onChanged }: Props) {
  const { toast } = useToast();
  const [inv, setInv] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<null | "send" | "paid" | "void">(null);
  const [sendTo, setSendTo] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [paidMethod, setPaidMethod] = useState<"bank" | "wise" | "stripe" | "paypal" | "cash" | "other">("bank");
  const [paidNote, setPaidNote] = useState("");
  const [commissionKind, setCommissionKind] = useState<"PROJECT" | "BRAND_GUIDE" | "PLAN" | "NONE">("PROJECT");
  const [voidReason, setVoidReason] = useState("");
  const [confirm, setConfirm] = useState<null | "issue" | "delete" | "unpaid" | "rotate">(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/studio-invoices/${id}`);
    const json = await readJsonSafe(res);
    if (!json.success) {
      toast(json.error || "Could not load invoice", "error");
      return;
    }
    const d = json.data as Detail;
    setInv(d);
    setSendTo(d.billTo.email || d.client.email || "");
    setNote(d.internalNote || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (open && id) {
      setInv(null);
      setPanel(null);
      load();
    }
  }, [open, id, load]);

  async function act(path: string, init: RequestInit, okMsg: string) {
    if (!id) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/studio-invoices/${id}${path}`, init);
      const json = await readJsonSafe(res);
      if (!json.success) throw new Error(json.error || "Failed");
      toast(okMsg, "success");
      await load();
      onChanged();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const jsonInit = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  async function copyLink() {
    if (!inv) return;
    try {
      await navigator.clipboard.writeText(inv.publicUrl);
      toast("Pay link copied", "success");
    } catch {
      toast(inv.publicUrl, "info");
    }
  }

  async function saveNote() {
    if (!id || !inv || note === (inv.internalNote || "")) return;
    const res = await fetch(`/api/studio-invoices/${id}`, jsonInit("PATCH", inv.status === "DRAFT" ? undefined : { internalNote: note }));
    if (inv.status === "DRAFT") return; // drafts edit the note through the editor
    const json = await readJsonSafe(res);
    if (json.success) toast("Note saved", "success");
  }

  if (!open) return null;
  const title = inv ? (inv.number ? `Invoice ${inv.number}` : "Draft invoice") : "Invoice";
  const fmt = (n: number) => (inv ? formatMoney(n, inv.currency, inv.language) : "");
  const canIssue = inv?.status === "DRAFT";
  const canSend = inv && ["ISSUED", "SENT", "PAID"].includes(inv.status);
  const canPay = inv && ["ISSUED", "SENT"].includes(inv.status);
  const canVoid = inv && ["ISSUED", "SENT"].includes(inv.status);
  const pdfHref = inv ? `/api/studio-invoices/${inv.id}/pdf?inline=1` : "#";

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-3xl">
      {!inv ? (
        <div className="text-sm text-bb-dim py-8">Loading…</div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge status={inv.status} overdue={isOverdue(inv)} />
                <span className="text-xs text-bb-dim">{inv.template} template · {inv.language.toUpperCase()} · {VAT_SCHEME_LABELS[inv.vatScheme]}</span>
              </div>
              <p className="text-white font-medium mt-2">{inv.client.company || inv.client.name}</p>
              <p className="text-xs text-bb-dim">{inv.billTo.email || inv.client.email || "no email on file"}</p>
              {inv.draftedBy && <p className="text-xs text-amber-300 mt-1">Drafted in the partner portal by {inv.draftedBy}. Check the items, then issue.</p>}
              {inv.partnerContext && (
                <p className="text-xs text-bb-dim mt-1">
                  Partner deal: {inv.partnerContext.partner.name}
                  {inv.partnerContext.commissions.length > 0 && ` · commission ${inv.partnerContext.commissions.map((c) => `${c.kind.toLowerCase()} ${c.status.toLowerCase()}`).join(", ")}`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-display font-bold text-white">{fmt(inv.total)}</p>
              <p className="text-xs text-bb-dim">
                {inv.issueDate ? `Issued ${shortDate(inv.issueDate)}` : "Not issued"}
                {inv.dueDate ? ` · due ${shortDate(inv.dueDate)}` : ""}
                {inv.paidAt ? ` · paid ${shortDate(inv.paidAt)} (${inv.paidMethod})` : ""}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canIssue && (
              <>
                <button className={btnPrimary} disabled={busy} onClick={() => setConfirm("issue")}>Issue number</button>
                <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={() => onEdit(inv.id)}><Pencil size={14} /> Edit</button>
                <button className={`${btnGhost} inline-flex items-center gap-1.5 text-red-400`} disabled={busy} onClick={() => setConfirm("delete")}><Trash2 size={14} /> Delete draft</button>
              </>
            )}
            {canSend && (
              <button className={`${inv.status === "ISSUED" ? btnPrimary : btnGhost} inline-flex items-center gap-1.5`} disabled={busy} onClick={() => setPanel(panel === "send" ? null : "send")}>
                <Send size={14} /> {inv.sentAt ? "Send again" : "Email invoice"}
              </button>
            )}
            {canPay && (
              <button className={`${btnGhost} inline-flex items-center gap-1.5`} disabled={busy} onClick={() => setPanel(panel === "paid" ? null : "paid")}>
                <CheckCircle2 size={14} /> Mark paid
              </button>
            )}
            {inv.status === "PAID" && (
              <button className={`${btnGhost} inline-flex items-center gap-1.5`} disabled={busy} onClick={() => setConfirm("unpaid")}>
                <Undo2 size={14} /> Undo payment
              </button>
            )}
            <a href={pdfHref} target="_blank" rel="noreferrer" className={`${btnGhost} inline-flex items-center gap-1.5`}>
              <Download size={14} /> PDF
            </a>
            {inv.status !== "DRAFT" && (
              <>
                <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={copyLink}><Link2 size={14} /> Copy pay link</button>
                <a href={inv.publicUrl} target="_blank" rel="noreferrer" className={`${btnGhost} inline-flex items-center gap-1.5`}><ExternalLink size={14} /> Open</a>
                <button className={`${btnGhost} inline-flex items-center gap-1.5`} disabled={busy} onClick={() => setConfirm("rotate")} title="Replace the pay link; the old one stops working"><RefreshCw size={14} /> New link</button>
              </>
            )}
            {canVoid && (
              <button className={`${btnGhost} inline-flex items-center gap-1.5 text-red-400`} disabled={busy} onClick={() => setPanel(panel === "void" ? null : "void")}>
                <Ban size={14} /> Void
              </button>
            )}
          </div>

          {panel === "send" && (
            <div className="rounded-lg border border-bb-border bg-bb-black/40 p-3 space-y-2">
              <div>
                <label className={labelCls}>Send to</label>
                <input className={inputCls} value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="client@example.com" />
              </div>
              <div>
                <label className={labelCls}>Personal note (optional, goes above the payment details)</label>
                <textarea className={inputCls} rows={2} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={() => setPanel(null)}>Cancel</button>
                <button
                  className={btnPrimary}
                  disabled={busy || !sendTo}
                  onClick={async () => {
                    if (await act("/send", jsonInit("POST", { to: sendTo, message: sendMsg || undefined }), `Emailed to ${sendTo}`)) setPanel(null);
                  }}
                >
                  {busy ? "Sending…" : "Send with PDF"}
                </button>
              </div>
            </div>
          )}

          {panel === "paid" && (
            <div className="rounded-lg border border-bb-border bg-bb-black/40 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Paid on</label>
                  <input type="date" className={inputCls} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Method</label>
                  <select className={inputCls} value={paidMethod} onChange={(e) => setPaidMethod(e.target.value as typeof paidMethod)}>
                    <option value="bank">Bank transfer</option>
                    <option value="wise">Wise</option>
                    <option value="stripe">Stripe</option>
                    <option value="paypal">PayPal</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <input className={inputCls} placeholder="Note (bank reference, partial payment, …)" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
              {inv.partnerContext && (
                <div>
                  <label className={labelCls}>Partner commission for {inv.partnerContext.partner.name} (this payment was for)</label>
                  <select className={inputCls} value={commissionKind} onChange={(e) => setCommissionKind(e.target.value as typeof commissionKind)}>
                    <option value="PROJECT">A project (website) deposit or balance</option>
                    <option value="BRAND_GUIDE">A brand strategy guide</option>
                    <option value="PLAN">A monthly plan month</option>
                    <option value="NONE">No commission on this payment</option>
                  </select>
                  <p className="text-[11px] text-bb-dim mt-1">Same rates and banding as Stripe payments; the row lands on the partner ledger as payable.</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={() => setPanel(null)}>Cancel</button>
                <button className={btnPrimary} disabled={busy} onClick={async () => { if (await act("/paid", jsonInit("POST", { paidAt, method: paidMethod, note: paidNote || null, commissionKind: inv.partnerContext ? commissionKind : "NONE" }), "Marked as paid")) setPanel(null); }}>
                  Mark paid
                </button>
              </div>
            </div>
          )}

          {panel === "void" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
              <p className="text-xs text-red-200">Voiding keeps the number on record (it is never reused). Issue a new invoice for the corrected amount.</p>
              <input className={inputCls} placeholder="Reason (required)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={() => setPanel(null)}>Cancel</button>
                <button className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50" disabled={busy || voidReason.trim().length < 3} onClick={async () => { if (await act("/void", jsonInit("POST", { reason: voidReason.trim() }), "Invoice voided")) setPanel(null); }}>
                  Void invoice
                </button>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="rounded-lg border border-bb-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bb-black/40 text-xs text-bb-dim">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-right px-3 py-2 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 font-medium">Unit</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
                  <tr key={i} className="border-t border-bb-border/60">
                    <td className="px-3 py-2 text-white">{it.description}</td>
                    <td className="px-3 py-2 text-right text-bb-muted">{it.qty}</td>
                    <td className="px-3 py-2 text-right text-bb-muted">{fmt(it.unitPrice)}</td>
                    <td className="px-3 py-2 text-right text-white">{fmt(it.lineTotal)}</td>
                  </tr>
                ))}
                <tr className="border-t border-bb-border/60 text-bb-muted"><td colSpan={3} className="px-3 py-1.5 text-right">Subtotal</td><td className="px-3 py-1.5 text-right">{fmt(inv.subtotal)}</td></tr>
                <tr className="text-bb-muted"><td colSpan={3} className="px-3 py-1.5 text-right">VAT {inv.vatRate}%</td><td className="px-3 py-1.5 text-right">{fmt(inv.vatAmount)}</td></tr>
                <tr className="text-white font-semibold border-t border-bb-border"><td colSpan={3} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{fmt(inv.total)}</td></tr>
              </tbody>
            </table>
          </div>
          {inv.vatNotes.map((n) => (
            <p key={n} className="text-xs text-bb-dim -mt-3">{n}</p>
          ))}

          {/* Payment + QR */}
          <div className="grid sm:grid-cols-[1fr_auto] gap-4 rounded-lg border border-bb-border p-3">
            <div className="text-xs space-y-1 text-bb-muted">
              <p className="text-white font-medium text-sm mb-1">{inv.paymentMethod === "STRIPE" ? "Card payment" : inv.currency === "EUR" ? "SEPA transfer" : "ACH / wire (Wise)"}</p>
              {inv.paymentMethod === "STRIPE" && inv.paymentUrl && <p className="break-all">{inv.paymentUrl}</p>}
              {inv.paymentMethod !== "STRIPE" && inv.currency === "EUR" && inv.seller.eur && (
                <>
                  <p>{inv.seller.eur.holder} · {inv.seller.eur.bank || "bank not set"}</p>
                  <p className="font-mono">{inv.seller.eur.iban ? inv.seller.eur.iban.replace(/(.{4})/g, "$1 ").trim() : "IBAN missing"}{inv.seller.eur.bic ? ` · ${inv.seller.eur.bic}` : ""}</p>
                </>
              )}
              {inv.paymentMethod !== "STRIPE" && inv.currency === "USD" && inv.seller.usd && (
                <>
                  <p>{inv.seller.usd.holder} · {inv.seller.usd.bank || "bank not set"}</p>
                  <p className="font-mono">Routing {inv.seller.usd.routing || "?"} · Account {inv.seller.usd.account || "?"}{inv.seller.usd.swift ? ` · ${inv.seller.usd.swift}` : ""}</p>
                </>
              )}
              <p>Reference: <span className="text-white font-medium">{inv.number || "(assigned on issue)"}</span></p>
              {inv.status !== "DRAFT" && <p className="break-all">Pay page: {inv.publicUrl}</p>}
            </div>
            {inv.qrDataUrl && (
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inv.qrDataUrl} alt="Payment QR code" width={112} height={112} className="rounded bg-white p-1" />
                <p className="text-[10px] text-bb-dim mt-1">{inv.qrKind === "EPC" ? "GiroCode" : "Opens pay link"}</p>
              </div>
            )}
          </div>

          {inv.integrity !== "none" && (
            <p className={`text-xs inline-flex items-center gap-1.5 ${inv.integrity === "ok" ? "text-bb-dim" : "text-red-400"}`}>
              {inv.integrity === "ok" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
              {inv.integrity === "ok" ? "Record unchanged since issue" : "RECORD CHANGED SINCE ISSUE. The stored content no longer matches its hash."}
              {inv.contentHash && <span className="font-mono text-[10px] opacity-70">{inv.contentHash.slice(0, 16)}…</span>}
            </p>
          )}

          {/* Internal note */}
          <div>
            <label className={labelCls}>Internal note (never printed)</label>
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} disabled={inv.status === "DRAFT"} placeholder={inv.status === "DRAFT" ? "Edit the draft to change its note" : ""} />
          </div>

          {/* Activity */}
          {inv.activity.length > 0 && (
            <div>
              <p className={labelCls}>History</p>
              <ul className="text-xs text-bb-dim space-y-1">
                {inv.activity.map((a) => (
                  <li key={a.id}>
                    <span className="text-bb-muted">{new Date(a.createdAt).toLocaleString("en-GB")}</span> · {a.actor} · {a.details || a.action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === "issue"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await act("/issue", { method: "POST" }, "Invoice issued"); }}
        title="Issue this invoice?"
        message="The next number in the sequence is assigned and the invoice becomes a permanent record. After this only the internal note can change; corrections mean voiding and issuing a new one."
        confirmLabel="Issue number"
        loading={busy}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); if (await act("", { method: "DELETE" }, "Draft deleted")) onClose(); }}
        title="Delete this draft?"
        message="Drafts have no number, so nothing is lost from the sequence."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={busy}
      />
      <ConfirmDialog
        open={confirm === "rotate"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await act("/rotate-link", { method: "POST" }, "New pay link created. The old link is dead."); }}
        title="Replace the pay link?"
        message="A new link is generated and the one already sent stops working. Send the new one to the client afterwards."
        confirmLabel="Replace link"
        confirmVariant="warning"
        loading={busy}
      />
      <ConfirmDialog
        open={confirm === "unpaid"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await act("/paid", { method: "DELETE" }, "Payment undone"); }}
        title="Undo the payment?"
        message="The invoice goes back to open. Use this only if it was marked paid by mistake."
        confirmLabel="Undo"
        confirmVariant="warning"
        loading={busy}
      />
    </Modal>
  );
}
