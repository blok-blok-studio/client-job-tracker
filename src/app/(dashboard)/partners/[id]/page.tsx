"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import SignatureCanvas from "@/components/shared/SignatureCanvas";
import { useToast } from "@/components/shared/Toast";
import { readJson, friendlyError } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";

interface Rep {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  canClose: boolean;
  isActive: boolean;
  portalUrl: string;
  createdAt: string;
}

interface Deal {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  stage: string;
  stageLabel: string;
  closedBy: "OWNER" | "PARTNER_REP" | null;
  registeredAt: string;
  rep: { id: string; name: string } | null;
  packages: string[];
  contractUrl: string | null;
  contractStatus: string | null;
  depositPaid: boolean;
  planDescription: string | null;
  planStatus: string | null;
}

interface Rates {
  rateProjectHandoff: number;
  rateProjectClose: number;
  rateBrandGuideHandoff: number;
  rateBrandGuideClose: number;
  ratePlan: number;
  planMonths: number;
  payoutDays: number;
}

interface Partner {
  id: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  isActive: boolean;
  notes: string | null;
  qualificationCriteria: string | null;
  bookingLink: string | null;
  rates: Rates;
  w9ReceivedAt: string | null;
  w9DocStatus: string | null;
  stripeConnectAccountId: string | null;
  connectOnboarded: boolean;
  contractorId: string | null;
  agreements: Array<{ id: string; status: string; title: string; signedAt: string | null; createdAt: string; token: string }>;
  reps: Rep[];
  deals: Deal[];
  totals: { payable: number; paid: number; lifetime: number };
  payouts: Array<{ id: string; amount: number; stripeTransferId: string | null; note: string | null; createdAt: string; createdBy: string | null; items: number }>;
  signer: { name: string; hasSignature: boolean };
}

interface LedgerRow {
  id: string;
  kind: string;
  description: string;
  basisAmount: number;
  rate: number;
  amount: number;
  status: "PAYABLE" | "PAID" | "VOID";
  closedBy: string | null;
  eventAt: string;
  payableBy: string | null;
  paidAt: string | null;
  client: { id: string; name: string; company: string | null };
  rep: string | null;
  payout: { id: string; stripeTransferId: string | null; createdAt: string } | null;
  createdBy: string | null;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const inputClass =
  "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

const STAGE_VARIANT: Record<string, "gray" | "yellow" | "blue" | "green" | "orange" | "red"> = {
  registered: "gray",
  contract_sent: "yellow",
  signed: "blue",
  deposit_paid: "green",
  balance_paid: "green",
  live: "green",
  lost: "red",
};

type Tab = "deals" | "reps" | "commissions" | "settings";

export default function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [tab, setTab] = useState<Tab>("deals");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([
      fetch(`/api/partners/${id}`).then((r) => readJson<{ data: Partner }>(r)),
      fetch(`/api/partners/${id}/commissions`).then((r) => readJson<{ data: { rows: LedgerRow[] } }>(r)),
    ]);
    if (p.ok && p.data) setPartner(p.data.data);
    else toast(p.error || "Could not load the partner", "error");
    if (l.ok && l.data) setLedger(l.data.data.rows);
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast("Copy failed", "error");
    }
  }

  async function patchPartner(body: Record<string, unknown>, okMessage?: string) {
    const res = await fetch(`/api/partners/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await readJson(res);
    if (!r.ok) {
      toast(r.error || "Save failed", "error");
      return false;
    }
    if (okMessage) toast(okMessage, "success");
    await load();
    return true;
  }

  async function patchRep(repId: string, body: Record<string, unknown>) {
    setBusy(`rep:${repId}`);
    try {
      const res = await fetch(`/api/partners/${id}/reps/${repId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const r = await readJson<{ data?: { emailed?: boolean } }>(res);
      if (!r.ok) toast(r.error || "Update failed", "error");
      else if (body.emailLink) toast(r.data?.data?.emailed ? "Portal link emailed" : "Saved, but email is not configured", r.data?.data?.emailed ? "success" : "info");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function draftAgreement() {
    if (!partner?.contractorId) return toast("This partner has no contractor record", "error");
    setBusy("agreement");
    try {
      const res = await fetch("/api/contractors/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId: partner.contractorId, kind: "REFERRAL_PARTNER", providerSignedName: partner.signer.name, draft: true }),
      });
      const r = await readJson<{ data: { id: string } }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Could not draft the agreement");
      toast("Draft created. Review, sign and send it from Contractors.", "success");
      router.push(`/contractors?contract=${r.data.data.id}`);
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function connectStripe() {
    setBusy("connect");
    try {
      const res = await fetch(`/api/partners/${id}/connect`, { method: "POST" });
      const r = await readJson<{ data: { url: string } }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Could not start Stripe onboarding");
      await copy(r.data.data.url, "connect");
      toast("Onboarding link copied. Send it to the partner; it expires in a few minutes, so make a new one if needed.", "success");
      await load();
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function refreshStripe() {
    setBusy("refresh");
    try {
      const res = await fetch(`/api/partners/${id}/connect`);
      const r = await readJson<{ data: { onboarded: boolean; detailsSubmitted: boolean; payoutsEnabled: boolean; requirementsDue: string[] } }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Could not read Stripe status");
      const s = r.data.data;
      toast(
        s.onboarded
          ? "Stripe: connected and payouts enabled"
          : s.detailsSubmitted
          ? `Stripe: details submitted, verification pending${s.requirementsDue.length ? ` (${s.requirementsDue.join(", ")})` : ""}`
          : "Stripe: onboarding not completed yet",
        s.onboarded ? "success" : "info"
      );
      await load();
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!partner) {
    return (
      <>
        <TopBar title="Partner" />
        <div className="p-8 text-bb-muted text-sm flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading
        </div>
      </>
    );
  }

  const signedAgreement = partner.agreements.find((a) => a.status === "SIGNED");
  const pendingAgreement = partner.agreements.find((a) => a.status === "PENDING" || a.status === "DRAFT");

  return (
    <>
      <TopBar title={partner.name} subtitle={`${partner.contactName || ""}${partner.email ? ` · ${partner.email}` : ""}`} />
      <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
        <Link href="/partners" className="inline-flex items-center gap-1 text-sm text-bb-muted hover:text-white">
          <ArrowLeft size={14} /> All partners
        </Link>

        {/* Readiness + actions */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Agreement">
            {signedAgreement ? (
              <p className="text-sm text-green-400">Signed {fmtDate(signedAgreement.signedAt)}</p>
            ) : pendingAgreement ? (
              <p className="text-sm text-yellow-400">{pendingAgreement.status === "DRAFT" ? "Draft, not sent" : "Sent, awaiting signature"}</p>
            ) : (
              <p className="text-sm text-bb-muted">Not drafted yet</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {pendingAgreement ? (
                <ActionButton onClick={() => router.push(`/contractors?contract=${pendingAgreement.id}`)} icon={FileSignature}>
                  Open draft
                </ActionButton>
              ) : (
                <ActionButton onClick={draftAgreement} loading={busy === "agreement"} icon={FileSignature}>
                  {signedAgreement ? "Draft a new version" : "Draft agreement"}
                </ActionButton>
              )}
            </div>
            <p className="text-xs text-bb-dim mt-2">Uses the Sales Partnership template with this partner&apos;s rates. You review, sign and send it from Contractors.</p>
          </Card>

          <Card title="Stripe Connect">
            <p className={cn("text-sm", partner.connectOnboarded ? "text-green-400" : "text-yellow-400")}>
              {partner.connectOnboarded ? "Connected, payouts enabled" : partner.stripeConnectAccountId ? "Account created, onboarding incomplete" : "Not connected"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <ActionButton onClick={connectStripe} loading={busy === "connect"} icon={copied === "connect" ? Check : Send}>
                {partner.stripeConnectAccountId ? "New onboarding link" : "Connect partner"}
              </ActionButton>
              {partner.stripeConnectAccountId && (
                <ActionButton onClick={refreshStripe} loading={busy === "refresh"} icon={RefreshCw} subtle>
                  Refresh status
                </ActionButton>
              )}
            </div>
            <p className="text-xs text-bb-dim mt-2">The partner completes Stripe&apos;s hosted onboarding (bank details, ID). Commissions transfer to that account.</p>
          </Card>

          <Card title="Paperwork + kit">
            <div className="flex items-center gap-2">
              <Badge variant={partner.w9ReceivedAt ? "green" : "yellow"}>{partner.w9ReceivedAt ? `W-9 received ${fmtDate(partner.w9ReceivedAt)}` : "W-9 missing"}</Badge>
              <button onClick={() => patchPartner({ w9Received: !partner.w9ReceivedAt }, "Saved")} className="text-xs text-bb-muted hover:text-white underline">
                {partner.w9ReceivedAt ? "clear" : "mark received"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <a href={`/api/partners/${id}/kit`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bb-elevated hover:bg-bb-border text-sm text-white">
                <Download size={14} /> Download kit PDF
              </a>
              {partner.contractorId && (
                <Link href={`/contractors/${partner.contractorId}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bb-elevated hover:bg-bb-border text-sm text-white">
                  <ExternalLink size={14} /> Contractor record
                </Link>
              )}
            </div>
            <p className="text-xs text-bb-dim mt-2">The kit is generated from the live price list every time. Send the partner a fresh copy after any price change.</p>
          </Card>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Payable now" value={usd(partner.totals.payable)} accent={partner.totals.payable > 0} />
          <Tile label="Paid to date" value={usd(partner.totals.paid)} />
          <Tile label="Registered practices" value={String(partner.deals.length)} />
          <Tile label="Won" value={String(partner.deals.filter((d) => ["deposit_paid", "balance_paid", "live"].includes(d.stage)).length)} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-bb-border">
          {(
            [
              ["deals", "Deals"],
              ["reps", "Reps"],
              ["commissions", "Commissions"],
              ["settings", "Settings"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn("px-4 py-2 text-sm border-b-2 -mb-px transition-colors", tab === key ? "border-bb-orange text-white" : "border-transparent text-bb-muted hover:text-white")}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "deals" && <DealsTab deals={partner.deals} />}
        {tab === "reps" && <RepsTab partnerId={id} reps={partner.reps} busy={busy} copied={copied} onCopy={copy} onPatch={patchRep} onChanged={load} />}
        {tab === "commissions" && (
          <CommissionsTab partnerId={id} partner={partner} ledger={ledger} onChanged={load} />
        )}
        {tab === "settings" && <SettingsTab partner={partner} onSave={patchPartner} />}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-5">
      <p className="text-[11px] uppercase tracking-wide text-bb-dim mb-2">{title}</p>
      {children}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-bb-dim">{label}</p>
      <p className={cn("text-xl font-display font-bold mt-1", accent ? "text-bb-orange" : "text-white")}>{value}</p>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  icon: Icon,
  children,
  subtle,
}: {
  onClick: () => void;
  loading?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-60",
        subtle ? "bg-bb-elevated hover:bg-bb-border text-white" : "bg-bb-orange hover:bg-bb-orange-light text-white"
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {children}
    </button>
  );
}

function DealsTab({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) {
    return <p className="text-sm text-bb-muted py-6">No practices registered yet. They appear here the moment a rep registers one in the portal.</p>;
  }
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-bb-dim">
          <tr className="border-b border-bb-border">
            <th className="text-left px-4 py-3">Practice</th>
            <th className="text-left px-4 py-3">Rep</th>
            <th className="text-left px-4 py-3">Stage</th>
            <th className="text-left px-4 py-3">Close</th>
            <th className="text-left px-4 py-3">Registered</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b border-bb-border/60 hover:bg-bb-elevated/40">
              <td className="px-4 py-3">
                <Link href={`/clients/${d.id}`} className="text-white hover:text-bb-orange">
                  {d.name}
                </Link>
                {d.company && <p className="text-xs text-bb-dim">{d.company}</p>}
              </td>
              <td className="px-4 py-3 text-bb-muted">{d.rep?.name || "—"}</td>
              <td className="px-4 py-3">
                <Badge variant={STAGE_VARIANT[d.stage] || "gray"}>{d.stageLabel}</Badge>
                {d.planDescription && <p className="text-xs text-bb-dim mt-1">{d.planDescription}</p>}
              </td>
              <td className="px-4 py-3 text-bb-muted">{d.closedBy === "PARTNER_REP" ? "Team close" : d.closedBy === "OWNER" ? "Chase" : "—"}</td>
              <td className="px-4 py-3 text-bb-muted">{fmtDate(d.registeredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepsTab({
  partnerId,
  reps,
  busy,
  copied,
  onCopy,
  onPatch,
  onChanged,
}: {
  partnerId: string;
  reps: Rep[];
  busy: string | null;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onPatch: (repId: string, body: Record<string, unknown>) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/reps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
      const r = await readJson(res);
      if (!r.ok) throw new Error(r.error || "Could not add the rep");
      setName("");
      setEmail("");
      toast("Rep added", "success");
      await onChanged();
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-bb-muted">
        Each rep works from their own link. <span className="text-white">Closer</span> lets a rep generate our contract and payment links on a call; keep it off until
        you have heard them sell. The partner admin adds reps too, but only you can approve closers.
      </p>
      <div className="bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-bb-dim">
            <tr className="border-b border-bb-border">
              <th className="text-left px-4 py-3">Rep</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Closer</th>
              <th className="text-left px-4 py-3">Active</th>
              <th className="text-left px-4 py-3">Portal link</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id} className="border-b border-bb-border/60">
                <td className="px-4 py-3">
                  <p className="text-white">{r.name}</p>
                  {r.email && <p className="text-xs text-bb-dim">{r.email}</p>}
                </td>
                <td className="px-4 py-3">{r.isAdmin ? <Badge variant="orange">Partner admin</Badge> : <span className="text-bb-muted">Rep</span>}</td>
                <td className="px-4 py-3">
                  <Toggle checked={r.canClose} disabled={busy === `rep:${r.id}`} onChange={(v) => onPatch(r.id, { canClose: v })} />
                </td>
                <td className="px-4 py-3">
                  <Toggle checked={r.isActive} disabled={busy === `rep:${r.id}`} onChange={(v) => onPatch(r.id, { isActive: v })} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onCopy(r.portalUrl, r.id)} className="inline-flex items-center gap-1 text-xs text-bb-muted hover:text-white">
                      {copied === r.id ? <Check size={12} /> : <Copy size={12} />} copy
                    </button>
                    {r.email && (
                      <button onClick={() => onPatch(r.id, { emailLink: true })} className="text-xs text-bb-dim hover:text-white" title={`Email the link to ${r.email}`}>
                        email
                      </button>
                    )}
                    <button onClick={() => onPatch(r.id, { rotateToken: true, emailLink: !!r.email })} className="text-xs text-bb-dim hover:text-white" title="Issue a new link (emailed if they have an address); the old one stops working">
                      rotate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[160px]">
          <span className="block text-xs text-bb-muted mb-1">New rep name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex-1 min-w-[160px]">
          <span className="block text-xs text-bb-muted mb-1">Email (optional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-bb-elevated hover:bg-bb-border text-white rounded-lg text-sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add rep
        </button>
      </form>
    </div>
  );
}

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative w-10 h-5 rounded-full transition-colors disabled:opacity-50", checked ? "bg-bb-orange" : "bg-bb-border")}
      aria-pressed={checked}
    >
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", checked ? "left-5" : "left-0.5")} />
    </button>
  );
}

function CommissionsTab({
  partnerId,
  partner,
  ledger,
  onChanged,
}: {
  partnerId: string;
  partner: Partner;
  ledger: LedgerRow[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"PAYABLE" | "PAID" | "ALL">("PAYABLE");
  const [preview, setPreview] = useState<{ gross: number; clawbacks: number; net: number; rows: Array<{ id: string }> } | null>(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [paying, setPaying] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ clientId: "", amount: "", description: "" });
  const [voidRow, setVoidRow] = useState<LedgerRow | null>(null);

  const rows = useMemo(() => ledger.filter((r) => filter === "ALL" || r.status === filter), [ledger, filter]);

  async function openPay() {
    const res = await fetch(`/api/partners/${partnerId}/pay`);
    const r = await readJson<{ data: { gross: number; clawbacks: number; net: number; rows: Array<{ id: string }> } }>(res);
    if (!r.ok || !r.data) return toast(r.error || "Could not preview the payout", "error");
    setPreview(r.data.data);
    setConfirmPay(true);
  }

  async function pay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const r = await readJson<{ data: { amount: number; items: number; transferId: string } }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Payout failed");
      toast(`Sent ${usd(r.data.data.amount)} (${r.data.data.items} items), transfer ${r.data.data.transferId}`, "success");
      setConfirmPay(false);
      await onChanged();
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setPaying(false);
    }
  }

  async function saveAdjust(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(adjust.amount);
    if (!adjust.clientId || !Number.isFinite(amount) || amount === 0) return toast("Pick a practice and an amount", "error");
    const res = await fetch(`/api/partners/${partnerId}/commissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: adjust.clientId, amount, description: adjust.description }),
    });
    const r = await readJson(res);
    if (!r.ok) return toast(r.error || "Could not save", "error");
    setAdjustOpen(false);
    setAdjust({ clientId: "", amount: "", description: "" });
    toast("Adjustment recorded", "success");
    await onChanged();
  }

  async function doVoid() {
    if (!voidRow) return;
    const res = await fetch(`/api/partners/${partnerId}/commissions?rowId=${voidRow.id}`, { method: "DELETE" });
    const r = await readJson(res);
    if (!r.ok) toast(r.error || "Could not void", "error");
    else toast("Voided", "success");
    setVoidRow(null);
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1">
          {(["PAYABLE", "PAID", "ALL"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1 rounded-md text-xs", filter === f ? "bg-bb-elevated text-white" : "text-bb-muted hover:text-white")}>
              {f === "PAYABLE" ? "Payable" : f === "PAID" ? "Paid" : "All"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAdjustOpen(true)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bb-elevated hover:bg-bb-border text-sm text-white">
            <Plus size={14} /> Adjustment
          </button>
          <button
            onClick={openPay}
            disabled={partner.totals.payable <= 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bb-orange hover:bg-bb-orange-light disabled:opacity-50 text-sm text-white"
          >
            <Send size={14} /> Pay {usd(partner.totals.payable)} via Stripe
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-bb-muted py-6">Nothing here yet. Rows appear automatically when a partner-registered practice pays a deposit or a plan month.</p>
      ) : (
        <div className="bg-bb-surface border border-bb-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-[11px] uppercase tracking-wide text-bb-dim">
              <tr className="border-b border-bb-border">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Practice</th>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-right px-4 py-3">Basis</th>
                <th className="text-right px-4 py-3">Rate</th>
                <th className="text-right px-4 py-3">Commission</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-bb-border/60">
                  <td className="px-4 py-3 text-bb-muted whitespace-nowrap">{fmtDate(r.eventAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/clients/${r.client.id}`} className="text-white hover:text-bb-orange">
                      {r.client.name}
                    </Link>
                    {r.rep && <p className="text-xs text-bb-dim">{r.rep}</p>}
                  </td>
                  <td className="px-4 py-3 text-bb-muted">
                    <Badge variant={r.kind === "ADJUSTMENT" ? (r.amount < 0 ? "red" : "purple") : r.kind === "PLAN" ? "blue" : "gray"}>{r.kind.replace("_", " ")}</Badge>
                    <p className="text-xs text-bb-dim mt-1 max-w-[280px]">{r.description}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-bb-muted">{usd(r.basisAmount)}</td>
                  <td className="px-4 py-3 text-right text-bb-muted">{r.rate}%</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", r.amount < 0 ? "text-red-400" : "text-white")}>{usd(r.amount)}</td>
                  <td className="px-4 py-3">
                    {r.status === "PAID" ? (
                      <span className="text-green-400 text-xs">Paid {fmtDate(r.paidAt)}</span>
                    ) : r.status === "VOID" ? (
                      <span className="text-bb-dim text-xs">Void</span>
                    ) : (
                      <span className="text-yellow-400 text-xs">Due {fmtDate(r.payableBy)}</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {r.status === "PAYABLE" && (
                      <button onClick={() => setVoidRow(r)} className="text-bb-dim hover:text-red-400" title="Void this row">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {partner.payouts.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-bb-dim mb-2">Payout history</p>
          <div className="bg-bb-surface border border-bb-border rounded-xl divide-y divide-bb-border/60">
            {partner.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="text-white">
                    {usd(p.amount)} · {p.items} item{p.items === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-bb-dim">
                    {fmtDate(p.createdAt)}
                    {p.createdBy ? ` by ${p.createdBy}` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                {p.stripeTransferId && <span className="font-mono text-xs text-bb-muted">{p.stripeTransferId}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmPay}
        onClose={() => setConfirmPay(false)}
        onConfirm={pay}
        loading={paying}
        confirmVariant="default"
        confirmLabel={preview ? `Send ${usd(preview.net)}` : "Send"}
        title="Send this payout through Stripe Connect?"
        message={
          preview
            ? `${preview.rows.length} payable item${preview.rows.length === 1 ? "" : "s"}: ${usd(preview.gross)} in commission${
                preview.clawbacks < 0 ? ` less ${usd(Math.abs(preview.clawbacks))} in clawbacks` : ""
              } = ${usd(preview.net)} net. One transfer goes to ${partner.name}'s Stripe account and every item is marked paid.`
            : ""
        }
      />

      <ConfirmDialog
        open={!!voidRow}
        onClose={() => setVoidRow(null)}
        onConfirm={doVoid}
        title="Void this commission row?"
        message={voidRow ? `${voidRow.description} (${usd(voidRow.amount)}) will be removed from what is payable. Paid rows cannot be voided.` : ""}
        confirmLabel="Void"
      />

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Manual adjustment">
        <form onSubmit={saveAdjust} className="space-y-3">
          <p className="text-xs text-bb-muted">A bonus or correction (positive) or a clawback (negative). It nets into the next payout.</p>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1">Practice</span>
            <select value={adjust.clientId} onChange={(e) => setAdjust({ ...adjust, clientId: e.target.value })} className={inputClass}>
              <option value="">Choose</option>
              {partner.deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.company ? ` (${d.company})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1">Amount (USD, negative for a clawback)</span>
            <input type="number" step="0.01" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1">Reason</span>
            <input required value={adjust.description} onChange={(e) => setAdjust({ ...adjust, description: e.target.value })} className={inputClass} placeholder="Why this is on the statement" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdjustOpen(false)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-lg text-sm font-medium">
              Record
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SettingsTab({ partner, onSave }: { partner: Partner; onSave: (body: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [rates, setRates] = useState<Rates>(partner.rates);
  const [criteria, setCriteria] = useState(partner.qualificationCriteria || "");
  const [bookingLink, setBookingLink] = useState(partner.bookingLink || "");
  const [signerName, setSignerName] = useState(partner.signer.name);
  const [signature, setSignature] = useState<string | null>(null);
  const [details, setDetails] = useState({
    name: partner.name,
    legalName: partner.legalName || "",
    contactName: partner.contactName || "",
    email: partner.email || "",
    phone: partner.phone || "",
    notes: partner.notes || "",
  });
  const [saving, setSaving] = useState<string | null>(null);

  async function save(key: string, body: Record<string, unknown>) {
    setSaving(key);
    await onSave(body, "Saved");
    setSaving(null);
  }

  const rateField = (k: keyof Rates, label: string, suffix = "%") => (
    <label className="block">
      <span className="block text-xs text-bb-muted mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={suffix === "%" ? "0.5" : "1"}
          value={rates[k]}
          onChange={(e) => setRates({ ...rates, [k]: Number(e.target.value) })}
          className={inputClass}
        />
        <span className="text-xs text-bb-dim w-12">{suffix}</span>
      </div>
    </label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="bg-bb-surface border border-bb-border rounded-xl p-5 space-y-3">
        <h3 className="text-white font-medium">Commission schedule</h3>
        <p className="text-xs text-bb-muted">Applies to deals that sign after you save. Existing ledger rows keep the rate they were created with.</p>
        <div className="grid grid-cols-2 gap-3">
          {rateField("rateProjectHandoff", "Project, Chase closes")}
          {rateField("rateProjectClose", "Project, team closes (first $15k)")}
          {rateField("rateBrandGuideHandoff", "Brand guide, Chase closes")}
          {rateField("rateBrandGuideClose", "Brand guide, team closes")}
          {rateField("ratePlan", "Monthly plans")}
          {rateField("planMonths", "Plan window", "months")}
          {rateField("payoutDays", "Pay within", "days")}
        </div>
        <p className="text-xs text-bb-dim">Team-close bands above the first $15,000 are fixed at 10% to $50,000 and 5% beyond, as agreed.</p>
        <SaveButton saving={saving === "rates"} onClick={() => save("rates", { rates })} />
      </section>

      <section className="bg-bb-surface border border-bb-border rounded-xl p-5 space-y-3">
        <h3 className="text-white font-medium">Qualification criteria</h3>
        <p className="text-xs text-bb-muted">Shown to every rep in the portal and printed in the kit. One bullet per line starting with a dash. Leave blank for the default list.</p>
        <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} className={`${inputClass} min-h-[200px] font-mono text-xs`} placeholder={"A qualified call means:\n- Decision maker on the call\n- Wants a site in the next 90 days\n- Heard the starting price"} />
        <label className="block">
          <span className="block text-xs text-bb-muted mb-1">Booking link for this partner&apos;s reps</span>
          <input value={bookingLink} onChange={(e) => setBookingLink(e.target.value)} className={inputClass} placeholder="https://calendar.app.google/..." />
        </label>
        <SaveButton saving={saving === "criteria"} onClick={() => save("criteria", { qualificationCriteria: criteria, bookingLink: bookingLink || null })} />
      </section>

      <section className="bg-bb-surface border border-bb-border rounded-xl p-5 space-y-3">
        <h3 className="text-white font-medium">Counter-signature on partner contracts</h3>
        <p className="text-xs text-bb-muted">
          Every contract a closer generates is counter-signed with this name{partner.signer.hasSignature ? " and your drawn signature" : ""}. {partner.signer.hasSignature ? "Draw again to replace it." : "Draw once and it is reused."}
        </p>
        <label className="block">
          <span className="block text-xs text-bb-muted mb-1">Signer name</span>
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className={inputClass} />
        </label>
        <div className="bg-bb-black border border-bb-border rounded-lg p-2">
          <SignatureCanvas onSignatureChange={setSignature} />
        </div>
        <SaveButton
          saving={saving === "signer"}
          onClick={() => save("signer", { signer: { name: signerName, ...(signature ? { signatureData: signature } : {}) } })}
        />
      </section>

      <section className="bg-bb-surface border border-bb-border rounded-xl p-5 space-y-3">
        <h3 className="text-white font-medium">Partner details</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-bb-muted mb-1">Name</span>
            <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} className={inputClass} />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-bb-muted mb-1">Legal entity</span>
            <input value={details.legalName} onChange={(e) => setDetails({ ...details, legalName: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1">Contact</span>
            <input value={details.contactName} onChange={(e) => setDetails({ ...details, contactName: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1">Email</span>
            <input value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1">Phone</span>
            <input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} className={inputClass} />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-bb-muted mb-1">Notes</span>
            <textarea value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} className={`${inputClass} min-h-[70px]`} />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <SaveButton
            saving={saving === "details"}
            onClick={() =>
              save("details", {
                name: details.name,
                legalName: details.legalName || null,
                contactName: details.contactName || null,
                email: details.email || null,
                phone: details.phone || null,
                notes: details.notes || null,
              })
            }
          />
          <button onClick={() => save("active", { isActive: !partner.isActive })} className="text-xs text-bb-muted hover:text-white underline">
            {partner.isActive ? "Deactivate partner (links stop working, commissions stop accruing)" : "Reactivate partner"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-60 text-white rounded-lg text-sm font-medium">
      {saving && <Loader2 size={14} className="animate-spin" />} Save
    </button>
  );
}
