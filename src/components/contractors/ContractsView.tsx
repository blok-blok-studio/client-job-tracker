"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  FileSignature,
  Loader2,
  Send,
  Link2,
  Check,
  Download,
  ShieldCheck,
  Trash2,
  Ban,
  Mail,
  Sparkles,
  ExternalLink,
  Clock,
} from "lucide-react";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import SignatureCanvas from "@/components/shared/SignatureCanvas";
import ContractorAvatar from "@/components/contractors/ContractorAvatar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";
import { readJson, friendlyError } from "@/lib/fetch-json";

export interface ContractorOption {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  country?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  accentColor?: string | null;
  isActive: boolean;
}

interface ContractRow {
  id: string;
  contractorId: string;
  token: string;
  kind: string;
  title: string;
  status: "DRAFT" | "PENDING" | "SIGNED" | "EXPIRED";
  country: string | null;
  providerSignedName: string | null;
  providerSignedAt: string | null;
  signedName: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  documentHash: string | null;
  signedDocumentHash: string | null;
  contractor: { id: string; name: string; company: string | null; avatarUrl: string | null };
}

interface ContractDetail extends ContractRow {
  contractBody: string;
  url: string;
  signatureData: string | null;
  providerSignatureData: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  providerIpAddress: string | null;
  auditLogs: {
    id: string;
    event: string;
    actor: string;
    ipAddress: string | null;
    metadata: string | null;
    createdAt: string;
  }[];
  contractor: ContractRow["contractor"] & { email?: string | null };
}

const KIND_OPTIONS = [
  {
    key: "IC_AGREEMENT",
    label: "Contractor Agreement",
    blurb: "Classification, IP assignment, confidentiality, payment terms. Signing this unlocks invoicing.",
  },
  { key: "NDA", label: "NDA", blurb: "Mutual confidentiality — good for talks before any work starts." },
  { key: "SOW", label: "Statement of Work", blurb: "Scope, fee, and dates for one engagement." },
] as const;

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Awaiting signature" },
  { key: "SIGNED", label: "Signed" },
  { key: "DRAFT", label: "Drafts" },
  { key: "EXPIRED", label: "Voided / expired" },
];

const statusVariant: Record<string, "green" | "yellow" | "gray" | "orange"> = {
  SIGNED: "green",
  PENDING: "yellow",
  DRAFT: "orange",
  EXPIRED: "gray",
};

const AUDIT_LABELS: Record<string, string> = {
  created: "Agreement created",
  provider_signed: "Counter-signed by Blok Blok",
  sent: "Released to contractor",
  emailed: "Link emailed",
  viewed: "Opened by contractor",
  contractor_signed: "Signed by contractor",
  voided: "Voided",
};

function ts(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ContractsView({
  contractors,
  search,
  onChanged,
  presetContractorId,
  compact = false,
}: {
  contractors: ContractorOption[];
  search: string;
  onChanged?: () => void;
  /** Pre-selects a contractor in the create form (used from a profile page) */
  presetContractorId?: string;
  /** Profile pages show a trimmed version: no status tabs, no summary tiles */
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [provider, setProvider] = useState({ legalName: "", address: "" });
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("ALL");
  const [copied, setCopied] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deepLinked = useRef(false);

  const [form, setForm] = useState({
    contractorId: presetContractorId || "",
    kind: "IC_AGREEMENT" as (typeof KIND_OPTIONS)[number]["key"],
    title: "",
    services: "",
    compensation: "",
    paymentDays: 15,
    extraTerms: "",
    customPrompt: "",
    contractorAddress: "",
    providerLegalName: "",
    providerAddress: "",
    providerSignedName: "",
    expiresInDays: 30,
    draft: true,
    emailIt: false,
  });
  const [signatureMode, setSignatureMode] = useState<"type" | "draw">("type");
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/contractors/contracts");
      const result = await readJson<{
        data: ContractRow[];
        provider?: { legalName: string; address: string };
      }>(res, "Couldn't load agreements.");
      if (result.ok) {
        setContracts(result.data!.data);
        if (result.data!.provider) setProvider(result.data!.provider);
      }
    } catch {
      // Background load. Leave the list as it is and stop the spinner.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deep link: /contractors?contract=<id> opens that agreement
  useEffect(() => {
    if (deepLinked.current || contracts.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("contract");
    if (!id) return;
    deepLinked.current = true;
    openDetail(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts]);

  const scoped = useMemo(
    () => (presetContractorId ? contracts.filter((c) => c.contractorId === presetContractorId) : contracts),
    [contracts, presetContractorId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped
      .filter((c) => statusTab === "ALL" || c.status === statusTab)
      .filter(
        (c) =>
          !q ||
          c.contractor.name.toLowerCase().includes(q) ||
          (c.contractor.company || "").toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.signedName || "").toLowerCase().includes(q)
      );
  }, [scoped, statusTab, search]);

  const summary = useMemo(() => {
    const signed = scoped.filter((c) => c.status === "SIGNED");
    const awaiting = scoped.filter((c) => c.status === "PENDING");
    const drafts = scoped.filter((c) => c.status === "DRAFT");
    const withSignedIc = new Set(
      scoped.filter((c) => c.status === "SIGNED" && c.kind === "IC_AGREEMENT").map((c) => c.contractorId)
    );
    const missing = contractors.filter((c) => c.isActive && !withSignedIc.has(c.id));
    return { signed: signed.length, awaiting: awaiting.length, drafts: drafts.length, missing };
  }, [scoped, contractors]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/contractors/contracts/${id}`);
      const result = await readJson<{ data: ContractDetail }>(res, "Couldn't open that agreement.");
      if (result.ok) setDetail(result.data!.data);
      else toast(result.error!, "error");
    } catch (err) {
      toast(friendlyError(err, "Couldn't open that agreement."), "error");
    } finally {
      setDetailLoading(false);
    }
  }

  function resetForm() {
    setForm((f) => ({
      ...f,
      contractorId: presetContractorId || "",
      title: "",
      services: "",
      compensation: "",
      extraTerms: "",
      customPrompt: "",
      contractorAddress: "",
      emailIt: false,
    }));
    setSignatureData(null);
  }

  function openCreate() {
    setForm((f) => ({
      ...f,
      providerLegalName: f.providerLegalName || provider.legalName,
      providerAddress: f.providerAddress || provider.address,
      contractorId: presetContractorId || f.contractorId,
    }));
    setShowCreate(true);
  }

  // Pre-fill the contractor's address from their profile when one is picked
  useEffect(() => {
    const c = contractors.find((x) => x.id === form.contractorId);
    if (c && !form.contractorAddress && c.location) {
      setForm((f) => ({ ...f, contractorAddress: c.location || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contractorId]);

  async function handleCreate() {
    if (!form.contractorId || !form.providerSignedName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/contractors/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractorId: form.contractorId,
          kind: form.kind,
          title: form.title.trim() || undefined,
          services: form.services.trim() || undefined,
          compensation: form.compensation.trim() || undefined,
          paymentDays: form.paymentDays,
          extraTerms: form.extraTerms.trim() || undefined,
          customPrompt: form.customPrompt.trim() || undefined,
          contractorAddress: form.contractorAddress.trim() || undefined,
          providerLegalName: form.providerLegalName.trim() || undefined,
          providerAddress: form.providerAddress.trim() || undefined,
          providerSignedName: form.providerSignedName.trim(),
          providerSignatureData: signatureMode === "draw" ? signatureData || undefined : undefined,
          expiresInDays: form.expiresInDays,
          draft: form.draft,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to create the agreement");

      if (json.data.aiError) toast(`Drafted from the baseline — ${json.data.aiError}`, "info");
      else toast(form.draft ? "Draft ready to review" : "Agreement sent", "success");

      // Sending straight away can also email the link
      if (!form.draft && form.emailIt) {
        const r = await fetch(`/api/contractors/contracts/${json.data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "email" }),
        });
        const j = await r.json();
        if (j.emailError) toast(j.emailError, "error");
        else toast("Link emailed to the contractor", "success");
      }

      setShowCreate(false);
      resetForm();
      await load();
      onChanged?.();
      openDetail(json.data.id);
    } catch (err) {
      toast(friendlyError(err, "Couldn't create the agreement. Please try again."), "error");
    } finally {
      setCreating(false);
    }
  }

  async function patchContract(id: string, payload: Record<string, unknown>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Something went wrong");
      if (json.emailError) toast(json.emailError, "error");
      else toast(okMessage, "success");
      await load();
      if (detail?.id === id) await openDetail(id);
      onChanged?.();
    } catch (err) {
      toast(friendlyError(err, "Something went wrong. Please try again."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/contractors/contracts/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to delete");
      toast("Draft deleted", "success");
      setDetail(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast(friendlyError(err, "Couldn't delete that. Please try again."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/a/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(""), 1500);
      toast("Signing link copied", "success");
    } catch {
      toast("Couldn't copy — the link is in the agreement view", "error");
    }
  }

  const selectedContractor = contractors.find((c) => c.id === form.contractorId);
  const inputClass =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <div className="space-y-4">
      {!compact && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Signed Agreements", value: summary.signed, icon: ShieldCheck },
              { label: "Awaiting Signature", value: summary.awaiting, icon: Clock },
              { label: "Drafts", value: summary.drafts, icon: FileSignature },
              { label: "No Signed IC Agreement", value: summary.missing.length, icon: Ban },
            ].map((tile) => (
              <div
                key={tile.label}
                className="bg-bb-surface border border-bb-border rounded-lg p-4 flex items-center gap-3"
              >
                <tile.icon size={18} className="text-bb-orange shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-white truncate">{tile.value}</p>
                  <p className="text-xs text-bb-dim truncate">{tile.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Who still needs an agreement */}
          {summary.missing.length > 0 && (
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <p className="text-xs text-bb-dim mb-2">
                Active contractors without a signed agreement — they can log hours, but invoices stay blocked:
              </p>
              <div className="flex gap-2 flex-wrap">
                {summary.missing.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setForm((f) => ({ ...f, contractorId: c.id, kind: "IC_AGREEMENT" }));
                      openCreate();
                    }}
                    className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 bg-bb-black border border-bb-border hover:border-bb-orange/50 rounded-lg text-sm text-white transition-colors"
                  >
                    <ContractorAvatar contractor={c} size={22} />
                    {c.name}
                    <Plus size={13} className="text-bb-orange" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {!compact && (
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
        )}
        <div className="flex-1" />
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors w-fit"
        >
          <Plus size={14} />
          New Agreement
        </button>
      </div>

      {/* List */}
      <div className="space-y-2 pb-8">
        {loading ? (
          <div className="text-center py-12 text-bb-dim">Loading agreements…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-bb-dim flex flex-col items-center gap-2">
            <FileSignature size={32} className="text-bb-dim/50" />
            <p className="max-w-md text-sm">
              {scoped.length === 0
                ? "No contractor agreements yet. Draft one — it's counter-signed the moment you create it, and signing unlocks their invoicing."
                : "Nothing matches these filters."}
            </p>
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="w-full flex items-center gap-3 p-3 bg-bb-surface border border-bb-border hover:border-bb-orange/50 rounded-lg transition-colors"
            >
              <button onClick={() => openDetail(c.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <ContractorAvatar contractor={c.contractor} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    <span className="font-medium">{c.contractor.name}</span>
                    <span className="text-bb-muted"> &middot; {c.title}</span>
                  </p>
                  <p className="text-[11px] text-bb-dim flex items-center gap-1 flex-wrap">
                    <Clock size={10} />
                    Created {ts(c.createdAt)}
                    {c.status === "SIGNED" && c.signedAt && (
                      <span className="text-green-400/80">
                        &middot; Signed {ts(c.signedAt)} by {c.signedName}
                      </span>
                    )}
                    {c.status === "PENDING" && c.expiresAt && (
                      <span>&middot; Link open until {ts(c.expiresAt)}</span>
                    )}
                  </p>
                </div>
              </button>
              {c.status !== "DRAFT" && (
                <button
                  onClick={() => copyLink(c.token)}
                  className="p-1.5 rounded text-bb-dim hover:text-bb-orange transition-colors"
                  title="Copy signing link"
                >
                  {copied === c.token ? <Check size={14} className="text-green-400" /> : <Link2 size={14} />}
                </button>
              )}
              <Badge variant={statusVariant[c.status]}>
                {c.status === "PENDING" ? "AWAITING" : c.status}
              </Badge>
            </div>
          ))
        )}
      </div>

      {/* ── Create modal ─────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Contractor Agreement">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-bb-muted mb-1">Contractor *</label>
            <select
              value={form.contractorId}
              onChange={(e) => setForm({ ...form, contractorId: e.target.value })}
              disabled={!!presetContractorId}
              className={cn(inputClass, "[color-scheme:dark] disabled:opacity-60")}
            >
              <option value="">Choose a contractor…</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` · ${c.company}` : ""}
                  {c.country ? ` (${c.country})` : ""}
                </option>
              ))}
            </select>
            {selectedContractor && !selectedContractor.country && (
              <p className="text-[11px] text-yellow-400/80 mt-1">
                No country on file — the agreement will use the international variant. Set their country
                first for US or German clauses.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Document</label>
            <div className="grid gap-2">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setForm({ ...form, kind: k.key })}
                  className={cn(
                    "text-left p-3 rounded-lg border transition-colors",
                    form.kind === k.key
                      ? "border-bb-orange bg-bb-orange/10"
                      : "border-bb-border bg-bb-black hover:border-bb-border/80"
                  )}
                >
                  <p className="text-sm text-white font-medium">{k.label}</p>
                  <p className="text-[11px] text-bb-dim mt-0.5">{k.blurb}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-bb-muted mb-1">Title (optional)</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={KIND_OPTIONS.find((k) => k.key === form.kind)?.label}
              className={inputClass}
            />
          </div>

          {form.kind !== "NDA" && (
            <>
              <div>
                <label className="block text-xs text-bb-muted mb-1">What they&apos;re doing</label>
                <textarea
                  value={form.services}
                  onChange={(e) => setForm({ ...form, services: e.target.value })}
                  rows={3}
                  placeholder="Video editing for client social content — 4 reels per month, delivered in 9:16 and 1:1 with project files."
                  className={cn(inputClass, "resize-y")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bb-muted mb-1">Rate / fee</label>
                  <input
                    type="text"
                    value={form.compensation}
                    onChange={(e) => setForm({ ...form, compensation: e.target.value })}
                    placeholder="$65 per hour, invoiced monthly"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-bb-muted mb-1">Pay within (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.paymentDays}
                    onChange={(e) =>
                      setForm({ ...form, paymentDays: Math.min(30, Math.max(1, Number(e.target.value) || 15)) })
                    }
                    className={inputClass}
                  />
                  <p className="text-[10px] text-bb-dim mt-1">Capped at 30 — state freelance acts.</p>
                </div>
              </div>
            </>
          )}

          <details className="rounded-lg border border-bb-border bg-bb-black">
            <summary className="px-3 py-2 text-xs text-bb-muted cursor-pointer select-none">
              Addresses &amp; extra terms
            </summary>
            <div className="p-3 pt-0 space-y-3">
              <div>
                <label className="block text-xs text-bb-muted mb-1">Contractor address</label>
                <input
                  type="text"
                  value={form.contractorAddress}
                  onChange={(e) => setForm({ ...form, contractorAddress: e.target.value })}
                  placeholder="Street, city, country"
                  className={inputClass}
                />
                <p className="text-[10px] text-bb-dim mt-1">
                  NY, IL, and CA freelance acts want both parties&apos; addresses in the contract.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bb-muted mb-1">Our legal name</label>
                  <input
                    type="text"
                    value={form.providerLegalName}
                    onChange={(e) => setForm({ ...form, providerLegalName: e.target.value })}
                    placeholder="Blok Blok Studio LLC"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-bb-muted mb-1">Our address</label>
                  <input
                    type="text"
                    value={form.providerAddress}
                    onChange={(e) => setForm({ ...form, providerAddress: e.target.value })}
                    placeholder="Street, city, TX, USA"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-bb-muted mb-1">Additional terms</label>
                <textarea
                  value={form.extraTerms}
                  onChange={(e) => setForm({ ...form, extraTerms: e.target.value })}
                  rows={3}
                  placeholder="Anything specific to this contractor — equipment, credit, kill fee…"
                  className={cn(inputClass, "resize-y")}
                />
              </div>
            </div>
          </details>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-bb-muted mb-1">
              <Sparkles size={12} className="text-bb-orange" />
              Reshape with AI (optional)
            </label>
            <textarea
              value={form.customPrompt}
              onChange={(e) => setForm({ ...form, customPrompt: e.target.value })}
              rows={4}
              placeholder="Make it warmer and shorter. Add a clause about returning equipment. Or paste a whole template to use as the basis…"
              className={cn(inputClass, "resize-y")}
            />
            <p className="text-[10px] text-bb-dim mt-1">
              The baseline&apos;s IP, classification, and liability language is protected — AI can reword
              around it, not weaken it. Any failure falls back to the baseline.
            </p>
          </div>

          {/* Counter-signature */}
          <div className="space-y-2">
            <label className="block text-xs text-bb-muted">Your signature (counter-signature) *</label>
            <input
              type="text"
              value={form.providerSignedName}
              onChange={(e) => setForm({ ...form, providerSignedName: e.target.value })}
              placeholder="Your full legal name"
              className={inputClass}
            />
            <div className="flex gap-1 bg-bb-black rounded-lg p-1 border border-bb-border">
              {(["type", "draw"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSignatureMode(m)}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors capitalize",
                    signatureMode === m ? "bg-bb-surface text-white" : "text-bb-dim hover:text-bb-muted"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            {signatureMode === "type"
              ? form.providerSignedName && (
                  <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
                    <p className="text-2xl font-serif italic text-white">{form.providerSignedName}</p>
                  </div>
                )
              : <SignatureCanvas onSignatureChange={setSignatureData} />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-bb-muted mb-1">Link open for (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.expiresInDays}
                onChange={(e) =>
                  setForm({ ...form, expiresInDays: Math.min(365, Math.max(1, Number(e.target.value) || 30)) })
                }
                className={inputClass}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-bb-border bg-bb-black cursor-pointer">
            <input
              type="checkbox"
              checked={form.draft}
              onChange={(e) => setForm({ ...form, draft: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange"
            />
            <div>
              <span className="text-sm font-medium text-white">Review before sending</span>
              <p className="text-[10px] text-bb-dim mt-0.5">
                Creates it as a draft. The link doesn&apos;t work until you release it.
              </p>
            </div>
          </label>

          {!form.draft && (
            <label className="flex items-start gap-3 p-3 rounded-lg border border-bb-border bg-bb-black cursor-pointer">
              <input
                type="checkbox"
                checked={form.emailIt}
                onChange={(e) => setForm({ ...form, emailIt: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange"
              />
              <div>
                <span className="text-sm font-medium text-white">Email them the link too</span>
                <p className="text-[10px] text-bb-dim mt-0.5">
                  {selectedContractor?.email || "No email on file — add one first"}
                </p>
              </div>
            </label>
          )}

          <p className="text-[10px] text-bb-dim leading-relaxed">
            The baseline follows the IP, classification, and payment-term research in Compliance
            (present-tense assignment for US, Nutzungsrechte for DE, conspicuous Texas liability cap).
            It is a strong starting point, not legal advice — worth one lawyer pass before it becomes
            your standard.
          </p>

          <div className="flex gap-3 justify-end pt-1">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.contractorId || !form.providerSignedName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {form.customPrompt.trim() ? "Drafting with AI…" : "Generating…"}
                </>
              ) : (
                <>
                  <FileSignature size={14} />
                  {form.draft ? "Create draft" : "Create & send"}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Detail modal ─────────────────────────────────────────── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || "Agreement"}>
        {detailLoading || !detail ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="animate-spin text-bb-orange" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ContractorAvatar contractor={detail.contractor} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{detail.contractor.name}</p>
                <p className="text-[11px] text-bb-dim truncate">
                  {detail.contractor.company || detail.contractor.email || "—"}
                </p>
              </div>
              <Badge variant={statusVariant[detail.status]}>
                {detail.status === "PENDING" ? "AWAITING SIGNATURE" : detail.status}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {detail.status === "DRAFT" && (
                <button
                  onClick={() => patchContract(detail.id, { action: "send" }, "Released — the link works now")}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  <Send size={13} /> Release for signing
                </button>
              )}
              {detail.status !== "DRAFT" && (
                <>
                  <button
                    onClick={() => copyLink(detail.token)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors"
                  >
                    {copied === detail.token ? <Check size={13} className="text-green-400" /> : <Link2 size={13} />}
                    Copy link
                  </button>
                  <a
                    href={`/a/${detail.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors"
                  >
                    <ExternalLink size={13} /> Open
                  </a>
                  <a
                    href={`/api/agreement/${detail.token}/pdf`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors"
                  >
                    <Download size={13} /> PDF
                  </a>
                  <a
                    href={`/api/agreement/${detail.token}/certificate`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors"
                  >
                    <ShieldCheck size={13} /> Certificate
                  </a>
                </>
              )}
              {detail.status !== "SIGNED" && detail.contractor.email && (
                <button
                  onClick={() => patchContract(detail.id, { action: "email" }, "Link emailed")}
                  disabled={busy || detail.status === "DRAFT"}
                  title={detail.status === "DRAFT" ? "Release it first" : "Email the signing link"}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors disabled:opacity-40"
                >
                  <Mail size={13} /> Email link
                </button>
              )}
              {detail.status === "PENDING" && (
                <button
                  onClick={() => setConfirmVoid(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-dim hover:text-red-400 text-xs font-medium rounded-md transition-colors"
                >
                  <Ban size={13} /> Void
                </button>
              )}
              {detail.status === "DRAFT" && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-dim hover:text-red-400 text-xs font-medium rounded-md transition-colors"
                >
                  <Trash2 size={13} /> Delete draft
                </button>
              )}
            </div>

            {/* Facts */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                ["Counter-signed", detail.providerSignedName ? `${detail.providerSignedName} · ${ts(detail.providerSignedAt)}` : "—"],
                ["Signed by contractor", detail.signedName ? `${detail.signedName} · ${ts(detail.signedAt)}` : "Not yet"],
                ["Signing IP", detail.ipAddress || "—"],
                ["Link expires", detail.expiresAt ? ts(detail.expiresAt) : "—"],
                ["Document hash", detail.documentHash ? `${detail.documentHash.slice(0, 24)}…` : "—"],
                ["Signed hash", detail.signedDocumentHash ? `${detail.signedDocumentHash.slice(0, 24)}…` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="bg-bb-black border border-bb-border rounded-lg p-2.5 min-w-0">
                  <p className="text-[10px] text-bb-dim uppercase tracking-wide">{label}</p>
                  <p className="text-white break-words">{value}</p>
                </div>
              ))}
            </div>

            {/* Body */}
            <details className="rounded-lg border border-bb-border bg-bb-black" open>
              <summary className="px-3 py-2 text-xs text-bb-muted cursor-pointer select-none">
                Agreement text
              </summary>
              <pre className="px-4 pb-4 text-[11px] leading-relaxed text-bb-muted whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
                {detail.contractBody}
              </pre>
            </details>

            {/* Audit trail */}
            <div>
              <p className="text-xs text-bb-dim mb-2">Audit trail</p>
              <div className="space-y-1.5">
                {detail.auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-bb-orange mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-bb-muted">
                        {AUDIT_LABELS[log.event] || log.event}
                        <span className="text-bb-dim"> · {ts(log.createdAt)}</span>
                      </p>
                      {log.ipAddress && <p className="text-bb-dim">IP {log.ipAddress}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        onConfirm={() => {
          if (detail) patchContract(detail.id, { action: "void" }, "Agreement voided");
          setConfirmVoid(false);
        }}
        title="Void this agreement?"
        message="The signing link stops working immediately. The record and its audit trail are kept."
        confirmLabel="Void"
        confirmVariant="danger"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (detail) deleteDraft(detail.id);
          setConfirmDelete(false);
        }}
        title="Delete this draft?"
        message="It was never sent, so nothing is lost. Sent and signed agreements can't be deleted."
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
