"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Check, X, Undo2 } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import Badge from "@/components/shared/Badge";
import { inputCls, btnPrimary, btnGhost, readJsonSafe, money, shortDate } from "./shared";

interface Tx {
  id: string;
  source: string;
  bookedAt: string;
  amount: number;
  currency: string;
  counterparty: string | null;
  reference: string | null;
  status: "UNMATCHED" | "SUGGESTED" | "MATCHED" | "IGNORED";
  invoice: { id: string; number: string | null; total: number; currency: string; status: string; client: { name: string; company: string | null } } | null;
  suggested: { id: string; number: string | null; total: number; currency: string; client: { name: string; company: string | null } } | null;
}
interface OpenInv {
  id: string;
  number: string | null;
  total: number;
  currency: string;
  client: { name: string; company: string | null };
}

export default function BankPanel({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Tx[]>([]);
  const [open, setOpen] = useState<OpenInv[]>([]);
  const [counts, setCounts] = useState({ unmatched: 0, suggested: 0 });
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [csv, setCsv] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const j = await readJsonSafe(await fetch("/api/studio-invoices/bank"));
    if (j.success) {
      setRows(j.data as Tx[]);
      setOpen((j.openInvoices as OpenInv[]) || []);
      setCounts((j.counts as typeof counts) || { unmatched: 0, suggested: 0 });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function doImport() {
    if (csv.trim().length < 10) return toast("Paste or choose a CSV first", "error");
    setBusy(true);
    try {
      const j = await readJsonSafe(await fetch("/api/studio-invoices/bank/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, defaultCurrency: currency }) }));
      const d = (j.data || {}) as { imported?: number; duplicates?: number; matched?: number; suggested?: number; unmatched?: number; skipped?: number; source?: string };
      if (!j.success) throw new Error(j.error || "Import failed");
      toast(`${d.source}: ${d.imported} new credits, ${d.matched} matched and marked paid, ${d.suggested} to confirm, ${d.unmatched} unmatched (${d.duplicates} already known)`, "success");
      setCsv("");
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  }
  async function act(tx: Tx, action: "confirm" | "ignore" | "unmatch", invoiceId?: string) {
    setBusy(true);
    try {
      const j = await readJsonSafe(await fetch(`/api/studio-invoices/bank/${tx.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invoiceId }) }));
      if (!j.success) throw new Error(j.error || "Failed");
      toast(action === "confirm" ? "Matched and marked paid" : action === "ignore" ? "Ignored" : "Undone", "success");
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  function onFile(file: File | undefined) {
    if (!file) return;
    file.text().then((t) => setCsv(t)).catch(() => toast("Could not read the file", "error"));
  }

  const shown = rows.filter((r) => filter === "all" || r.status === "UNMATCHED" || r.status === "SUGGESTED");
  const TONE: Record<Tx["status"], "gray" | "yellow" | "green" | "red"> = { UNMATCHED: "gray", SUGGESTED: "yellow", MATCHED: "green", IGNORED: "red" };

  return (
    <div className="space-y-5">
      <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
        <p className="text-sm text-white font-medium">Import a bank or Wise statement (CSV)</p>
        <p className="text-xs text-bb-dim mb-3">Incoming credits are matched to open invoices by the BBS number in the reference and marked paid on the booking date (receipt + EUR booking follow). Same amount without a number is suggested for you to confirm. Re-importing a file is harmless.</p>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose CSV</button>
          <select className={`${inputCls} w-auto py-1.5`} value={currency} onChange={(e) => setCurrency(e.target.value)} title="Currency when the file has no currency column">
            {["EUR", "USD", "GBP", "CHF"].map((c) => <option key={c} value={c}>{c} default</option>)}
          </select>
          <button className={btnPrimary} disabled={busy || csv.trim().length < 10} onClick={doImport}>{busy ? "Importing…" : "Import and match"}</button>
        </div>
        <textarea className={`${inputCls} font-mono text-xs`} rows={4} placeholder="…or paste the CSV text here" value={csv} onChange={(e) => setCsv(e.target.value)} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-white font-medium">Credits {counts.suggested + counts.unmatched > 0 && <span className="text-xs text-amber-300">· {counts.suggested} to confirm, {counts.unmatched} unmatched</span>}</p>
        <div className="flex gap-1.5">
          <button className={`${btnGhost} py-1`} onClick={() => setFilter("todo")} aria-pressed={filter === "todo"}>To do</button>
          <button className={`${btnGhost} py-1`} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>All</button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-bb-dim">{filter === "todo" ? "Nothing waiting." : "No imports yet."}</p>
      ) : (
        <div className="bg-bb-surface border border-bb-border rounded-xl divide-y divide-bb-border/60">
          {shown.map((tx) => (
            <div key={tx.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm">{money(tx.amount, tx.currency)} <span className="text-bb-dim">· {shortDate(tx.bookedAt)} · {tx.counterparty || "unknown payer"}</span></p>
                <p className="text-xs text-bb-dim truncate">{tx.reference || "no reference"}</p>
                {tx.status === "MATCHED" && tx.invoice && <p className="text-xs text-green-400">→ {tx.invoice.number} · {tx.invoice.client.company || tx.invoice.client.name}</p>}
                {tx.status === "SUGGESTED" && tx.suggested && <p className="text-xs text-amber-300">Looks like {tx.suggested.number} · {tx.suggested.client.company || tx.suggested.client.name} · {money(tx.suggested.total, tx.suggested.currency)}</p>}
              </div>
              <Badge variant={TONE[tx.status]}>{tx.status.toLowerCase()}</Badge>
              <div className="flex items-center gap-1.5">
                {(tx.status === "UNMATCHED" || tx.status === "SUGGESTED") && (
                  <>
                    <select className={`${inputCls} w-auto py-1 text-xs`} value={pick[tx.id] ?? tx.suggested?.id ?? ""} onChange={(e) => setPick({ ...pick, [tx.id]: e.target.value })}>
                      <option value="">Pick invoice…</option>
                      {open.filter((o) => o.currency === tx.currency).map((o) => <option key={o.id} value={o.id}>{o.number} · {o.client.company || o.client.name} · {money(o.total, o.currency)}</option>)}
                    </select>
                    <button className={`${btnGhost} py-1 inline-flex items-center gap-1`} disabled={busy || !(pick[tx.id] ?? tx.suggested?.id)} onClick={() => act(tx, "confirm", pick[tx.id] ?? tx.suggested?.id)}><Check size={12} /> Match</button>
                    <button className={`${btnGhost} py-1`} disabled={busy} onClick={() => act(tx, "ignore")} title="Not an invoice payment"><X size={12} /></button>
                  </>
                )}
                {(tx.status === "MATCHED" || tx.status === "IGNORED") && <button className={`${btnGhost} py-1`} disabled={busy} onClick={() => act(tx, "unmatch")} title="Undo"><Undo2 size={12} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
