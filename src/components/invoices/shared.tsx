"use client";

import Badge from "@/components/shared/Badge";
import type { StudioInvoiceStatus } from "@/lib/invoicing/types";

export const STATUS_LABELS: Record<StudioInvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SENT: "Sent",
  PAID: "Paid",
  VOID: "Void",
};

const STATUS_VARIANTS: Record<StudioInvoiceStatus, "gray" | "orange" | "blue" | "green" | "red" | "yellow"> = {
  DRAFT: "gray",
  ISSUED: "orange",
  SENT: "blue",
  PAID: "green",
  VOID: "red",
};

export function StatusBadge({ status, overdue }: { status: StudioInvoiceStatus; overdue?: boolean }) {
  if (overdue && (status === "ISSUED" || status === "SENT")) return <Badge variant="red">Overdue</Badge>;
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

export function byCurrency(map: Record<string, number> | undefined): string {
  if (!map) return "0";
  const parts = Object.entries(map).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(" + ") : money(0, "EUR");
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function isOverdue(row: { status: string; dueDate: string | null }): boolean {
  if (!row.dueDate || (row.status !== "ISSUED" && row.status !== "SENT")) return false;
  return new Date(row.dueDate).getTime() < Date.now();
}

export const inputCls =
  "w-full px-3 py-2 rounded-lg bg-bb-black border border-bb-border text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-blue/50";
export const labelCls = "block text-xs font-medium text-bb-muted mb-1";
export const chipCls = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
    active ? "bg-bb-blue/10 text-bb-accent border-bb-blue/30" : "bg-bb-surface text-bb-muted border-bb-border hover:border-bb-blue/20"
  }`;
export const btnPrimary = "px-4 py-2 rounded-lg bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
export const btnGhost = "px-3 py-2 rounded-lg bg-bb-surface border border-bb-border text-sm text-bb-muted hover:text-white hover:border-bb-blue/30 disabled:opacity-50 transition-colors";

export async function readJsonSafe(res: Response): Promise<{ success?: boolean; error?: string; data?: unknown; warning?: string | null; [k: string]: unknown }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text.slice(0, 200) || `HTTP ${res.status}` };
  }
}
