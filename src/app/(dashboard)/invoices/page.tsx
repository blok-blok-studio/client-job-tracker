"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Trash2, ChevronDown } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";

import { ListSkeleton } from "@/components/shared/Skeleton";

interface Invoice {
  id: string;
  amount: string | number;
  currency: string;
  status: string;
  region: string;
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  client: { id: string; name: string };
}

export default function InvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<"US" | "EU">("EU");
  const [selectedCountry, setSelectedCountry] = useState<string>("DE");

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/invoices?${params}`);
      const data = await res.json();
      if (data.success) setInvoices(data.data);
    } catch { /* silently fail */ }
  }, [filterStatus]);

  useEffect(() => {
    Promise.all([
      fetchInvoices(),
      fetch("/api/clients").then((r) => r.json()).then((d) => {
        if (d.success) setClients(d.data.map((c: Record<string, string>) => ({ id: c.id, name: c.name })));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [fetchInvoices]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: fd.get("clientId"),
          amount: Number(fd.get("amount")),
          currency: selectedRegion === "EU" ? "EUR" : "USD",
          status: fd.get("status") || "DRAFT",
          region: selectedRegion,
          country: selectedCountry,
          dueDate: fd.get("dueDate") || undefined,
          notes: fd.get("notes") || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowAdd(false);
      setSelectedRegion("US");
      setSelectedCountry("US");
      fetchInvoices();
    } catch { /* stay on form */ }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchInvoices();
    } catch { /* silently fail */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    try {
      await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      fetchInvoices();
    } catch { /* silently fail */ }
  }

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    return inv.client.name.toLowerCase().includes(search.toLowerCase());
  });

  // Group totals by currency to avoid mixing USD + EUR
  const currencies = [...new Set(filtered.map(i => i.currency || "USD"))];
  const totalsByCurrency = currencies.map(currency => {
    const items = filtered.filter(i => (i.currency || "USD") === currency);
    return {
      currency,
      all: items.reduce((s, i) => s + Number(i.amount), 0),
      paid: items.filter(i => i.status === "PAID").reduce((s, i) => s + Number(i.amount), 0),
      outstanding: items.filter(i => ["SENT", "OVERDUE"].includes(i.status)).reduce((s, i) => s + Number(i.amount), 0),
    };
  });
  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

  const inputClass = "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <div>
      <TopBar title="Invoices" subtitle="Track billing and payments" />
      <div className="px-4 lg:px-6 pb-8 space-y-6">
        {loading ? <ListSkeleton rows={5} /> : <>
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <p className="text-sm text-bb-dim">Total Invoiced</p>
            {totalsByCurrency.map(t => (
              <p key={t.currency} className="text-2xl font-display font-bold text-white">
                {formatAmount(t.all, t.currency)}
              </p>
            ))}
            {totalsByCurrency.length === 0 && <p className="text-2xl font-display font-bold text-white">$0.00</p>}
          </div>
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <p className="text-sm text-bb-dim">Paid</p>
            {totalsByCurrency.filter(t => t.paid > 0).map(t => (
              <p key={t.currency} className="text-2xl font-display font-bold text-green-400">
                {formatAmount(t.paid, t.currency)}
              </p>
            ))}
            {totalsByCurrency.every(t => t.paid === 0) && <p className="text-2xl font-display font-bold text-green-400">$0.00</p>}
          </div>
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <p className="text-sm text-bb-dim">Outstanding</p>
            {totalsByCurrency.filter(t => t.outstanding > 0).map(t => (
              <p key={t.currency} className="text-2xl font-display font-bold text-bb-orange">
                {formatAmount(t.outstanding, t.currency)}
              </p>
            ))}
            {totalsByCurrency.every(t => t.outstanding === 0) && <p className="text-2xl font-display font-bold text-bb-orange">$0.00</p>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client..."
              className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
          </div>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none px-4 py-2 pr-8 bg-bb-surface border border-bb-border rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-bb-dim pointer-events-none" />
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md shrink-0">
            <Plus size={16} /> New Invoice
          </button>
        </div>

        {/* Invoice list */}
        <div className="bg-bb-surface border border-bb-border rounded-lg overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 border-b border-bb-border text-xs text-bb-dim font-medium uppercase">
            <div className="col-span-3">Client</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-1">Region</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Due Date</div>
            <div className="col-span-1">Created</div>
            <div className="col-span-1"></div>
          </div>
          {filtered.map((inv) => (
            <div key={inv.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3 border-b border-bb-border last:border-b-0 hover:bg-bb-elevated items-center">
              <div className="sm:col-span-3">
                <span className="text-sm font-medium text-white">{inv.client.name}</span>
                {inv.notes && <p className="text-xs text-bb-dim line-clamp-1 mt-0.5">{inv.notes}</p>}
              </div>
              <div className="sm:col-span-2">
                <span className="text-sm font-mono text-white">
                  {inv.currency === "EUR" ? "\u20AC" : "$"}{Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="sm:col-span-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  (inv.region || "US") === "EU"
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-green-500/10 text-green-400"
                }`}>
                  {(inv.region || "US") === "EU" ? "EU" : "US"}
                </span>
              </div>
              <div className="sm:col-span-2">
                <select
                  value={inv.status}
                  onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                  className="text-xs px-2 py-1 bg-bb-black border border-bb-border rounded text-white"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="SENT">Sent</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <span className="text-sm text-bb-dim">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "\u2014"}</span>
              </div>
              <div className="sm:col-span-1">
                <span className="text-xs text-bb-dim">{new Date(inv.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button onClick={() => handleDelete(inv.id)} className="p-1 text-bb-dim hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-bb-dim">No invoices found</div>
          )}
        </div>
        </>}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Invoice">
        <form onSubmit={handleAdd} className="space-y-4">
          {/* Region / Template selector */}
          <div>
            <label className="block text-sm text-bb-muted mb-2">Invoice Template *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSelectedRegion("US"); setSelectedCountry("US"); }}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                  selectedRegion === "US"
                    ? "border-green-500 bg-green-500/10 text-green-400"
                    : "border-bb-border bg-bb-black text-bb-muted hover:border-green-500/30"
                }`}
              >
                <span className="block text-base">US Template</span>
                <span className="block text-[10px] text-bb-dim mt-0.5">USD &middot; US format</span>
              </button>
              <button
                type="button"
                onClick={() => { setSelectedRegion("EU"); setSelectedCountry("DE"); }}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                  selectedRegion === "EU"
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-bb-border bg-bb-black text-bb-muted hover:border-blue-500/30"
                }`}
              >
                <span className="block text-base">EU Template</span>
                <span className="block text-[10px] text-bb-dim mt-0.5">EUR &middot; EU format</span>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Country</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className={inputClass}
            >
              {selectedRegion === "US" ? (
                <>
                  <option value="US">{"\uD83C\uDDFA\uD83C\uDDF8"} United States</option>
                  <option value="CA">{"\uD83C\uDDE8\uD83C\uDDE6"} Canada</option>
                </>
              ) : (
                <>
                  <option value="DE">{"\uD83C\uDDE9\uD83C\uDDEA"} Germany</option>
                  <option value="AT">{"\uD83C\uDDE6\uD83C\uDDF9"} Austria</option>
                  <option value="NL">{"\uD83C\uDDF3\uD83C\uDDF1"} Netherlands</option>
                  <option value="BE">{"\uD83C\uDDE7\uD83C\uDDEA"} Belgium</option>
                  <option value="FR">{"\uD83C\uDDEB\uD83C\uDDF7"} France</option>
                  <option value="ES">{"\uD83C\uDDEA\uD83C\uDDF8"} Spain</option>
                  <option value="IT">{"\uD83C\uDDEE\uD83C\uDDF9"} Italy</option>
                  <option value="IE">{"\uD83C\uDDEE\uD83C\uDDEA"} Ireland</option>
                  <option value="PT">{"\uD83C\uDDF5\uD83C\uDDF9"} Portugal</option>
                  <option value="FI">{"\uD83C\uDDEB\uD83C\uDDEE"} Finland</option>
                  <option value="GR">{"\uD83C\uDDEC\uD83C\uDDF7"} Greece</option>
                  <option value="LU">{"\uD83C\uDDF1\uD83C\uDDFA"} Luxembourg</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm text-bb-muted mb-1">Client *</label>
            <select name="clientId" required className={inputClass}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-bb-muted mb-1">Amount * <span className="text-xs text-bb-dim">({selectedRegion === "EU" ? "EUR" : "USD"})</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim text-sm">
                  {selectedRegion === "EU" ? "\u20AC" : "$"}
                </span>
                <input name="amount" type="number" step="0.01" min="0" required className={`${inputClass} pl-7`} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-bb-muted mb-1">Status</label>
              <select name="status" className={inputClass}>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Due Date</label>
            <input name="dueDate" type="date" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Notes</label>
            <textarea name="notes" rows={2} className={inputClass} placeholder="Invoice details..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md">Create Invoice</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
