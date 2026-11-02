"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Plus, ExternalLink } from "lucide-react";

interface Row {
  id: string;
  number: string | null;
  status: "DRAFT" | "ISSUED" | "SENT" | "PAID" | "VOID";
  total: number;
  currency: string;
  issueDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
}

const money = (n: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, minimumFractionDigits: 2 }).format(n);
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const TONE: Record<Row["status"], string> = { DRAFT: "text-bb-dim", ISSUED: "text-bb-accent", SENT: "text-blue-400", PAID: "text-green-400", VOID: "text-red-400" };

/** Owner-only card on the client page: this client's bank-transfer invoices + a shortcut to raise one. */
export default function ClientInvoices({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch(`/api/studio-invoices?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRows(j?.success ? j.data : []))
      .catch(() => setRows([]));
  }, [clientId]);

  const open = rows?.filter((r) => r.status === "ISSUED" || r.status === "SENT") || [];
  const overdue = open.filter((r) => r.dueDate && new Date(r.dueDate).getTime() < Date.now());

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Receipt size={16} className="text-bb-accent" /> Invoices
          {overdue.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{overdue.length} overdue</span>}
        </h3>
        <button onClick={() => router.push(`/invoices?new=1&client=${clientId}`)} className="text-bb-accent hover:text-bb-accent-light text-sm flex items-center gap-1">
          <Plus size={14} /> New
        </button>
      </div>
      {rows === null ? (
        <p className="text-xs text-bb-dim">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-bb-dim">No invoices yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 6).map((r) => (
            <button key={r.id} onClick={() => router.push(`/invoices?invoice=${r.id}`)} className="w-full flex items-center justify-between gap-3 text-left px-2 py-1.5 rounded hover:bg-bb-elevated/60">
              <div className="min-w-0">
                <p className="text-sm text-white font-mono truncate">{r.number || "Draft"}</p>
                <p className={`text-[11px] ${TONE[r.status]}`}>
                  {r.status === "PAID" ? `Paid ${d(r.paidAt)}` : r.status === "DRAFT" ? "Draft" : r.status === "VOID" ? "Void" : `Due ${d(r.dueDate)}`}
                </p>
              </div>
              <span className="text-sm text-white whitespace-nowrap">{money(r.total, r.currency)}</span>
            </button>
          ))}
          {rows.length > 6 && (
            <button onClick={() => router.push(`/invoices?client=${clientId}`)} className="text-xs text-bb-accent hover:underline inline-flex items-center gap-1 px-2 pt-1">
              All {rows.length} invoices <ExternalLink size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
