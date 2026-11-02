"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Download, Copy, Check, ExternalLink } from "lucide-react";
import type { InvoiceView } from "@/lib/invoicing/types";
import { LABELS } from "@/lib/invoicing/types";
import { formatDate, formatMoney, formatQty } from "@/lib/invoicing/money";

type PublicInvoice = Omit<InvoiceView, "id"> & { qrDataUrl: string | null };

// Client-facing pay page: the invoice, the bank details with copy buttons,
// the QR code and the PDF. Black and white, like the printed invoice.
export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [copied, setCopied] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    fetch(`/api/invoice/${token}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) {
          setInv(d.data);
          setState("ok");
        } else setState("missing");
      })
      .catch(() => setState("missing"));
  }, [token]);

  async function reportPaid() {
    setReportBusy(true);
    try {
      const r = await fetch(`/api/invoice/${token}/paid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: reportDate || null, note: reportNote || null }) });
      if (r.ok) {
        setReported(true);
        setReportOpen(false);
      }
    } finally {
      setReportBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // clipboard blocked: the value is visible anyway
    }
  }

  if (state === "loading") {
    return <Shell><p className="text-sm text-neutral-500">Loading…</p></Shell>;
  }
  if (state === "missing" || !inv) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-white">Invoice not found</h1>
        <p className="text-sm text-neutral-400 mt-2">This link is not valid. Please contact chase@blokblokstudio.com.</p>
      </Shell>
    );
  }

  const L = LABELS[inv.language];
  const lang = inv.language;
  const fmt = (n: number) => formatMoney(n, inv.currency, lang);
  const isPaid = inv.status === "PAID";
  const isVoid = inv.status === "VOID";
  const isCard = inv.paymentMethod === "STRIPE" && !!inv.paymentUrl;
  const eur = inv.currency === "EUR" ? inv.seller.eur : null;
  const usd = inv.currency === "USD" ? inv.seller.usd : null;
  const other = inv.currency !== "EUR" && inv.currency !== "USD" ? inv.seller.otherBanks?.find((b) => b.currency === inv.currency) || null : null;
  const rows: Array<[string, string, boolean]> = [];
  if (isCard) rows.push([L.cardHint, inv.paymentUrl!, true]);
  else if (eur) {
    rows.push([L.holder, eur.holder || inv.seller.sellerName, true]);
    if (eur.iban) rows.push([L.iban, eur.iban.replace(/(.{4})/g, "$1 ").trim(), true]);
    if (eur.bic) rows.push([L.bic, eur.bic, true]);
    if (eur.bank) rows.push([L.bank, eur.bank, false]);
  } else if (other) {
    rows.push([L.holder, other.holder || inv.seller.sellerName, true]);
    if (other.bank) rows.push([L.bank, other.bank, false]);
    for (const l of other.lines) rows.push([l.label, l.value, true]);
  } else if (usd) {
    rows.push([L.holder, usd.holder || inv.seller.sellerName, true]);
    if (usd.bank) rows.push([L.bank, usd.bank, false]);
    if (usd.routing) rows.push([L.routing, usd.routing, true]);
    if (usd.account) rows.push([L.account, usd.account, true]);
    if (usd.swift) rows.push([L.swift, usd.swift, true]);
    if (usd.bankAddress) rows.push(["", usd.bankAddress, false]);
  }
  rows.push([L.reference, inv.number || "", true]);

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">{inv.kind === "CORRECTION" ? L.correction : L.invoice}</p>
          <h1 className="text-2xl font-semibold text-white mt-1">{inv.number}</h1>
          <p className="text-sm text-neutral-400 mt-1">{inv.billTo.company || inv.billTo.name}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-white">{fmt(inv.total)}</p>
          {inv.kind === "CORRECTION" ? (
            <p className="text-sm text-neutral-400 mt-1">{L.correctionNote}</p>
          ) : isPaid ? (
            <p className="text-sm text-green-400 mt-1">{L.paid} · {formatDate(inv.paidAt, lang)}</p>
          ) : isVoid ? (
            <p className="text-sm text-red-400 mt-1">{L.void}</p>
          ) : inv.dueDate ? (
            <p className="text-sm text-neutral-400 mt-1">{L.dueDate}: {formatDate(inv.dueDate, lang)}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        <a href={`/api/invoice/${token}/pdf`} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white text-black text-sm font-medium hover:bg-neutral-200">
          <Download size={15} /> PDF
        </a>
        {isCard && !isPaid && !isVoid && (
          <a href={inv.paymentUrl!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-neutral-700 text-white text-sm hover:border-neutral-400">
            <ExternalLink size={15} /> {lang === "de" ? "Per Karte bezahlen" : "Pay by card"}
          </a>
        )}
        {!isCard && (usd || other) && inv.seller.wisePayLink && !isPaid && !isVoid && (
          <a href={inv.seller.wisePayLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-neutral-700 text-white text-sm hover:border-neutral-400">
            <ExternalLink size={15} /> {lang === "de" ? "Mit Wise bezahlen" : "Pay with Wise"}
          </a>
        )}
      </div>

      {/* Payment block: only while there is something to pay */}
      {!isVoid && !isPaid && (
        <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{isCard ? L.paymentTitleCard : L.paymentTitle}</h2>
          <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-6">
            <dl className="space-y-2 text-sm">
              {rows.map(([k, v, copyable]) => (
                <div key={`${k}-${v}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {k && <dt className="text-xs text-neutral-500">{k}</dt>}
                    <dd className={`text-white break-all ${k === L.reference ? "font-semibold" : ""} ${k === L.iban || k === L.account || k === L.routing ? "font-mono" : ""}`}>{v}</dd>
                  </div>
                  {copyable && v && (
                    <button onClick={() => copy(k || v, v.replace(/\s+/g, k === L.iban ? "" : " "))} aria-label={`Copy ${k}`} className="shrink-0 p-1.5 rounded text-neutral-500 hover:text-white">
                      {copied === (k || v) ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              ))}
              {inv.dueDate && !isPaid && <p className="text-xs text-neutral-500 pt-1">{L.payBy} {formatDate(inv.dueDate, lang)}.</p>}
            </dl>
            {inv.qrDataUrl && !isPaid && (
              <div className="text-center sm:w-44">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inv.qrDataUrl} alt="QR" width={176} height={176} className="rounded-lg bg-white p-2 mx-auto" />
                <p className="text-[11px] text-neutral-500 mt-2 leading-snug">{inv.qrKind === "EPC" ? L.qrCaption : L.qrCaptionUrl}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* I have paid */}
      {!isVoid && !isPaid && (
        <section className="mt-5">
          {reported || inv.paymentReportedAt ? (
            <p className="text-sm text-green-400">{L.reportPaidDone}</p>
          ) : reportOpen ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
              <p className="text-xs text-neutral-500">{L.reportPaidHint}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="text-xs text-neutral-500">
                  {L.reportPaidDate}
                  <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md bg-black border border-neutral-700 text-white text-sm" />
                </label>
                <label className="text-xs text-neutral-500">
                  {L.reportPaidRef}
                  <input value={reportNote} onChange={(e) => setReportNote(e.target.value)} maxLength={200} className="mt-1 w-full px-3 py-2 rounded-md bg-black border border-neutral-700 text-white text-sm" />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={reportPaid} disabled={reportBusy} className="px-4 py-2 rounded-md bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-50">{L.reportPaid}</button>
                <button onClick={() => setReportOpen(false)} className="px-3 py-2 rounded-md border border-neutral-700 text-neutral-300 text-sm">{lang === "de" ? "Abbrechen" : "Cancel"}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-neutral-700 text-white text-sm hover:border-neutral-400">
              <Check size={15} /> {L.reportPaid}
            </button>
          )}
        </section>
      )}

      {/* Items */}
      <section className="mt-8">
        <div className="grid sm:grid-cols-2 gap-4 text-sm mb-5">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide">{L.billTo}</p>
            <p className="text-white mt-1">{inv.billTo.company}</p>
            <p className="text-neutral-300">{inv.billTo.name !== inv.billTo.company ? inv.billTo.name : ""}</p>
            {inv.billTo.addressLines.map((l) => <p key={l} className="text-neutral-400">{l}</p>)}
            {inv.billTo.vatId && <p className="text-neutral-400">{L.clientVatId}: {inv.billTo.vatId}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">{L.from}</p>
            <p className="text-white mt-1">{inv.seller.sellerName}</p>
            {inv.seller.addressLines.map((l) => <p key={l} className="text-neutral-400">{l}</p>)}
            {inv.seller.steuernummer && <p className="text-neutral-400">{L.taxNumber}: {inv.seller.steuernummer}</p>}
            {inv.seller.ustIdNr && <p className="text-neutral-400">{L.vatId}: {inv.seller.ustIdNr}</p>}
            <p className="text-neutral-400 mt-1">{L.issueDate}: {formatDate(inv.issueDate, lang)}</p>
            {(inv.serviceDateFrom || inv.serviceDateTo) && (
              <p className="text-neutral-400">
                {inv.serviceDateFrom && inv.serviceDateTo && inv.serviceDateFrom !== inv.serviceDateTo ? `${L.servicePeriod}: ${formatDate(inv.serviceDateFrom, lang)} - ${formatDate(inv.serviceDateTo, lang)}` : `${L.serviceDate}: ${formatDate(inv.serviceDateFrom || inv.serviceDateTo, lang)}`}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{L.description}</th>
                <th className="text-right px-4 py-2 font-medium">{L.qty}</th>
                <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">{L.unitPrice}</th>
                <th className="text-right px-4 py-2 font-medium">{L.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i} className="border-t border-neutral-800">
                  <td className="px-4 py-2.5 text-white">{it.description}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-300">{formatQty(it.qty, lang)}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-300 hidden sm:table-cell">{fmt(it.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-white">{fmt(it.lineTotal)}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-800 text-neutral-400"><td colSpan={3} className="px-4 py-2 text-right">{L.subtotal}</td><td className="px-4 py-2 text-right">{fmt(inv.subtotal)}</td></tr>
              <tr className="text-neutral-400"><td colSpan={3} className="px-4 py-2 text-right">{L.vat} {inv.vatRate}%</td><td className="px-4 py-2 text-right">{fmt(inv.vatAmount)}</td></tr>
              <tr className="border-t border-neutral-700 text-white font-semibold"><td colSpan={3} className="px-4 py-2.5 text-right">{L.totalDue}</td><td className="px-4 py-2.5 text-right">{fmt(inv.total)}</td></tr>
            </tbody>
          </table>
        </div>
        {inv.vatNotes.map((n) => <p key={n} className="text-xs text-neutral-500 mt-2">{n}</p>)}
        {inv.notes && <p className="text-sm text-neutral-300 mt-4 whitespace-pre-wrap">{inv.notes}</p>}
      </section>

      <p className="text-xs text-neutral-600 mt-10">
        {inv.seller.sellerName} · {inv.seller.addressLines.join(", ")} · {inv.seller.email}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Image src="/bb_logo_wordmark_subhead_WHT_PNG.png" alt="Blok Blok Studio" width={160} height={86} className="h-12 w-auto mb-8" priority />
        {children}
      </div>
    </main>
  );
}
