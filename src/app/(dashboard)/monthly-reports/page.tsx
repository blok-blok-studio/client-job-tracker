"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileBarChart, Upload, Sparkles, Send, Trash2, Loader2, CheckCircle2, Lightbulb, TrendingUp,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";

interface ReportMetric { label: string; value: string; change?: string | null }
interface TrajectoryItem {
  label: string;
  points: Array<{ month: string; value: string }>;
  direction: "up" | "down" | "flat";
  note: string;
}
interface ReportBody {
  metrics: ReportMetric[];
  highlights: string[];
  summary: string[];
  trajectory?: TrajectoryItem[];
  recommendations: string[];
}
interface ClientReport {
  id: string;
  month: string;
  status: "DRAFT" | "SENT";
  sentAt: string | null;
  sentTo: string | null;
  report: ReportBody | null;
  preparedBy?: string | null;
  updatedAt: string;
  client: { id: string; name: string; company: string | null; email: string | null };
}

function monthLabel(m: string) {
  return new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthlyReportsPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [selected, setSelected] = useState<ClientReport | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [rawData, setRawData] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/client-reports");
    const data = await res.json();
    if (data.success) setReports(data.data);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (d.success) setClients(d.data.map((c: { id: string; name: string; email: string | null }) => ({ id: c.id, name: c.name, email: c.email })));
    }).catch(() => {});
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => setIsOwner(d?.user?.role === "OWNER")).catch(() => {});
  }, [load]);

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    let combined = rawData;
    let pending = files.length;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        combined += `\n\n===== FILE: ${f.name} =====\n${String(reader.result).slice(0, 80000)}`;
        pending--;
        if (pending === 0) setRawData(combined.trim());
      };
      reader.readAsText(f);
    });
  }

  async function generate() {
    if (!clientId || !rawData.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/client-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, month, rawData: rawData.trim(), notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast("Report generated", "success");
        setSelected(data.data);
        load();
      } else {
        toast(data.error || "Generation failed", "error");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function sendReport() {
    if (!selected) return;
    setSending(true);
    try {
      const res = await fetch(`/api/client-reports/${selected.id}/send`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast(`Report emailed to ${selected.client.email}`, "success");
        setSelected({ ...selected, status: "SENT", sentTo: selected.client.email });
        load();
      } else {
        toast(data.error || "Send failed", "error");
      }
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  }

  async function removeReport(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (selected?.id === id) setSelected(null);
    await fetch(`/api/client-reports/${id}`, { method: "DELETE" });
  }

  const body = selected?.report;

  return (
    <div>
      <TopBar title="Monthly Reports" subtitle="Upload analytics exports, get client-ready reports" />
      <div className="px-4 lg:px-6 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: generate + history */}
        <div className="space-y-4">
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white">
              <Sparkles size={14} className="text-bb-orange" /> Generate a report
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              >
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              />
            </div>
            <textarea
              value={rawData}
              onChange={(e) => setRawData(e.target.value)}
              rows={7}
              placeholder={"Paste the analytics here — CSV exports, Meta Business Suite stats, TikTok analytics, or just copied numbers.\n\nInclude last month's numbers too if you want change percentages."}
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-xs font-mono text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".csv,.txt,.tsv,.json"
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
              <button
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Upload size={13} /> Add CSV files
              </button>
              <span className="text-[10px] text-bb-dim">appends file contents to the box above</span>
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for the report (campaigns run, launches, anything notable)…"
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
            <button
              onClick={generate}
              disabled={!clientId || !rawData.trim() || generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? "Analyzing… (can take a minute)" : "Generate report"}
            </button>
          </div>

          {/* History */}
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white mb-3">
              <FileBarChart size={14} className="text-bb-orange" /> Past reports
            </h3>
            {reports.length === 0 ? (
              <p className="text-xs text-bb-dim py-3">No reports yet.</p>
            ) : (
              <div className="space-y-1.5">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      selected?.id === r.id ? "border-bb-orange/60 bg-bb-black" : "border-bb-border bg-bb-black hover:border-bb-orange/30"
                    }`}
                    onClick={() => setSelected(r)}
                  >
                    <span className="flex-1 min-w-0 truncate text-sm text-white">{r.client.name}</span>
                    <span className="text-[11px] text-bb-muted shrink-0">{monthLabel(r.month)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${
                      r.status === "SENT" ? "bg-emerald-500/15 text-emerald-400" : "bg-bb-orange/15 text-bb-orange"
                    }`}>
                      {r.status === "SENT" ? "Sent" : "Draft"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeReport(r.id); }}
                      className="opacity-0 group-hover:opacity-100 text-bb-dim hover:text-red-400 transition-opacity shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
          {!selected || !body ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <FileBarChart size={36} className="text-bb-dim mb-3" />
              <p className="text-white font-medium">No report selected</p>
              <p className="text-sm text-bb-dim mt-1 max-w-xs">
                Generate a new report or pick one from history to preview it exactly as the client will read it.
              </p>
            </div>
          ) : (
            <div className="space-y-5 animate-fade-in-up">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-display font-bold text-white">{monthLabel(selected.month)} Performance Report</h2>
                  <p className="text-xs text-bb-dim mt-0.5">
                    {selected.client.name}
                    {selected.preparedBy && <span> · prepared by <span className="text-bb-orange">{selected.preparedBy}</span></span>}
                    {selected.status === "SENT" && selected.sentTo && (
                      <span className="text-emerald-400"> · sent to {selected.sentTo}</span>
                    )}
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => setConfirmSend(true)}
                    disabled={sending || !selected.client.email}
                    title={selected.client.email ? `Email to ${selected.client.email}` : "Client has no email on file"}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors shrink-0"
                  >
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {selected.status === "SENT" ? "Re-send" : "Send to client"}
                  </button>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2">
                {body.metrics.map((m) => (
                  <div
                    key={m.label}
                    className={`rounded-lg border border-bb-border border-l-4 bg-bb-black p-3 text-center ${
                      !m.change ? "border-l-bb-border" : m.change.trim().startsWith("-") ? "border-l-red-500" : m.change.trim().startsWith("+") ? "border-l-emerald-500" : "border-l-amber-500"
                    }`}
                  >
                    <p className="text-xl font-display font-bold text-white">{m.value}</p>
                    <p className="text-[11px] text-bb-dim mt-0.5">{m.label}</p>
                    {m.change && (
                      <p className={`text-[11px] font-semibold mt-0.5 ${m.change.trim().startsWith("-") ? "text-red-400" : "text-emerald-400"}`}>
                        {m.change}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {(body.trajectory?.length || 0) > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-bb-dim mb-2">
                    <TrendingUp size={12} /> Growth trajectory
                  </h3>
                  <div className="space-y-2">
                    {body.trajectory!.map((t) => {
                      const color = t.direction === "up" ? "emerald" : t.direction === "down" ? "red" : "amber";
                      return (
                        <div
                          key={t.label}
                          className={`rounded-lg border border-bb-border border-l-4 bg-bb-black p-3 ${
                            color === "emerald" ? "border-l-emerald-500" : color === "red" ? "border-l-red-500" : "border-l-amber-500"
                          }`}
                        >
                          <p className="text-sm font-semibold text-white mb-1.5">
                            {t.label}{" "}
                            <span className={color === "emerald" ? "text-emerald-400" : color === "red" ? "text-red-400" : "text-amber-400"}>
                              {t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "▶"}
                            </span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            {t.points.map((pt, i) => (
                              <span key={pt.month} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-bb-dim text-[10px]">→</span>}
                                <span
                                  className={`rounded px-2 py-1 text-[11px] ${
                                    i === t.points.length - 1
                                      ? color === "emerald" ? "bg-emerald-500/20 text-emerald-300 font-semibold" : color === "red" ? "bg-red-500/20 text-red-300 font-semibold" : "bg-amber-500/20 text-amber-300 font-semibold"
                                      : "bg-bb-elevated text-bb-muted"
                                  }`}
                                >
                                  <span className="opacity-60">{pt.month.slice(5)}/{pt.month.slice(2, 4)}</span> {pt.value}
                                </span>
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-bb-dim leading-relaxed">{t.note}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {body.highlights.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-bb-dim mb-2">
                    <TrendingUp size={12} /> Highlights
                  </h3>
                  <ul className="space-y-1.5">
                    {body.highlights.map((h, i) => (
                      <li key={i} className="flex gap-2 text-sm text-white leading-relaxed">
                        <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" /> {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                {body.summary.map((p, i) => (
                  <p key={i} className="text-sm text-bb-muted leading-relaxed">{p}</p>
                ))}
              </div>

              {body.recommendations.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-bb-dim mb-2">
                    <Lightbulb size={12} /> What&apos;s next
                  </h3>
                  <ul className="space-y-1.5">
                    {body.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-white leading-relaxed">
                        <span className="text-bb-orange shrink-0">→</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={sendReport}
        title="Send report"
        message={`Email the ${selected ? monthLabel(selected.month) : ""} report to ${selected?.client.email}? They'll receive the branded Blok Blok template.`}
        confirmLabel="Send report"
        loading={sending}
      />
    </div>
  );
}
