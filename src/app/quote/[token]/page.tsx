"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Download, Check } from "lucide-react";
import type { InvoiceView } from "@/lib/invoicing/types";
import { LABELS } from "@/lib/invoicing/types";
import { formatDate, formatMoney, formatQty } from "@/lib/invoicing/money";

type PublicQuote = Omit<InvoiceView, "id"> & { validUntil: string; schedule: Array<{ label: string; percent: number }> | null; quoteStatus: string; acceptedAt: string | null; acceptedName: string | null };

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [q, setQ] = useState<PublicQuote | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/quote/${token}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) {
          setQ(d.data);
          setState("ok");
        } else setState("missing");
      })
      .catch(() => setState("missing"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function act(path: "accept" | "decline") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/quote/${token}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(path === "accept" ? { name, agree } : {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <Shell><p className="text-sm text-neutral-500">Loading…</p></Shell>;
  if (state === "missing" || !q) return <Shell><h1 className="text-xl font-semibold text-white">Quote not found</h1><p className="text-sm text-neutral-400 mt-2">This link is not valid. Please contact chase@blokblokstudio.com.</p></Shell>;

  const L = LABELS[q.language];
  const lang = q.language;
  const de = lang === "de";
  const fmt = (n: number) => formatMoney(n, q.currency, lang);
  const open = q.quoteStatus === "SENT";
  const accepted = q.quoteStatus === "ACCEPTED" || q.quoteStatus === "CONVERTED";

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">{L.quote}</p>
          <h1 className="text-2xl font-semibold text-white mt-1">{q.number}</h1>
          <p className="text-sm text-neutral-400 mt-1">{q.billTo.company || q.billTo.name}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-white">{fmt(q.total)}</p>
          <p className="text-sm text-neutral-400 mt-1">{L.validUntil}: {formatDate(q.validUntil, lang)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-5">
        <a href={`/api/quote/${token}/pdf`} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-bb-blue text-white text-sm font-medium hover:bg-bb-blue-light"><Download size={15} /> PDF</a>
      </div>

      <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        {accepted ? (
          <p className="text-sm text-green-400 inline-flex items-center gap-2"><Check size={16} /> {de ? `Angenommen${q.acceptedName ? ` von ${q.acceptedName}` : ""} am ${formatDate(q.acceptedAt, lang)}. Wir melden uns mit den nächsten Schritten und der Anzahlungsrechnung.` : `Accepted${q.acceptedName ? ` by ${q.acceptedName}` : ""} on ${formatDate(q.acceptedAt, lang)}. We will follow up with next steps and the deposit invoice.`}</p>
        ) : q.quoteStatus === "DECLINED" ? (
          <p className="text-sm text-neutral-400">{de ? "Dieses Angebot wurde abgelehnt." : "This quote was declined."}</p>
        ) : q.quoteStatus === "EXPIRED" ? (
          <p className="text-sm text-neutral-400">{de ? "Dieses Angebot ist abgelaufen. Bitte fragen Sie nach einem neuen." : "This quote has expired. Please ask us for a fresh one."}</p>
        ) : open ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{de ? "Angebot annehmen" : "Accept this quote"}</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={de ? "Ihr vollständiger Name" : "Your full name"} className="w-full px-3 py-2 rounded-md bg-black border border-neutral-700 text-white text-sm" />
            <label className="flex items-start gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              {de ? `Ich nehme das Angebot ${q.number} im Namen von ${q.billTo.company || q.billTo.name} an. Mit der Annahme ist die erste Zahlung gemäß Zahlungsplan fällig.` : `I accept quote ${q.number} on behalf of ${q.billTo.company || q.billTo.name}. On acceptance the first payment per the schedule becomes due.`}
            </label>
            <div className="flex gap-2">
              <button disabled={busy || !agree || name.trim().length < 2} onClick={() => act("accept")} className="px-4 py-2 rounded-md bg-bb-blue text-white text-sm font-medium hover:bg-bb-blue-light disabled:opacity-50">{de ? "Annehmen" : "Accept"}</button>
              <button disabled={busy} onClick={() => act("decline")} className="px-3 py-2 rounded-md border border-neutral-700 text-neutral-300 text-sm">{de ? "Ablehnen" : "Decline"}</button>
            </div>
            {msg && <p className="text-xs text-red-400">{msg}</p>}
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-xs text-neutral-500"><tr><th className="text-left px-4 py-2 font-medium">{L.description}</th><th className="text-right px-4 py-2 font-medium">{L.qty}</th><th className="text-right px-4 py-2 font-medium hidden sm:table-cell">{L.unitPrice}</th><th className="text-right px-4 py-2 font-medium">{L.lineTotal}</th></tr></thead>
            <tbody>
              {q.items.map((it, i) => (
                <tr key={i} className="border-t border-neutral-800"><td className="px-4 py-2.5 text-white">{it.description}</td><td className="px-4 py-2.5 text-right text-neutral-300">{formatQty(it.qty, lang)}</td><td className="px-4 py-2.5 text-right text-neutral-300 hidden sm:table-cell">{fmt(it.unitPrice)}</td><td className="px-4 py-2.5 text-right text-white">{fmt(it.lineTotal)}</td></tr>
              ))}
              <tr className="border-t border-neutral-800 text-neutral-400"><td colSpan={3} className="px-4 py-2 text-right">{L.subtotal}</td><td className="px-4 py-2 text-right">{fmt(q.subtotal)}</td></tr>
              <tr className="text-neutral-400"><td colSpan={3} className="px-4 py-2 text-right">{L.vat} {q.vatRate}%</td><td className="px-4 py-2 text-right">{fmt(q.vatAmount)}</td></tr>
              <tr className="border-t border-neutral-700 text-white font-semibold"><td colSpan={3} className="px-4 py-2.5 text-right">{L.total}</td><td className="px-4 py-2.5 text-right">{fmt(q.total)}</td></tr>
            </tbody>
          </table>
        </div>
        {q.vatNotes.map((n) => <p key={n} className="text-xs text-neutral-500 mt-2">{n}</p>)}
        {q.schedule && q.schedule.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">{L.schedule}</p>
            <ul className="mt-1 text-sm text-neutral-300 space-y-0.5">
              {q.schedule.map((s, i) => <li key={i}>{s.percent}% · {s.label} · {fmt(Math.round(q.total * s.percent) / 100)}</li>)}
            </ul>
          </div>
        )}
        {q.notes && <p className="text-sm text-neutral-300 mt-5 whitespace-pre-wrap">{q.notes}</p>}
        <div className="grid sm:grid-cols-2 gap-4 text-sm mt-8">
          <div><p className="text-xs text-neutral-500 uppercase tracking-wide">{L.billTo}</p><p className="text-white mt-1">{q.billTo.company}</p><p className="text-neutral-300">{q.billTo.name !== q.billTo.company ? q.billTo.name : ""}</p>{q.billTo.addressLines.map((l) => <p key={l} className="text-neutral-400">{l}</p>)}</div>
          <div className="sm:text-right"><p className="text-xs text-neutral-500 uppercase tracking-wide">{L.from}</p><p className="text-white mt-1">{q.seller.sellerName}</p>{q.seller.addressLines.map((l) => <p key={l} className="text-neutral-400">{l}</p>)}<p className="text-neutral-400">{q.seller.email}</p></div>
        </div>
      </section>
      <p className="text-xs text-neutral-600 mt-10">{q.seller.sellerName} · {q.seller.addressLines.join(", ")} · {q.seller.email}</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Image src="/logo-wordmark-white.svg" alt="Blok Blok Studio" width={1025} height={550} className="h-20 w-auto mb-8" priority />
        {children}
      </div>
    </main>
  );
}
