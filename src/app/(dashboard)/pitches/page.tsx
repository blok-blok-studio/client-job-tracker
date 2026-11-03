"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Presentation, Plus, Loader2, Building2, UserRound, Image as ImageIcon } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { useToast } from "@/components/shared/Toast";
import { readJson } from "@/lib/fetch-json";
import { STATUS_STYLE, STATUS_LABEL } from "@/components/pitches/meta";

interface Row {
  id: string;
  kind: "INTERNAL" | "BRAND";
  status: "DRAFT" | "READY" | "SENT" | "WON" | "LOST";
  title: string;
  brandName: string;
  brandWebsite: string | null;
  authorName: string;
  updatedAt: string;
  mine: boolean;
  _count: { images: number };
}

const input =
  "px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-blue/50";

export default function PitchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [kind, setKind] = useState<"BRAND" | "INTERNAL">("BRAND");
  const [brand, setBrand] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const r = await readJson<{ data: Row[] }>(await fetch("/api/pitches"));
    if (r.ok) setRows(r.data!.data);
    else { setRows([]); toast(r.error!, "error"); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!brand.trim()) return;
    setCreating(true);
    const r = await readJson<{ data: { id: string } }>(
      await fetch("/api/pitches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, brandName: brand.trim() }) })
    );
    setCreating(false);
    if (!r.ok) return toast(r.error!, "error");
    router.push(`/pitches/${r.data!.data.id}`);
  };

  const shown = (rows || []).filter((r) => filter === "all" || r.mine);

  return (
    <div>
      <TopBar title="Pitches" subtitle="Plug in your research, get a branded PDF deck" />
      <div className="px-4 lg:px-6 pb-8 space-y-4">
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white">
            <Plus size={14} className="text-bb-accent" /> New pitch
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex rounded-lg border border-bb-border overflow-hidden shrink-0">
              {(["BRAND", "INTERNAL"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${kind === k ? "bg-bb-blue text-white" : "bg-bb-black text-bb-muted hover:text-white"}`}
                >
                  {k === "BRAND" ? <Building2 size={13} /> : <UserRound size={13} />}
                  {k === "BRAND" ? "To a brand" : "To Chase"}
                </button>
              ))}
            </div>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder={kind === "BRAND" ? "Which brand are you pitching?" : "Which brand should we go after?"}
              className={`${input} flex-1`}
              maxLength={120}
            />
            <button
              onClick={create}
              disabled={!brand.trim() || creating}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Start
            </button>
          </div>
          <p className="text-[11px] text-bb-dim">
            The PDF adds the Blok Blok logo, the brand&apos;s logo, our case studies and the booking link for you. You only write the research.
          </p>
        </div>

        <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white">
              <Presentation size={14} className="text-bb-accent" /> All pitches
            </h3>
            <div className="flex gap-1">
              {(["all", "mine"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium ${filter === f ? "bg-bb-elevated text-white" : "text-bb-dim hover:text-white"}`}
                >
                  {f === "all" ? "Everyone's" : "Mine"}
                </button>
              ))}
            </div>
          </div>
          {rows === null ? (
            <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-bb-dim" /></div>
          ) : shown.length === 0 ? (
            <p className="text-xs text-bb-dim py-6 text-center">No pitches yet. Start one above.</p>
          ) : (
            <div className="space-y-1.5">
              {shown.map((r) => (
                <Link
                  key={r.id}
                  href={`/pitches/${r.id}`}
                  className="flex items-center gap-3 rounded-lg border border-bb-border hover:border-bb-blue/50 bg-bb-black/40 px-3 py-2.5 transition-colors"
                >
                  {r.kind === "BRAND" ? <Building2 size={15} className="text-bb-dim shrink-0" /> : <UserRound size={15} className="text-bb-dim shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.title}</p>
                    <p className="text-[11px] text-bb-dim truncate">
                      {r.brandName}{r.brandWebsite ? ` · ${r.brandWebsite}` : ""} · {r.kind === "BRAND" ? "to the brand" : "to Chase"} · by {r.authorName}
                    </p>
                  </div>
                  {r._count.images > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-bb-dim shrink-0"><ImageIcon size={12} /> {r._count.images}</span>
                  )}
                  <span className="hidden sm:block text-[11px] text-bb-dim shrink-0">
                    {new Date(r.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
