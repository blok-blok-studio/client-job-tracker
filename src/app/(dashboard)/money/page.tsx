"use client";

import { useState, useEffect } from "react";
import { Wallet, TrendingUp, Hourglass, FileText, Repeat, Receipt } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

interface MoneySummary {
  stripeBalance: { available: number; pending: number; currency: string } | null;
  collected: number;
  collectedCount: number;
  collectedThisMonth: number;
  outstanding: number;
  outstandingCount: number;
  drafts: number;
  draftCount: number;
  mrr: number;
  pipeline: number;
  avgTicket: number;
  revenueByClient: Array<{ client: string; total: number }>;
  recentPaid: Array<{ id: string; client: string; amount: number; paidAt: string | null; notes: string | null }>;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Tile({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-bb-dim mb-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-display font-bold ${accent || "text-white"}`}>{value}</p>
      {sub && <p className="text-[11px] text-bb-dim mt-1">{sub}</p>}
    </div>
  );
}

export default function MoneyPage() {
  const [data, setData] = useState<MoneySummary | null>(null);

  useEffect(() => {
    fetch("/api/money/summary")
      .then((r) => r.json())
      .then((d) => d.success && setData(d.data))
      .catch(() => {});
  }, []);

  return (
    <div>
      <TopBar title="Money" subtitle="Collected, outstanding, and pipeline — live from invoices" />
      <div className="px-4 lg:px-6 pb-8 space-y-6">
        {!data ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Tile icon={<Wallet size={13} />} label="Collected" value={money(data.collected)} sub={`${data.collectedCount} paid invoices`} accent="text-emerald-400" />
              <Tile icon={<TrendingUp size={13} />} label="Collected this month" value={money(data.collectedThisMonth)} accent="text-emerald-400" />
              <Tile icon={<Hourglass size={13} />} label="Outstanding" value={money(data.outstanding)} sub={`${data.outstandingCount} awaiting payment`} accent={data.outstanding > 0 ? "text-amber-400" : "text-white"} />
              <Tile icon={<Repeat size={13} />} label="MRR (retainers)" value={money(data.mrr)} sub="active client retainers" accent="text-bb-orange" />
              <Tile icon={<FileText size={13} />} label="In pipeline" value={money(data.pipeline)} sub={`drafts + prospect retainers`} />
              <Tile icon={<Receipt size={13} />} label="Avg invoice (paid)" value={money(data.avgTicket)} />
              {data.stripeBalance && (
                <>
                  <Tile
                    icon={<Wallet size={13} />}
                    label="Stripe · available"
                    value={money(data.stripeBalance.available)}
                    sub="ready to pay out"
                    accent="text-emerald-400"
                  />
                  <Tile
                    icon={<Hourglass size={13} />}
                    label="Stripe · pending"
                    value={money(data.stripeBalance.pending)}
                    sub="clearing to your balance"
                    accent="text-blue-400"
                  />
                </>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h3 className="text-sm font-display font-semibold text-white mb-3">Revenue by client</h3>
                {data.revenueByClient.length === 0 ? (
                  <p className="text-xs text-bb-dim py-2">No paid invoices yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.revenueByClient.map((r) => {
                      const max = data.revenueByClient[0]?.total || 1;
                      return (
                        <div key={r.client}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-white truncate pr-2">{r.client}</span>
                            <span className="text-xs text-emerald-400 shrink-0">{money(r.total)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bb-elevated overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h3 className="text-sm font-display font-semibold text-white mb-3">Recent payments</h3>
                {data.recentPaid.length === 0 ? (
                  <p className="text-xs text-bb-dim py-2">No payments yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.recentPaid.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-lg bg-bb-black border border-bb-border px-3 py-2">
                        <span className="flex-1 min-w-0 truncate text-xs text-white">{p.client}</span>
                        {p.notes && <span className="hidden sm:block text-[10px] text-bb-dim truncate max-w-[140px]">{p.notes}</span>}
                        <span className="text-[10px] text-bb-dim shrink-0">
                          {p.paidAt ? new Date(p.paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                        </span>
                        <span className="text-xs font-semibold text-emerald-400 shrink-0">{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
