"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { Plus, Search, Settings as SettingsIcon, Receipt, Download, FileArchive, AlertTriangle, Link2, FileText, Repeat, FileSignature, Landmark, LineChart, BarChart3 } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import type { StudioInvoiceStatus } from "@/lib/invoicing/types";
import InvoiceEditor from "./InvoiceEditor";
import InvoiceDetail from "./InvoiceDetail";
import InvoiceSettingsPanel from "./InvoiceSettingsPanel";
import PlansPanel from "./PlansPanel";
import QuotesPanel from "./QuotesPanel";
import BankPanel from "./BankPanel";
import TrackerPanel from "./TrackerPanel";
import AnalyticsPanel from "./AnalyticsPanel";
import { StatusBadge, isOverdue, shortDate, money, byCurrency, chipCls, btnPrimary, btnGhost, inputCls, readJsonSafe } from "./shared";

interface Row {
  id: string;
  token: string;
  number: string | null;
  status: StudioInvoiceStatus;
  template: string;
  language: string;
  currency: string;
  vatScheme: string;
  total: number;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  paidMethod: string | null;
  paymentReportedAt?: string | null;
  eurAmount?: number | null;
  paymentMethod: string;
  createdAt: string;
  client: { id: string; name: string; company: string | null };
  partner?: { id: string; name: string } | null;
  kind?: string;
  milestone?: string | null;
  readyAt?: string | null;
}

interface Summary {
  outstanding: { count: number; byCurrency: Record<string, number> };
  overdue: { count: number; byCurrency: Record<string, number> };
  paidThisMonth: { count: number; byCurrency: Record<string, number> };
  revenue: { year: number; totalEur: number; studioEur: number; stripeEur: number; ceilingEur: number; pct: number; kleinunternehmerUntil: string } | null;
  income: { year: number; months: Array<{ month: string; count: number; byCurrency: Record<string, number>; eur: number }>; ytdEur: number; ytdByCurrency: Record<string, number>; count: number } | null;
  reported: number;
  setup: { missingBank: { EUR: string[]; USD: string[] }; warnings: string[] };
}

type Filter = "all" | "open" | "overdue" | "DRAFT" | "PAID" | "VOID";

export default function InvoicesPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [autoPreview, setAutoPreview] = useState(search.get("preview") === "1");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [year, setYear] = useState<"all" | number>("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"invoices" | "tracker" | "analytics" | "plans" | "quotes" | "bank" | "settings">((["settings", "plans", "quotes", "bank", "tracker", "analytics"].includes(search.get("tab") || "") ? search.get("tab") : "invoices") as "invoices" | "tracker" | "analytics" | "plans" | "quotes" | "bank" | "settings");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const [editorClientId, setEditorClientId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(search.get("client"));
  const [detailId, setDetailId] = useState<string | null>(search.get("invoice"));
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/studio-invoices");
      const json = await readJsonSafe(res);
      if (json.success) {
        setRows(json.data as Row[]);
        setSummary(json.summary as Summary);
      } else toast(json.error || "Could not load invoices", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (search.get("new") === "1") {
      setEditorClientId(search.get("client"));
      setClientFilter(null);
      setEditorOpen(true);
      router.replace("/invoices");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => new Date(r.issueDate || r.createdAt).getUTCFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (clientFilter && r.client.id !== clientFilter) return false;
      if (filter === "open" && !(r.status === "ISSUED" || r.status === "SENT")) return false;
      if (filter === "overdue" && !isOverdue(r)) return false;
      if ((filter === "DRAFT" || filter === "PAID" || filter === "VOID") && r.status !== filter) return false;
      if (year !== "all" && new Date(r.issueDate || r.createdAt).getUTCFullYear() !== year) return false;
      if (q) {
        const hay = [r.number, r.client.name, r.client.company, r.currency, String(r.total)].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, year, query, clientFilter]);

  const bankMissing = !!summary && summary.setup.missingBank.EUR.length > 0 && summary.setup.missingBank.USD.length > 0;
  const rev = summary?.revenue;
  const ready = rows.filter((r) => r.status === "DRAFT" && r.readyAt);
  const revTone = !rev ? "" : rev.pct >= 100 ? "border-red-500/40 bg-red-500/10" : rev.pct >= 80 ? "border-amber-500/40 bg-amber-500/10" : "border-bb-border bg-bb-surface";

  async function copyLink(r: Row) {
    const url = `${window.location.origin}/b/${r.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Pay link copied", "success");
    } catch {
      toast(url, "info");
    }
  }

  const [ey, em] = exportMonth.split("-").map(Number);

  return (
    <>
      <TopBar title="Invoices" subtitle="Bank transfer invoices with GiroCode / Wise, numbered BBS-YYYY-###" />
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Invoices</h1>
            <p className="text-bb-dim text-sm mt-1">Our own invoices, paid by bank transfer.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className={chipCls(tab === "invoices")} onClick={() => setTab("invoices")}>
              <span className="inline-flex items-center gap-1.5"><Receipt size={14} /> Invoices</span>
            </button>
            <button className={chipCls(tab === "tracker")} onClick={() => setTab("tracker")}>
              <span className="inline-flex items-center gap-1.5"><LineChart size={14} /> Tracker</span>
            </button>
            <button className={chipCls(tab === "analytics")} onClick={() => setTab("analytics")}>
              <span className="inline-flex items-center gap-1.5"><BarChart3 size={14} /> Analytics</span>
            </button>
            <button className={chipCls(tab === "plans")} onClick={() => setTab("plans")}>
              <span className="inline-flex items-center gap-1.5"><Repeat size={14} /> Plans</span>
            </button>
            <button className={chipCls(tab === "quotes")} onClick={() => setTab("quotes")}>
              <span className="inline-flex items-center gap-1.5"><FileSignature size={14} /> Quotes</span>
            </button>
            <button className={chipCls(tab === "bank")} onClick={() => setTab("bank")}>
              <span className="inline-flex items-center gap-1.5"><Landmark size={14} /> Bank</span>
            </button>
            <button className={chipCls(tab === "settings")} onClick={() => setTab("settings")}>
              <span className="inline-flex items-center gap-1.5"><SettingsIcon size={14} /> Settings</span>
            </button>
            {tab === "invoices" && (
              <button className={`${btnPrimary} inline-flex items-center gap-1.5`} onClick={() => { setEditDraftId(null); setEditorOpen(true); }}>
                <Plus size={14} /> New invoice
              </button>
            )}
          </div>
        </div>

        {tab === "settings" ? (
          <InvoiceSettingsPanel onSaved={load} />
        ) : tab === "tracker" ? (
          <TrackerPanel />
        ) : tab === "analytics" ? (
          <AnalyticsPanel />
        ) : tab === "plans" ? (
          <PlansPanel onInvoiceIssued={(preparedId) => { load(); if (preparedId) { setTab("invoices"); setAutoPreview(true); setDetailId(preparedId); } }} />
        ) : tab === "quotes" ? (
          <QuotesPanel onInvoiceDrafted={(id) => { load(); setDetailId(id); }} />
        ) : tab === "bank" ? (
          <BankPanel onChanged={load} />
        ) : (
          <>
            {bankMissing && (
              <button onClick={() => setTab("settings")} className="w-full text-left mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>Bank details are not set yet. Add the IBAN (EUR) and the Wise USD account under Settings before issuing the first invoice. Nothing is pre-filled or guessed.</span>
              </button>
            )}

            {/* Prepared by automation, waiting for the owner's yes */}
            {ready.length > 0 && (
              <div className="mb-6 rounded-xl border border-bb-blue/40 bg-bb-blue/10 p-4">
                <p className="text-sm font-semibold text-white mb-1">Ready for your yes ({ready.length})</p>
                <p className="text-xs text-bb-muted mb-3">Prepared automatically. Nothing is numbered or emailed until you check it and press Issue and email.</p>
                <div className="space-y-2">
                  {ready.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-bb-black/40 px-3 py-2">
                      <div className="flex-1 min-w-[160px]">
                        <p className="text-sm text-white">{r.client.company || r.client.name}</p>
                        <p className="text-xs text-bb-dim">{r.milestone ? `${r.milestone} · ` : ""}prepared {shortDate(r.readyAt)}</p>
                      </div>
                      <p className="text-sm font-semibold text-white">{money(r.total, r.currency)}</p>
                      <button className={btnPrimary} onClick={() => { setAutoPreview(true); setDetailId(r.id); }}>Review and send</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Tile label="Outstanding" value={summary ? byCurrency(summary.outstanding.byCurrency) : "…"} sub={summary ? `${summary.outstanding.count} open` : ""} />
              <Tile label="Overdue" value={summary ? byCurrency(summary.overdue.byCurrency) : "…"} sub={summary ? `${summary.overdue.count} past due` : ""} tone={summary && summary.overdue.count > 0 ? "red" : undefined} />
              <Tile label={`Income ${summary?.income?.year || ""} (paid)`} value={summary?.income ? money(summary.income.ytdEur, "EUR") : "…"} sub={summary?.income ? `${byCurrency(summary.income.ytdByCurrency)} · ${summary.income.count} paid${summary.reported ? ` · ${summary.reported} reported, unconfirmed` : ""}` : ""} tone="green" />
              {rev ? (
                <div className={`rounded-xl border p-3 ${revTone}`}>
                  <p className="text-xs text-bb-muted">§ 19 ceiling {rev.year}</p>
                  <p className="text-lg font-display font-bold text-white mt-0.5">{rev.pct}%</p>
                  <div className="h-1.5 rounded bg-bb-black/60 mt-1.5 overflow-hidden">
                    <div className={`h-full ${rev.pct >= 100 ? "bg-red-500" : rev.pct >= 80 ? "bg-amber-400" : "bg-white/70"}`} style={{ width: `${Math.min(100, rev.pct)}%` }} />
                  </div>
                  <p className="text-[11px] text-bb-dim mt-1">{money(rev.totalEur, "EUR")} of {money(rev.ceilingEur, "EUR")} · incl. Stripe paid</p>
                </div>
              ) : (
                <Tile label="§ 19 ceiling" value="…" sub="" />
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, client…" className={`${inputCls} pl-9 py-1.5 bg-bb-surface`} />
              </div>
              {(
                [
                  ["all", "All"],
                  ["open", "Open"],
                  ["overdue", "Overdue"],
                  ["PAID", "Paid"],
                  ["DRAFT", "Drafts"],
                  ["VOID", "Void"],
                ] as Array<[Filter, string]>
              ).map(([k, label]) => (
                <button key={k} className={chipCls(filter === k)} onClick={() => setFilter(k)}>{label}</button>
              ))}
              {clientFilter && (
                <button className={chipCls(true)} onClick={() => { setClientFilter(null); router.replace("/invoices"); }} title="Clear client filter">
                  {rows.find((r) => r.client.id === clientFilter)?.client.company || rows.find((r) => r.client.id === clientFilter)?.client.name || "This client"} ×
                </button>
              )}
              <select value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} className="px-3 py-1.5 rounded-lg bg-bb-surface border border-bb-border text-sm text-bb-muted focus:outline-none focus:border-bb-blue/50">
                <option value="all">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* List */}
            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-bb-surface border border-bb-border rounded-lg p-4 animate-pulse h-16" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 bg-bb-surface border border-bb-border rounded-xl">
                <FileText size={28} className="mx-auto text-bb-dim mb-3" />
                <p className="text-bb-dim">{rows.length === 0 ? "No invoices yet. Set up your bank details, then create the first one." : "No invoices match"}</p>
              </div>
            ) : (
              <div className="bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs text-bb-dim bg-bb-black/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Number</th>
                      <th className="text-left px-4 py-2.5 font-medium">Client</th>
                      <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Issued</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Due</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                      <th className="px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t border-bb-border/60 hover:bg-bb-elevated/40 cursor-pointer" onClick={() => setDetailId(r.id)}>
                        <td className="px-4 py-3 font-mono text-white">{r.number || <span className="text-bb-dim">draft</span>}{r.kind === "CORRECTION" && <span className="ml-1 font-sans text-[10px] text-red-300">storno</span>}</td>
                        <td className="px-4 py-3">
                          <p className="text-white">{r.client.company || r.client.name}</p>
                          {r.client.company && <p className="text-xs text-bb-dim">{r.client.name}</p>}
                          {r.partner && <p className="text-[10px] text-amber-300">via {r.partner.name}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-white whitespace-nowrap">{money(r.total, r.currency)}</td>
                        <td className="px-4 py-3 text-bb-muted hidden md:table-cell whitespace-nowrap">{shortDate(r.issueDate)}</td>
                        <td className={`px-4 py-3 hidden md:table-cell whitespace-nowrap ${isOverdue(r) ? "text-red-400" : "text-bb-muted"}`}>{r.status === "PAID" ? `paid ${shortDate(r.paidAt)}` : shortDate(r.dueDate)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} overdue={isOverdue(r)} />
                          {r.paymentReportedAt && r.status !== "PAID" && <p className="text-[10px] text-green-400 mt-0.5">client says paid</p>}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <a href={`/api/studio-invoices/${r.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className="inline-flex p-1.5 rounded text-bb-dim hover:text-white" title="PDF"><Download size={14} /></a>
                          {r.status !== "DRAFT" && (
                            <button onClick={() => copyLink(r)} className="inline-flex p-1.5 rounded text-bb-dim hover:text-white" title="Copy pay link"><Link2 size={14} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Income as booked */}
            {summary?.income && summary.income.months.length > 0 && (
              <div className="mt-6 bg-bb-surface border border-bb-border rounded-xl p-4">
                <p className="text-sm text-white font-medium">Income by month, as booked in EUR</p>
                <p className="text-xs text-bb-dim mb-3">Paid bank-transfer invoices only. USD is converted at the ECB rate of the day the money arrived (the rate is stored on each invoice), so the EUR figure is what goes in the German books.</p>
                <table className="w-full text-sm">
                  <thead className="text-xs text-bb-dim">
                    <tr><th className="text-left py-1 font-medium">Month</th><th className="text-right py-1 font-medium">Invoices</th><th className="text-right py-1 font-medium">Received</th><th className="text-right py-1 font-medium">Booked (EUR)</th></tr>
                  </thead>
                  <tbody>
                    {summary.income.months.map((m) => (
                      <tr key={m.month} className="border-t border-bb-border/60">
                        <td className="py-1.5 text-white">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
                        <td className="py-1.5 text-right text-bb-muted">{m.count}</td>
                        <td className="py-1.5 text-right text-bb-muted">{byCurrency(m.byCurrency)}</td>
                        <td className="py-1.5 text-right text-white">{money(m.eur, "EUR")}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-bb-border font-semibold"><td className="py-1.5 text-white">Year to date</td><td className="py-1.5 text-right text-bb-muted">{summary.income.count}</td><td className="py-1.5 text-right text-bb-muted">{byCurrency(summary.income.ytdByCurrency)}</td><td className="py-1.5 text-right text-white">{money(summary.income.ytdEur, "EUR")}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Monthly pack for the tax advisor */}
            <div className="mt-6 bg-bb-surface border border-bb-border rounded-xl p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm text-white font-medium">Monthly pack for BD Berlin Digital Tax</p>
                <p className="text-xs text-bb-dim">CSV log (number · client · amount · currency · dates · paid · method) and every invoice PDF of the month. Add the bank statement yourself.</p>
              </div>
              <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className={`${inputCls} w-auto py-1.5`} />
              <a href={`/api/studio-invoices/export?year=${ey}&month=${em}&format=csv`} className={`${btnGhost} inline-flex items-center gap-1.5`}><Download size={14} /> CSV</a>
              <a href={`/api/studio-invoices/export?year=${ey}&month=${em}&format=zip`} className={`${btnGhost} inline-flex items-center gap-1.5`}><FileArchive size={14} /> PDFs + CSV (zip)</a>
              <a href={`/api/studio-invoices/export?year=${ey}&month=${em}&format=datev`} className={`${btnGhost} inline-flex items-center gap-1.5`} title="DATEV Buchungsstapel (EXTF) for the advisor's import">DATEV</a>
              <a href={`/api/studio-invoices/export?year=${ey}&format=csv`} className={`${btnGhost} inline-flex items-center gap-1.5`}>Whole {ey} CSV</a>
            </div>
          </>
        )}
      </div>

      <InvoiceEditor
        open={editorOpen}
        draftId={editDraftId}
        initialClientId={editorClientId}
        onClose={() => { setEditorOpen(false); setEditDraftId(null); setEditorClientId(null); }}
        onSaved={(id, preview) => { setEditorOpen(false); setEditDraftId(null); setEditorClientId(null); load(); setAutoPreview(preview); setDetailId(id); }}
      />
      <InvoiceDetail
        open={!!detailId}
        id={detailId}
        autoPreview={autoPreview}
        onClose={() => { setDetailId(null); setAutoPreview(false); }}
        onEdit={(id) => { setDetailId(null); setEditDraftId(id); setEditorOpen(true); }}
        onChanged={load}
      />
    </>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "red" | "green" }) {
  return (
    <div className="rounded-xl border border-bb-border bg-bb-surface p-3">
      <p className="text-xs text-bb-muted">{label}</p>
      <p className={`text-lg font-display font-bold mt-0.5 ${tone === "red" ? "text-red-400" : tone === "green" ? "text-green-400" : "text-white"}`}>{value}</p>
      <p className="text-[11px] text-bb-dim mt-1">{sub}</p>
    </div>
  );
}
