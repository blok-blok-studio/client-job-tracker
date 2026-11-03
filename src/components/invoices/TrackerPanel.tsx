"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileArchive, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import Badge from "@/components/shared/Badge";
import type { CostRow, TrackerRow, YearSummary } from "@/lib/invoicing/tracker";
import { inputCls, chipCls, btnPrimary, btnGhost, readJsonSafe, money, shortDate } from "./shared";

type Group = "none" | "client" | "month" | "vat";
interface LastSync { syncedAt: string; rows?: number; unmatched?: number }

const TONE: Record<string, "green" | "red" | "yellow" | "gray" | "blue"> = { PAID: "green", OPEN: "blue", OVERDUE: "red", VOID: "gray", REFUNDED: "red", "PARTLY REFUNDED": "yellow", DISPUTED: "red", ISSUED: "blue", SENT: "blue" };
const eur = (n: number) => money(n, "EUR");
const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function TrackerPanel() {
  const { toast } = useToast();
  const [years, setYears] = useState<YearSummary[]>([]);
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const [unmatched, setUnmatched] = useState(0);
  const [year, setYear] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "invoice" | "stripe" | "out">("all");
  const [status, setStatus] = useState("all");
  const [group, setGroup] = useState<Group>("none");
  const [syncing, setSyncing] = useState(false);
  const [paste, setPaste] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await readJsonSafe(await fetch("/api/studio-invoices/tracker"));
    if (!j.success) return toast(j.error || "Could not load", "error");
    const d = j.data as { years: YearSummary[]; rows: TrackerRow[]; costs: CostRow[]; lastSync: LastSync | null; unmatched: number };
    setYears(d.years);
    setRows(d.rows);
    setCosts(d.costs);
    setLastSync(d.lastSync);
    setUnmatched(d.unmatched);
    const thisYear = new Date().getUTCFullYear();
    setYear((y) => y ?? (d.years.some((v) => v.year === thisYear) ? thisYear : (d.years[0]?.year ?? thisYear)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function importHistory() {
    setSyncing(true);
    try {
      const j = await readJsonSafe(await fetch("/api/stripe/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: paste }) }));
      if (!j.success) throw new Error(j.error || "Import failed");
      const d = j.data as { rows: number; created: number; unmatched: number; skipped: string[] };
      setImportResult(`${d.rows} payments read, ${d.created} new, ${d.unmatched} without a client, ${d.skipped.length} lines skipped.${d.skipped[0] ? ` First skipped: ${d.skipped[0]}` : ""}`);
      setPaste("");
      await load();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSyncing(false);
    }
  }

  const summary = years.find((y) => y.year === year);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.year !== year) return false;
      if (source !== "all" && r.source !== source) return false;
      if (status !== "all" && r.status !== status) return false;
      return !t || [r.reference, r.client, r.description, r.currency, r.method, r.status, r.vat, String(r.amount)].join(" ").toLowerCase().includes(t);
    });
  }, [rows, year, source, status, q]);
  const out = useMemo(() => {
    const t = q.trim().toLowerCase();
    return costs.filter((c) => c.year === year && (!t || [c.payee, c.reference, c.kind, String(c.amount)].join(" ").toLowerCase().includes(t)));
  }, [costs, year, q]);
  const shownEur = Math.round(shown.reduce((s, r) => s + (r.eur || 0), 0) * 100) / 100;
  const groups = useMemo(() => {
    if (group === "none") return [{ key: "", rows: shown }];
    const m = new Map<string, TrackerRow[]>();
    for (const r of shown) {
      const k = group === "client" ? r.client : group === "month" ? r.date.slice(0, 7) : r.source === "stripe" ? "Stripe (VAT not tracked per payment)" : r.vat || "None";
      m.set(k, [...(m.get(k) || []), r]);
    }
    return [...m.entries()].map(([key, list]) => ({ key, rows: list })).sort((a, b) => (group === "month" ? (a.key < b.key ? 1 : -1) : a.key.localeCompare(b.key)));
  }, [shown, group]);

  function downloadCsv() {
    const head = ["date", "source", "reference", "client", "description", "currency", "amount", "refunded", "eur_counted", "stripe_fee", "status", "method", "vat"];
    const body = shown.map((r) => [r.date, r.source, r.reference, r.client, r.description, r.currency, r.amount, r.refunded, r.eur ?? "", r.fee ?? "", r.status, r.method, r.vat].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + [head.join(","), ...body].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `blokblok-tracker-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Row = ({ r }: { r: TrackerRow }) => (
    <tr className="border-t border-bb-border/60">
      <td className="px-3 py-2 text-bb-muted whitespace-nowrap">{shortDate(r.date)}</td>
      <td className="px-3 py-2">
        <p className="text-white">{r.client}</p>
        <p className="text-xs text-bb-dim truncate max-w-[280px]">{r.description}</p>
      </td>
      <td className="px-3 py-2 text-xs text-bb-dim hidden md:table-cell">
        {r.href ? <a href={r.href} target={r.source === "stripe" ? "_blank" : undefined} rel="noreferrer" className="font-mono hover:text-white">{r.source === "stripe" ? "Stripe receipt" : r.reference}</a> : <span className="font-mono">{r.reference.slice(0, 18)}</span>}
      </td>
      <td className="px-3 py-2 text-right text-white whitespace-nowrap">
        {money(r.amount, r.currency)}
        {r.refunded > 0 && <p className="text-xs text-red-400">-{money(r.refunded, r.currency)} refunded</p>}
      </td>
      <td className="px-3 py-2 text-right text-bb-muted whitespace-nowrap hidden sm:table-cell">{r.eur != null ? eur(r.eur) : ""}</td>
      <td className="px-3 py-2"><Badge variant={TONE[r.status] || "gray"}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge></td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-2">
        <p className="text-sm text-white font-medium">Stripe history</p>
        <p className="text-xs text-bb-dim">
          {lastSync ? `Imported ${new Date(lastSync.syncedAt).toLocaleString("en-GB")}${lastSync.rows ? `, ${lastSync.rows} payments` : ""}. Stripe is not connected.` : "One-time import. Paste one payment per line: date,amount,currency,email,description,status. Stripe is not connected."}
        </p>
        <textarea aria-label="Stripe history" className={`${inputCls} font-mono text-xs`} rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="2026-11-01,200.00,USD,client@example.com,Subscription update" />
        <div className="flex items-center gap-3">
          <button className={btnPrimary} disabled={syncing || paste.trim().length < 10} onClick={importHistory}>{syncing ? "Importing…" : "Import payments"}</button>
          {importResult && <p className="text-xs text-bb-muted">{importResult}</p>}
          {unmatched > 0 && <p className="text-xs text-amber-300 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {unmatched} payment(s) have no client. They still count in the year totals.</p>}
        </div>
      </div>

      {years.length > 0 && (
        <div className="bg-bb-surface border border-bb-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-bb-dim bg-bb-black/30">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Year</th>
                <th className="text-right px-4 py-2.5 font-medium">Income (EUR)</th>
                <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">Bank + Wise</th>
                <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">Stripe</th>
                <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Received</th>
                <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Money out</th>
                <th className="text-right px-4 py-2.5 font-medium">Payments</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year} onClick={() => setYear(y.year)} className={`border-t border-bb-border/60 cursor-pointer ${y.year === year ? "bg-bb-blue/15" : "hover:bg-bb-elevated/40"}`}>
                  <td className="px-4 py-2.5 text-white font-semibold">{y.year}</td>
                  <td className="px-4 py-2.5 text-right text-white font-semibold">{eur(y.incomeEur)}{y.missingEur > 0 && <span className="block text-[11px] font-normal text-amber-300">{y.missingEur} without EUR</span>}</td>
                  <td className="px-4 py-2.5 text-right text-bb-muted hidden sm:table-cell">{eur(y.invoiceEur)}</td>
                  <td className="px-4 py-2.5 text-right text-bb-muted hidden sm:table-cell">{eur(y.stripeEur)}</td>
                  <td className="px-4 py-2.5 text-right text-bb-muted hidden md:table-cell">{Object.entries(y.byCurrency).map(([c, v]) => money(v, c)).join(" + ")}</td>
                  <td className="px-4 py-2.5 text-right text-bb-muted hidden md:table-cell">{Object.entries(y.costs).map(([c, v]) => money(v, c)).join(" + ") || "-"}</td>
                  <td className="px-4 py-2.5 text-right text-bb-muted">{y.payments}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-bb-dim border-t border-bb-border/60">Income counts by the date money arrived, net of refunds, before Stripe fees. Click a year to open it.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${year ?? ""}: client, number, amount…`} className={`${inputCls} pl-9 py-1.5 bg-bb-surface`} />
        </div>
        {(["all", "invoice", "stripe", "out"] as const).map((s) => (
          <button key={s} className={chipCls(source === s)} onClick={() => setSource(s)}>{s === "all" ? "All in" : s === "invoice" ? "Invoices" : s === "stripe" ? "Stripe" : "Money out"}</button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} !w-auto py-1.5`} aria-label="Status">
          {["all", "PAID", "OPEN", "OVERDUE", "PARTLY REFUNDED", "REFUNDED", "DISPUTED", "VOID"].map((s) => <option key={s} value={s}>{s === "all" ? "Any status" : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value as Group)} className={`${inputCls} !w-auto py-1.5`} aria-label="Group by">
          <option value="none">No grouping</option>
          <option value="client">By client</option>
          <option value="month">By month</option>
          <option value="vat">By VAT type</option>
        </select>
      </div>

      {source === "out" ? (
        <div className="bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
          {out.length === 0 ? <p className="text-sm text-bb-dim p-6 text-center">Nothing recorded for {year}.</p> : (
            <table className="w-full text-sm"><tbody>
              {out.map((c) => (
                <tr key={c.id} className="border-t border-bb-border/60 first:border-0">
                  <td className="px-3 py-2 text-bb-muted whitespace-nowrap">{shortDate(c.date)}</td>
                  <td className="px-3 py-2 text-white">{c.payee}<p className="text-xs text-bb-dim">{c.kind === "partner" ? "Partner commission" : "Contractor invoice"} {c.reference}</p></td>
                  <td className="px-3 py-2 text-right text-white whitespace-nowrap">{money(c.amount, c.currency)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-bb-dim bg-bb-surface border border-bb-border rounded-xl p-6 text-center">Nothing matches for {year ?? "this year"}.</p>
      ) : (
        groups.map((g) => (
          <div key={g.key || "all"} className="bg-bb-surface border border-bb-border rounded-xl overflow-x-auto">
            {g.key && <p className="px-3 py-2 text-sm text-white font-medium flex justify-between"><span>{g.key}</span><span className="text-bb-muted">{g.rows.length} · {eur(Math.round(g.rows.reduce((s, r) => s + (r.eur || 0), 0) * 100) / 100)}</span></p>}
            <table className="w-full text-sm"><tbody>{g.rows.slice(0, 500).map((r) => <Row key={`${r.source}${r.id}`} r={r} />)}</tbody></table>
          </div>
        ))
      )}

      <div className="bg-bb-surface border border-bb-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm text-white font-medium">Tax pack {year}</p>
          <p className="text-xs text-bb-dim">{shown.length} rows shown, {eur(shownEur)} counted{summary?.stripeFees ? `, ${money(summary.stripeFees, "EUR")} Stripe fees in the year` : ""}. The pack holds money in, money out, invoice PDFs, partner statements, DATEV and a summary.</p>
        </div>
        <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={downloadCsv}><Download size={14} /> This list (CSV)</button>
        <a href={`/api/studio-invoices/export?year=${year}&format=zip`} className={`${btnPrimary} inline-flex items-center gap-1.5`}><FileArchive size={14} /> Download tax pack</a>
      </div>
    </div>
  );
}
