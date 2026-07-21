"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { FileText, Eye, Download, Search, ShieldCheck } from "lucide-react";

interface ContractItem {
  id: string;
  token: string;
  status: "DRAFT" | "PENDING" | "SIGNED" | "EXPIRED";
  signedName: string | null;
  signedAt: string | null;
  providerSignedName: string | null;
  documentHash: string | null;
  createdAt: string;
  client: { id: string; name: string; company: string | null };
}

const STATUS_STYLES: Record<ContractItem["status"], string> = {
  SIGNED: "bg-green-500/10 text-green-400",
  EXPIRED: "bg-red-500/10 text-red-400",
  DRAFT: "bg-bb-orange/10 text-bb-orange",
  PENDING: "bg-yellow-500/10 text-yellow-400",
};

const STATUS_LABELS: Record<ContractItem["status"], string> = {
  SIGNED: "Signed",
  EXPIRED: "Expired",
  DRAFT: "Draft",
  PENDING: "Pending",
};

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | ContractItem["status"]>("all");
  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/contracts");
        const json = await res.json();
        if (json.success) setContracts(json.data);
      } catch (err) {
        console.error("Failed to fetch contracts:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const years = useMemo(() => {
    const set = new Set(contracts.map((c) => new Date(c.createdAt).getFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [contracts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (yearFilter !== "all" && new Date(c.createdAt).getFullYear() !== yearFilter) return false;
      if (q) {
        const haystack = [c.client.name, c.client.company, c.signedName].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, yearFilter, query]);

  return (
    <>
      <TopBar title="Contracts" />
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Contracts</h1>
            <p className="text-bb-dim text-sm mt-1">Every contract ever created — view or download any time</p>
          </div>
          <span className="text-sm text-bb-dim">{filtered.length} of {contracts.length}</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client, company, or signer..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-bb-surface border border-bb-border text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange/50"
            />
          </div>
          {(["all", "SIGNED", "PENDING", "DRAFT", "EXPIRED"] as const).map((s) => (
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
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg bg-bb-surface border border-bb-border text-sm text-bb-muted focus:outline-none focus:border-bb-orange/50"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Contract list */}
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
            <FileText size={28} className="mx-auto text-bb-dim mb-3" />
            <p className="text-bb-dim">No contracts match</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <div key={c.id} className="bg-bb-surface border border-bb-border rounded-lg p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => router.push(`/clients/${c.client.id}`)}
                      className="text-sm font-medium text-white hover:text-bb-orange transition-colors"
                    >
                      {c.client.name}
                    </button>
                    {c.client.company && <span className="text-xs text-bb-dim">{c.client.company}</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <p className="text-xs text-bb-dim mt-1">
                    Created {new Date(c.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    {c.status === "SIGNED" && c.signedName && (
                      <> · Signed by {c.signedName} on {new Date(c.signedAt!).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</>
                    )}
                  </p>
                  {c.documentHash && (
                    <p className="text-[10px] text-bb-dim/60 font-mono mt-0.5 truncate" title={c.documentHash}>
                      {c.documentHash}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => window.open(`/contract/${c.token}`, "_blank")}
                    className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
                  >
                    <Eye size={12} /> View
                  </button>
                  <button
                    onClick={() => window.open(`/api/contract/${c.token}/pdf`, "_blank")}
                    className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
                  >
                    <Download size={12} /> PDF
                  </button>
                  {c.status === "SIGNED" && (
                    <button
                      onClick={() => window.open(`/api/contract/${c.token}/certificate`, "_blank")}
                      className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
                    >
                      <ShieldCheck size={12} /> Certificate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
