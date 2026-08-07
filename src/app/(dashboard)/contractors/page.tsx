"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  Receipt,
  Clock,
  Wallet,
  HardHat,
  Link2,
  Check,
  FileText,
  ExternalLink,
  Send,
  ShieldCheck,
  RefreshCw,
  Power,
  Trash2,
  Lock,
  ScanLine,
  AlertTriangle,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";

interface InvoiceNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

interface InvoiceAudit {
  id: string;
  event: string;
  actor: string;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  description: string | null;
  amount: string | null;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  fileUrl: string;
  filename: string;
  size: number | null;
  encrypted: boolean;
  scanStatus: "PENDING" | "MATCHED" | "AUTO_FILLED" | "MISMATCH" | "NO_DATA" | "SKIPPED" | "FAILED";
  scannedAmount: string | null;
  scannedCurrency: string | null;
  scannedInvoiceNumber: string | null;
  scanSummary: string | null;
  scannedAt: string | null;
  status: "PENDING" | "PAID" | "DISPUTED";
  submittedAt: string;
  submitIp: string | null;
  paidAt: string | null;
  paidBy: string | null;
  paymentRef: string | null;
  notes: InvoiceNote[];
  audits: InvoiceAudit[];
}

interface ContractorRow {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  uploadToken: string;
  createdAt: string;
  invoices: InvoiceRow[];
}

const STATUS_TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "PAID", label: "Paid" },
  { key: "DISPUTED", label: "Disputed" },
  { key: "ALL", label: "All" },
];

const statusVariant: Record<string, "green" | "yellow" | "red"> = {
  PENDING: "yellow",
  PAID: "green",
  DISPUTED: "red",
};

const AUDIT_LABELS: Record<string, string> = {
  uploaded: "Invoice uploaded",
  marked_paid: "Marked as paid",
  marked_unpaid: "Marked as unpaid",
  disputed: "Marked as disputed",
  note_added: "Note added",
  details_edited: "Details edited",
  scanned: "Document scanned",
  scan_failed: "Document scan failed",
  file_viewed: "File viewed",
};

const SCAN_LABELS: Record<InvoiceRow["scanStatus"], { label: string; tone: "green" | "yellow" | "red" | "gray" }> = {
  PENDING: { label: "Scanning…", tone: "gray" },
  MATCHED: { label: "Amount verified", tone: "green" },
  AUTO_FILLED: { label: "Amount read from document", tone: "green" },
  MISMATCH: { label: "Amount mismatch", tone: "red" },
  NO_DATA: { label: "No amount found in document", tone: "yellow" },
  SKIPPED: { label: "File type not scannable", tone: "gray" },
  FAILED: { label: "Scan failed", tone: "yellow" },
};

function money(amount: string | null, currency: string) {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return null;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ts(date: string) {
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ContractorsPage() {
  const [loading, setLoading] = useState(true);
  const [contractors, setContractors] = useState<ContractorRow[]>([]);
  const [statusTab, setStatusTab] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managing, setManaging] = useState<ContractorRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedToken, setCopiedToken] = useState("");
  const { toast } = useToast();

  // Add-contractor form
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Detail modal state
  const [noteDraft, setNoteDraft] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const fetchContractors = useCallback(async () => {
    try {
      const res = await fetch("/api/contractors");
      const data = await res.json();
      if (data.success) setContractors(data.data);
    } catch {
      // API unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

  // Deep links: /contractors?invoice=<id> or ?contractor=<id> open the matching
  // modal once data is in (used by ⌘K search and the Activity feed)
  const deepLinked = useRef(false);
  useEffect(() => {
    if (loading || deepLinked.current) return;
    deepLinked.current = true;
    const sp = new URLSearchParams(window.location.search);
    const invoiceId = sp.get("invoice");
    const contractorId = sp.get("contractor");
    if (invoiceId && contractors.some((c) => c.invoices.some((i) => i.id === invoiceId))) {
      setStatusTab("ALL");
      setSelectedId(invoiceId);
    } else if (contractorId) {
      const c = contractors.find((c) => c.id === contractorId);
      if (c) setManaging(c);
    }
  }, [loading, contractors]);

  const allInvoices = useMemo(
    () =>
      contractors.flatMap((c) =>
        c.invoices.map((inv) => ({ ...inv, contractorName: c.name, contractorCompany: c.company, contractorId: c.id }))
      ),
    [contractors]
  );

  const selected = useMemo(
    () => allInvoices.find((i) => i.id === selectedId) || null,
    [allInvoices, selectedId]
  );

  // Keep the payment-ref input in sync when opening an invoice
  useEffect(() => {
    setPaymentRef(selected?.paymentRef || "");
    setNoteDraft("");
    setShowAudit(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allInvoices
      .filter((inv) => {
        if (statusTab !== "ALL" && inv.status !== statusTab) return false;
        if (q) {
          const hay = `${inv.contractorName} ${inv.contractorCompany || ""} ${inv.invoiceNumber || ""} ${inv.filename}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [allInvoices, statusTab, search]);

  const summary = useMemo(() => {
    const pending = allInvoices.filter((i) => i.status === "PENDING");
    const now = new Date();
    const paidThisMonth = allInvoices.filter(
      (i) =>
        i.status === "PAID" &&
        i.paidAt &&
        new Date(i.paidAt).getMonth() === now.getMonth() &&
        new Date(i.paidAt).getFullYear() === now.getFullYear()
    );
    const sum = (list: typeof allInvoices) =>
      list.reduce((s, i) => s + (i.amount ? parseFloat(i.amount) || 0 : 0), 0);
    return {
      pendingCount: pending.length,
      pendingTotal: sum(pending),
      paidMonthTotal: sum(paidThisMonth),
      contractors: contractors.filter((c) => c.isActive).length,
    };
  }, [allInvoices, contractors]);

  function uploadLink(token: string) {
    return `${window.location.origin}/i/${token}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(uploadLink(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(""), 2000);
    } catch {
      toast("Couldn't copy — copy it manually", "error");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setShowAdd(false);
        setForm({ name: "", email: "", company: "", phone: "", notes: "" });
        toast("Contractor added — copy their upload link from the card", "success");
        fetchContractors();
      } else {
        toast(json?.error || "Failed to add contractor", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchInvoice(id: string, payload: Record<string, unknown>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast(okMessage, "success");
        await fetchContractors();
      } else {
        toast(json?.error || "Update failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function rescan() {
    if (!selected || busy) return;
    setBusy(true);
    toast("Scanning document…", "success");
    try {
      const res = await fetch(`/api/contractors/invoices/${selected.id}/scan`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        toast("Scan complete", "success");
        await fetchContractors();
      } else {
        toast(json?.error || "Scan failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!selected || !noteDraft.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/invoices/${selected.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteDraft }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNoteDraft("");
        await fetchContractors();
      } else {
        toast(json?.error || "Failed to add note", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchContractor(id: string, payload: Record<string, unknown>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast(okMessage, "success");
        setManaging(json.data);
        await fetchContractors();
      } else {
        toast(json?.error || "Update failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteContractor() {
    if (!managing || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/${managing.id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        toast("Contractor removed", "success");
        setManaging(null);
      } else {
        toast(json?.error || "Failed to remove contractor", "error");
      }
    } finally {
      setBusy(false);
      setConfirmDelete(false);
      fetchContractors();
    }
  }

  return (
    <div>
      <TopBar title="Contractors" subtitle="Contractor invoices — uploads, payment status, and audit trail" />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Pending Invoices", value: summary.pendingCount, icon: Clock },
            {
              label: "Pending Total",
              value: `$${summary.pendingTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              icon: Receipt,
            },
            {
              label: "Paid This Month",
              value: `$${summary.paidMonthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              icon: Wallet,
            },
            { label: "Active Contractors", value: summary.contractors, icon: HardHat },
          ].map((tile) => (
            <div key={tile.label} className="bg-bb-surface border border-bb-border rounded-lg p-4 flex items-center gap-3">
              <tile.icon size={18} className="text-bb-orange shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white truncate">{tile.value}</p>
                <p className="text-xs text-bb-dim truncate">{tile.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Contractor cards */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <HardHat size={15} className="text-bb-orange" />
              Contractors
            </h2>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors"
            >
              <Plus size={14} />
              Add Contractor
            </button>
          </div>
          {contractors.length === 0 && !loading ? (
            <p className="text-xs text-bb-dim py-2">
              Add a contractor to mint their private upload link — they use it to submit invoices, and everything lands here timestamped.
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {contractors.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 pl-3 pr-2 py-1.5 bg-bb-black border border-bb-border rounded-lg",
                    !c.isActive && "opacity-50"
                  )}
                >
                  <button
                    onClick={() => setManaging(c)}
                    className="text-sm text-white hover:text-bb-orange transition-colors"
                    title="Manage contractor"
                  >
                    {c.name}
                  </button>
                  {c.company && <span className="text-[10px] text-bb-dim hidden sm:inline">{c.company}</span>}
                  {!c.isActive && <Badge variant="gray">OFF</Badge>}
                  <span className="text-[10px] text-bb-dim">
                    {c.invoices.filter((i) => i.status === "PENDING").length} pending
                  </span>
                  <button
                    onClick={() => copyLink(c.uploadToken)}
                    className="p-1 rounded text-bb-dim hover:text-bb-orange transition-colors"
                    title="Copy upload link"
                  >
                    {copiedToken === c.uploadToken ? <Check size={13} className="text-green-400" /> : <Link2 size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status tabs + search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                  statusTab === tab.key ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contractors, invoice numbers, files..."
              className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
          </div>
        </div>

        {/* Invoice list */}
        <div className="space-y-2 pb-8">
          {loading ? (
            <div className="text-center py-12 text-bb-dim">Loading invoices…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-bb-dim flex flex-col items-center gap-2">
              <Receipt size={32} className="text-bb-dim/50" />
              <p>
                {allInvoices.length === 0
                  ? "No invoices yet. Share a contractor's upload link and their submissions land here."
                  : "Nothing matches these filters."}
              </p>
            </div>
          ) : (
            filtered.map((inv) => (
              <button
                key={inv.id}
                onClick={() => setSelectedId(inv.id)}
                className="w-full flex items-center gap-3 p-3 bg-bb-surface border border-bb-border hover:border-bb-orange/50 rounded-lg transition-colors text-left"
              >
                <FileText size={18} className="text-bb-orange shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    <span className="font-medium">{inv.contractorName}</span>
                    <span className="text-bb-muted">
                      {" "}
                      &middot; {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.filename}
                    </span>
                    {money(inv.amount, inv.currency) && (
                      <span className="text-white font-medium"> &middot; {money(inv.amount, inv.currency)}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-bb-dim flex items-center gap-1 flex-wrap">
                    <Clock size={10} />
                    Submitted {ts(inv.submittedAt)}
                    {inv.status === "PAID" && inv.paidAt && (
                      <span className="text-green-400/80">
                        &middot; Paid {ts(inv.paidAt)} {inv.paidBy ? `by ${inv.paidBy}` : ""}
                      </span>
                    )}
                    {inv.notes.length > 0 && <span>&middot; {inv.notes.length} note{inv.notes.length === 1 ? "" : "s"}</span>}
                  </p>
                </div>
                {inv.scanStatus === "MISMATCH" && (
                  <span className="flex items-center gap-1 text-[10px] text-red-400 shrink-0" title="Document amount differs from entered amount">
                    <AlertTriangle size={12} />
                    Mismatch
                  </span>
                )}
                <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Add contractor modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Contractor">
        <form onSubmit={handleAdd} className="space-y-3">
          {(
            [
              { key: "name", label: "Name *", placeholder: "Jane Doe" },
              { key: "company", label: "Company", placeholder: "Doe Design LLC" },
              { key: "email", label: "Email", placeholder: "jane@example.com" },
              { key: "phone", label: "Phone", placeholder: "+1 ..." },
            ] as const
          ).map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-bb-muted mb-1">{f.label}</label>
              <input
                type="text"
                value={form[f.key]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-bb-muted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="What they do for us, agreed rates..."
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.name.trim() || saving}
              className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add & Create Link"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage contractor modal */}
      <Modal
        open={!!managing}
        onClose={() => setManaging(null)}
        title={managing ? managing.name : "Contractor"}
      >
        {managing && (
          <div className="space-y-4">
            <div className="text-xs text-bb-dim space-y-0.5">
              {managing.company && <p>{managing.company}</p>}
              {managing.email && <p>{managing.email}</p>}
              {managing.phone && <p>{managing.phone}</p>}
              {managing.notes && <p className="text-bb-muted pt-1">{managing.notes}</p>}
              <p className="pt-1">Added {ts(managing.createdAt)}</p>
            </div>

            <div className="bg-bb-black border border-bb-border rounded-lg p-3 space-y-2">
              <p className="text-xs text-bb-muted flex items-center gap-1.5">
                <Send size={12} className="text-bb-orange" />
                Private upload link — send this to {managing.name.split(" ")[0]}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] text-white bg-bb-surface border border-bb-border rounded px-2 py-1.5 truncate">
                  {uploadLink(managing.uploadToken)}
                </code>
                <button
                  onClick={() => copyLink(managing.uploadToken)}
                  className="p-1.5 rounded text-bb-dim hover:text-bb-orange transition-colors shrink-0"
                  title="Copy link"
                >
                  {copiedToken === managing.uploadToken ? (
                    <Check size={14} className="text-green-400" />
                  ) : (
                    <Link2 size={14} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  patchContractor(
                    managing.id,
                    { isActive: !managing.isActive },
                    managing.isActive ? "Upload link deactivated" : "Upload link reactivated"
                  )
                }
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors disabled:opacity-50"
              >
                <Power size={12} />
                {managing.isActive ? "Deactivate link" : "Reactivate link"}
              </button>
              <button
                onClick={() =>
                  patchContractor(managing.id, { regenerateToken: true }, "New link minted — old link is dead")
                }
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} />
                Rotate link
              </button>
              {managing.invoices.length === 0 && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              )}
            </div>
            {managing.invoices.length > 0 && (
              <p className="text-[10px] text-bb-dim">
                {managing.invoices.length} invoice{managing.invoices.length === 1 ? "" : "s"} on record — contractors
                with invoices can be deactivated but not deleted (legal records).
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteContractor}
        title="Remove contractor?"
        message={`Remove ${managing?.name}? This only works while they have no invoices on record.`}
        confirmLabel="Remove"
        loading={busy}
      />

      {/* Invoice detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={
          selected
            ? `${selected.contractorName} — ${selected.invoiceNumber ? `#${selected.invoiceNumber}` : "Invoice"}`
            : "Invoice"
        }
        className="max-w-2xl"
      >
        {selected && (
          <div className="space-y-4">
            {/* Status + primary actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusVariant[selected.status]}>{selected.status}</Badge>
              {selected.status !== "PAID" ? (
                <button
                  onClick={() => patchInvoice(selected.id, { status: "PAID", paymentRef }, "Marked as paid")}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  <Check size={13} />
                  Mark as Paid
                </button>
              ) : (
                <button
                  onClick={() => patchInvoice(selected.id, { status: "PENDING" }, "Marked as unpaid")}
                  disabled={busy}
                  className="px-3 py-1.5 border border-bb-border text-bb-muted hover:text-white text-xs rounded-md transition-colors disabled:opacity-50"
                >
                  Undo — Mark Unpaid
                </button>
              )}
              {selected.status !== "DISPUTED" && selected.status !== "PAID" && (
                <button
                  onClick={() => patchInvoice(selected.id, { status: "DISPUTED" }, "Marked as disputed")}
                  disabled={busy}
                  className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs rounded-md transition-colors disabled:opacity-50"
                >
                  Dispute
                </button>
              )}
              <a
                href={`/api/contractors/invoices/${selected.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-bb-elevated hover:bg-bb-border text-white text-xs rounded-md transition-colors"
                title="Decrypted on the fly; every view is logged"
              >
                <ExternalLink size={13} />
                View File
              </a>
            </div>

            {/* Document scan result */}
            <div
              className={cn("flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs", {
                "bg-green-500/5 border-green-500/20": SCAN_LABELS[selected.scanStatus].tone === "green",
                "bg-red-500/5 border-red-500/20": SCAN_LABELS[selected.scanStatus].tone === "red",
                "bg-yellow-500/5 border-yellow-500/20": SCAN_LABELS[selected.scanStatus].tone === "yellow",
                "bg-bb-black border-bb-border": SCAN_LABELS[selected.scanStatus].tone === "gray",
              })}
            >
              <ScanLine
                size={14}
                className={cn("shrink-0 mt-0.5", {
                  "text-green-400": SCAN_LABELS[selected.scanStatus].tone === "green",
                  "text-red-400": SCAN_LABELS[selected.scanStatus].tone === "red",
                  "text-yellow-400": SCAN_LABELS[selected.scanStatus].tone === "yellow",
                  "text-bb-dim": SCAN_LABELS[selected.scanStatus].tone === "gray",
                })}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{SCAN_LABELS[selected.scanStatus].label}</p>
                {selected.scanStatus === "MISMATCH" && (
                  <p className="text-red-300 mt-0.5">
                    Document says {selected.scannedCurrency || selected.currency}{" "}
                    {selected.scannedAmount ? parseFloat(selected.scannedAmount).toFixed(2) : "?"} — entered as{" "}
                    {money(selected.amount, selected.currency) || "nothing"}.
                    {selected.scannedAmount && (
                      <button
                        onClick={() =>
                          patchInvoice(
                            selected.id,
                            {
                              amount: parseFloat(selected.scannedAmount!),
                              ...(selected.scannedCurrency && { currency: selected.scannedCurrency }),
                            },
                            "Amount set from document"
                          )
                        }
                        disabled={busy}
                        className="ml-2 underline hover:text-white disabled:opacity-50"
                      >
                        Use document amount
                      </button>
                    )}
                  </p>
                )}
                {selected.scanSummary && selected.scanStatus !== "MISMATCH" && (
                  <p className="text-bb-dim mt-0.5">{selected.scanSummary}</p>
                )}
                {selected.scannedAt && (
                  <p className="text-[10px] text-bb-dim mt-0.5">Scanned {ts(selected.scannedAt)}</p>
                )}
              </div>
              {selected.scanStatus !== "PENDING" && (
                <button
                  onClick={rescan}
                  disabled={busy}
                  className="flex items-center gap-1 text-[10px] text-bb-dim hover:text-white transition-colors shrink-0 disabled:opacity-50"
                  title="Re-run the document scan"
                >
                  <RefreshCw size={11} className={busy ? "animate-spin" : ""} />
                  Rescan
                </button>
              )}
            </div>

            {/* Facts grid — the legal record */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-bb-black border border-bb-border rounded-lg p-3">
              <div>
                <p className="text-bb-dim">Amount</p>
                <p className="text-white font-medium">{money(selected.amount, selected.currency) || "—"}</p>
              </div>
              <div>
                <p className="text-bb-dim">File</p>
                <p className="text-white truncate flex items-center gap-1">
                  {selected.encrypted && (
                    <Lock size={10} className="text-green-400 shrink-0" aria-label="Encrypted at rest" />
                  )}
                  {selected.filename}
                </p>
              </div>
              <div>
                <p className="text-bb-dim">Submitted</p>
                <p className="text-white">{ts(selected.submittedAt)}</p>
              </div>
              <div>
                <p className="text-bb-dim">Invoice date</p>
                <p className="text-white">
                  {selected.invoiceDate ? new Date(selected.invoiceDate).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-bb-dim">Paid</p>
                <p className="text-white">
                  {selected.paidAt ? `${ts(selected.paidAt)}${selected.paidBy ? ` by ${selected.paidBy}` : ""}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-bb-dim">Submitted from IP</p>
                <p className="text-white">{selected.submitIp || "—"}</p>
              </div>
            </div>

            {selected.description && (
              <p className="text-xs text-bb-muted bg-bb-black border border-bb-border rounded-lg p-3">
                {selected.description}
              </p>
            )}

            {/* Payment reference */}
            <div>
              <label className="block text-xs text-bb-muted mb-1">Payment reference (how it was paid)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Wise transfer #, Zelle, bank ref..."
                  className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                {paymentRef !== (selected.paymentRef || "") && (
                  <button
                    onClick={() => patchInvoice(selected.id, { paymentRef }, "Payment reference saved")}
                    disabled={busy}
                    className="px-3 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>

            {/* Notes thread */}
            <div>
              <p className="text-xs font-medium text-white mb-2">Notes</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selected.notes.length === 0 && (
                  <p className="text-xs text-bb-dim">No notes yet — everything you write here is timestamped.</p>
                )}
                {selected.notes.map((n) => (
                  <div key={n.id} className="bg-bb-black border border-bb-border rounded-lg p-2.5">
                    <p className="text-xs text-white whitespace-pre-wrap">{n.body}</p>
                    <p className="text-[10px] text-bb-dim mt-1">
                      {n.author} &middot; {ts(n.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNote()}
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                <button
                  onClick={addNote}
                  disabled={!noteDraft.trim() || busy}
                  className="px-3 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Audit trail */}
            <div>
              <button
                onClick={() => setShowAudit((s) => !s)}
                className="flex items-center gap-1.5 text-xs text-bb-dim hover:text-white transition-colors"
              >
                <ShieldCheck size={13} className="text-bb-orange" />
                Audit trail ({selected.audits.length} event{selected.audits.length === 1 ? "" : "s"})
              </button>
              {showAudit && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {selected.audits.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-[11px] bg-bb-black border border-bb-border rounded-lg px-2.5 py-1.5">
                      <span className="text-bb-dim shrink-0 w-36">{ts(a.createdAt)}</span>
                      <span className="text-white">
                        {AUDIT_LABELS[a.event] || a.event}
                        <span className="text-bb-dim"> — {a.actor}</span>
                        {a.ipAddress && <span className="text-bb-dim"> ({a.ipAddress})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
