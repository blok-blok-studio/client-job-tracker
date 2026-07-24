"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { Package, Eye, Copy, Check, Search, Clock, Pencil, ThumbsUp } from "lucide-react";

interface DeliverableRow {
  id: string;
  token: string;
  title: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REVISION_REQUESTED";
  revisionNotes: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  revisionCount: number;
  createdBy: string | null;
  createdAt: string;
  files: Array<{ id: string }>;
  client: { id: string; name: string; company: string | null };
}

const STATUS_STYLES: Record<DeliverableRow["status"], string> = {
  PENDING_REVIEW: "bg-yellow-500/10 text-yellow-400",
  APPROVED: "bg-green-500/10 text-green-400",
  REVISION_REQUESTED: "bg-bb-orange/10 text-bb-orange",
};

const STATUS_LABELS: Record<DeliverableRow["status"], string> = {
  PENDING_REVIEW: "Awaiting review",
  APPROVED: "Approved",
  REVISION_REQUESTED: "Revision requested",
};

const STATUS_ICONS: Record<DeliverableRow["status"], React.ReactNode> = {
  PENDING_REVIEW: <Clock size={11} />,
  APPROVED: <ThumbsUp size={11} />,
  REVISION_REQUESTED: <Pencil size={11} />,
};

export default function DeliverablesPage() {
  const router = useRouter();
  const [items, setItems] = useState<DeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | DeliverableRow["status"]>("all");
  const [senderFilter, setSenderFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/deliverables");
        const json = await res.json();
        if (json.success) setItems(json.data);
      } catch (err) {
        console.error("Failed to fetch deliverables:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const senders = useMemo(() => {
    const set = new Set(items.map((d) => d.createdBy).filter(Boolean) as string[]);
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (senderFilter !== "all" && d.createdBy !== senderFilter) return false;
      if (q) {
        const haystack = [d.title, d.client.name, d.client.company, d.createdBy]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, statusFilter, senderFilter, query]);

  const awaiting = items.filter((d) => d.status === "PENDING_REVIEW").length;
  const needsWork = items.filter((d) => d.status === "REVISION_REQUESTED").length;

  function copyLink(d: DeliverableRow) {
    navigator.clipboard.writeText(`${window.location.origin}/review/${d.token}`);
    setCopiedId(d.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <>
      <TopBar title="Deliverables" />
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Deliverables</h1>
            <p className="text-bb-dim text-sm mt-1">
              Finished work across every client — {awaiting} awaiting review
              {needsWork > 0 && <>, <span className="text-bb-orange">{needsWork} need changes</span></>}
            </p>
          </div>
          <span className="text-sm text-bb-dim">{filtered.length} of {items.length}</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, client, or team member..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-bb-surface border border-bb-border text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange/50"
            />
          </div>
          {(["all", "PENDING_REVIEW", "REVISION_REQUESTED", "APPROVED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === s
                  ? "bg-bb-orange/10 text-bb-orange border border-bb-orange/30"
                  : "bg-bb-surface text-bb-muted border border-bb-border hover:border-bb-orange/20"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
            </button>
          ))}
          {senders.length > 1 && (
            <select
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-bb-surface border border-bb-border text-sm text-bb-muted focus:outline-none focus:border-bb-orange/50"
            >
              <option value="all">Everyone</option>
              {senders.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-bb-surface border border-bb-border rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-bb-border rounded w-3/4 mb-2" />
                <div className="h-3 bg-bb-border rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package size={28} className="mx-auto text-bb-dim mb-3" />
            <p className="text-bb-dim">
              {items.length === 0
                ? "No deliverables yet — create one from a client's Deliverables tab"
                : "No deliverables match"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => (
              <div key={d.id} className="bg-bb-surface border border-bb-border rounded-lg p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{d.title}</span>
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[d.status]}`}>
                      {STATUS_ICONS[d.status]} {STATUS_LABELS[d.status]}
                    </span>
                  </div>
                  <p className="text-xs text-bb-dim mt-1">
                    <button
                      onClick={() => router.push(`/clients/${d.client.id}`)}
                      className="text-bb-muted hover:text-bb-orange transition-colors font-medium"
                    >
                      {d.client.name}
                    </button>
                    {d.client.company && <> · {d.client.company}</>}
                    {" · "}sent {new Date(d.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    {d.createdBy && <> by {d.createdBy}</>}
                    {d.files.length > 0 && <> · {d.files.length} file{d.files.length !== 1 ? "s" : ""}</>}
                    {d.revisionCount > 0 && <> · {d.revisionCount} revision{d.revisionCount !== 1 ? "s" : ""}</>}
                    {d.respondedAt && (
                      <> · responded {new Date(d.respondedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {d.respondedBy && <> by {d.respondedBy}</>}</>
                    )}
                  </p>
                  {d.status === "REVISION_REQUESTED" && d.revisionNotes && (
                    <p className="text-xs text-bb-orange/90 mt-1.5 line-clamp-2 whitespace-pre-wrap">
                      &ldquo;{d.revisionNotes}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => copyLink(d)}
                    className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
                  >
                    {copiedId === d.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    {copiedId === d.id ? "Copied" : "Copy link"}
                  </button>
                  <button
                    onClick={() => window.open(`/review/${d.token}`, "_blank")}
                    className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
                  >
                    <Eye size={12} /> View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
