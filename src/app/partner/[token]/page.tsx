"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { AlertCircle, Check, CheckCircle, Copy, Download, FileText, Loader2, Plus, Users, X } from "lucide-react";
import AddToHomeScreen from "@/components/shared/AddToHomeScreen";
import { readJson, friendlyError } from "@/lib/fetch-json";

/**
 * Sales-partner portal. One link per rep; no login.
 *  - every rep: price list, qualification criteria, register a practice, see their own deals
 *  - approved closers: generate our standard contract on a call
 *  - the partner admin: every rep's deals, manage reps, commission statement and payouts
 */

interface CatalogItem {
  id: string;
  name: string;
  price: number;
  recurring: boolean;
  description: string;
  deliverables: string[];
  timeline: string;
  pillar: string;
}

interface Deal {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  stageLabel: string;
  closedBy: string | null;
  registeredAt: string;
  rep: { id: string; name: string } | null;
  packages: string[];
  contractUrl: string | null;
  contractStatus: string | null;
  depositUrl: string | null;
  depositPaid: boolean;
  planDescription: string | null;
  planStatus: string | null;
}

interface RepRow {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  canClose: boolean;
  isActive: boolean;
  portalUrl: string;
}

interface CommissionRow {
  id: string;
  kind: string;
  description: string;
  basisAmount: number;
  rate: number;
  amount: number;
  status: "PAYABLE" | "PAID" | "VOID";
  eventAt: string;
  payableBy: string | null;
  paidAt: string | null;
  client: { name: string; company: string | null };
  partnerRep: { name: string } | null;
}

interface PortalData {
  rep: { id: string; name: string; isAdmin: boolean; canClose: boolean };
  partner: {
    name: string;
    qualificationCriteria: string | null;
    bookingLink?: string | null;
    payout?: { onFile: boolean; last4: string | null; verified: boolean };
    w9ReceivedAt?: string | null;
    billing?: { legalName: string | null; billingAddress: string | null; taxId: string | null; email: string | null; country: string };
    rates?: { projectHandoff: number; projectClose: number; brandGuideHandoff: number; brandGuideClose: number; plan: number; planMonths: number; payoutDays: number };
  };
  catalog: CatalogItem[];
  deals: Deal[];
  reps?: RepRow[];
  commissions?: CommissionRow[];
  payouts?: Array<{ id: string; amount: number; stripeTransferId: string | null; wiseTransferId?: string | null; note: string | null; createdAt: string; items: number }>;
  totals?: { payable: number; paid: number; lifetime: number };
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

const inputClass =
  "w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50";

const STAGE_COLOR: Record<string, string> = {
  registered: "bg-white/10 text-gray-300",
  contract_sent: "bg-yellow-500/10 text-yellow-400",
  signed: "bg-blue-500/10 text-blue-400",
  deposit_paid: "bg-green-500/10 text-green-400",
  balance_paid: "bg-green-500/10 text-green-400",
  live: "bg-green-500/10 text-green-400",
  lost: "bg-red-500/10 text-red-400",
};

const DEFAULT_CRITERIA = [
  "A real, operating business with a decision maker on the call (owner, partner, practice manager or marketing lead).",
  "They want a new or rebuilt website, or a monthly plan, in the next 90 days.",
  "They have heard the starting price for the package they want and did not object.",
  "They know the call is with Blok Blok Studio, a web design studio, and what it is about.",
  "A date and time is confirmed and on their calendar.",
];

type Tab = "deals" | "prices" | "team" | "statement";

export default function PartnerPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("deals");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [closeDeal, setCloseDeal] = useState<Deal | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const notify = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/partner/${token}`);
      const r = await readJson<{ data: PortalData }>(res);
      if (!r.ok || !r.data) {
        setError(r.status === 404 ? "This link is not valid or has been switched off. Ask your team lead for a new one." : r.error || "Could not load");
        return;
      }
      setData(r.data.data);
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [token]);

  useEffect(() => {
    load();
    const qs = new URLSearchParams(window.location.search);
  }, [load, notify]);

  const criteria = useMemo(() => {
    const raw = data?.partner.qualificationCriteria?.trim();
    if (!raw) return DEFAULT_CRITERIA;
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^[-•]\s*/, ""));
  }, [data]);

  if (error) {
    return (
      <Shell>
        <div className="text-center py-20">
          <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
          <p className="text-white">{error}</p>
        </div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-20 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading your portal
        </div>
      </Shell>
    );
  }

  const tabs: Array<[Tab, string]> = [
    ["deals", data.rep.isAdmin ? "Deals" : "My deals"],
    ["prices", "Price list"],
    ...(data.rep.isAdmin ? ([["team", "Team"], ["statement", "Statement"]] as Array<[Tab, string]>) : []),
  ];

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-orange-400">{data.partner.name} × Blok Blok Studio</p>
          <h1 className="text-2xl font-bold text-white mt-1">Hi {data.rep.name.split(" ")[0]}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {data.rep.isAdmin ? "Partner admin" : "Sales rep"}
            {data.rep.canClose ? " · approved closer" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/partner/${token}/kit`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white">
            <Download size={14} /> Kit PDF
          </a>
          <button onClick={() => setRegisterOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-sm text-white font-medium">
            <Plus size={14} /> Register a practice
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === key ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "deals" && (
        <div className="space-y-5">
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Before you book a call</p>
            <ul className="space-y-1.5">
              {criteria.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <CheckCircle size={15} className="text-orange-400 shrink-0 mt-0.5" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            {data.partner.bookingLink && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={data.partner.bookingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
                >
                  Book the practice a call with Chase
                </a>
                <span className="text-xs text-gray-500">
                  {data.rep.canClose
                    ? "You are an approved closer: run the call on your own calendar and generate the contract here when they say yes."
                    : "Register the practice first, then book them in. Chase runs the call and the close."}
                </span>
              </div>
            )}
          </div>

          {data.deals.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <Users size={28} className="mx-auto text-gray-600 mb-2" />
              <p className="text-white">No practices registered yet</p>
              <p className="text-sm text-gray-500 mt-1">Register a practice before the first call so it is credited to you.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.deals.map((d) => (
                <div key={d.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">
                        {d.name}
                        {d.company ? <span className="text-gray-500"> · {d.company}</span> : null}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Registered {fmtDate(d.registeredAt)}
                        {data.rep.isAdmin && d.rep ? ` by ${d.rep.name}` : ""}
                        {d.closedBy === "PARTNER_REP" ? " · team close" : d.closedBy === "OWNER" ? " · closed by Chase" : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-md ${STAGE_COLOR[d.stage] || STAGE_COLOR.registered}`}>{d.stageLabel}</span>
                  </div>
                  {(d.contractUrl || d.depositUrl || d.planDescription) && (
                    <div className="flex flex-wrap gap-3 mt-3 text-xs">
                      {d.contractUrl && (
                        <CopyLink label={d.contractStatus === "SIGNED" ? "Signed agreement" : "Signing link"} url={d.contractUrl} onCopied={() => notify("Copied")} />
                      )}
                      {d.depositUrl && <CopyLink label="Deposit link" url={d.depositUrl} onCopied={() => notify("Copied")} />}
                      {d.depositPaid && <span className="text-green-400">Deposit paid</span>}
                      {d.planDescription && (
                        <span className="text-gray-400">
                          {d.planDescription} · {d.planStatus === "ACTIVE" ? "active" : d.planStatus?.toLowerCase()}
                        </span>
                      )}
                    </div>
                  )}
                  {data.rep.canClose && d.stage === "registered" && (
                    <button onClick={() => setCloseDeal(d)} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-sm">
                      <FileText size={14} /> Generate contract
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "deals" && (data.rep.canClose || data.rep.isAdmin) && (
        <PortalInvoices token={token} deals={data.deals} catalog={data.catalog} canClose={data.rep.canClose} notify={notify} />
      )}

      {tab === "prices" && <PriceList catalog={data.catalog} />}

      {tab === "team" && data.reps && <TeamTab token={token} reps={data.reps} selfId={data.rep.id} onChanged={load} notify={notify} />}

      {tab === "statement" && data.commissions && data.totals && (
        <StatementTab token={token} partner={data.partner} commissions={data.commissions} payouts={data.payouts || []} totals={data.totals} />
      )}

      {registerOpen && (
        <RegisterSheet
          token={token}
          onClose={() => setRegisterOpen(false)}
          onDone={async () => {
            setRegisterOpen(false);
            notify("Practice registered");
            await load();
          }}
        />
      )}

      {closeDeal && (
        <CloseSheet
          token={token}
          deal={closeDeal}
          catalog={data.catalog}
          onClose={() => setCloseDeal(null)}
          onDone={async () => {
            await load();
          }}
          notify={notify}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm shadow-lg ${toast.kind === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>{toast.text}</div>
      )}

      <AddToHomeScreen storageKey={`partner-portal-${token}`} what="your partner portal" />
    </Shell>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">{children}</div>
      <p className="text-center text-[11px] text-gray-600 pb-8">Blok Blok Studio LLC · partner portal</p>
    </main>
  );
}

function CopyLink({ label, url, onCopied }: { label: string; url: string; onCopied: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          onCopied();
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="inline-flex items-center gap-1 text-orange-300 hover:text-orange-200"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {label}
    </button>
  );
}

function PriceList({ catalog }: { catalog: CatalogItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const oneTime = catalog.filter((c) => !c.recurring);
  const plans = catalog.filter((c) => c.recurring);
  const Row = ({ p }: { p: CatalogItem }) => (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl">
      <button onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full text-left p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-medium">{p.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
          <p className="text-[11px] text-gray-600 mt-1">{p.timeline}</p>
        </div>
        <p className="text-orange-400 font-semibold whitespace-nowrap">
          {usd(p.price)}
          {p.recurring ? <span className="text-xs text-gray-500"> / mo</span> : null}
        </p>
      </button>
      {open === p.id && (
        <ul className="px-4 pb-4 space-y-1.5">
          {p.deliverables.map((d, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-300">
              <span className="text-orange-400">•</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Quote these prices exactly. Websites and brand guides are 50% deposit, 50% on completion. Plans bill monthly. Tap a package to see what is included.
      </p>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Websites and brand</p>
        <div className="space-y-2">
          {oneTime.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Monthly plans</p>
        <div className="space-y-2">
          {plans.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-600">
        Third-party usage (telephony, SMS, AI minutes, ad spend, domains) is billed to the client&apos;s own accounts and is not included in these prices.
      </p>
    </div>
  );
}

function RegisterSheet({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", website: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/partner/${token}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const r = await readJson(res);
      if (!r.ok) throw new Error(r.error || "Could not register");
      await onDone();
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Register a practice" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">Register before the first call. If the practice is already known to Blok Blok you will be told now, not later.</p>
        <input required placeholder="Contact name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
        <input placeholder="Practice / business name" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={inputClass} />
        <input placeholder="Current website (if any)" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={inputClass} />
        <textarea placeholder="Notes for Chase: what they want, budget conversation, timing" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputClass} min-h-[90px]`} />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-medium">
          {saving && <Loader2 size={14} className="animate-spin" />} Register
        </button>
      </form>
    </Sheet>
  );
}

function CloseSheet({
  token,
  deal,
  catalog,
  onClose,
  onDone,
  notify,
}: {
  token: string;
  deal: Deal;
  catalog: CatalogItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
  notify: (t: string, k?: "ok" | "err") => void;
}) {
  const websites = catalog.filter((c) => c.pillar === "PROJECT" && !c.recurring);
  const brand = catalog.find((c) => c.pillar === "BRAND_GUIDE");
  const plans = catalog.filter((c) => c.recurring);
  const [websiteId, setWebsiteId] = useState<string | null>(websites[0]?.id || null);
  const [brandGuide, setBrandGuide] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ contractUrl: string; depositUrl: string | null; depositAmount: number | null; planUrl: string | null; planAmount: number | null; paymentLinkError: string | null } | null>(null);

  const oneTime = (websiteId ? websites.find((w) => w.id === websiteId)?.price || 0 : 0) + (brandGuide && brand ? brand.price : 0);
  const monthly = planId ? plans.find((p) => p.id === planId)?.price || 0 : 0;

  async function generate() {
    if (!websiteId && !brandGuide && !planId) return setErr("Pick at least one package");
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/partner/${token}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: deal.id, websiteId, brandGuide, planId }),
      });
      const r = await readJson<{ data: NonNullable<typeof result> }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Could not generate the contract");
      setResult(r.data.data);
      notify("Contract and payment link sent to the practice");
      await onDone();
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={result ? "Sent" : `Contract for ${deal.name}`} onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            The agreement and the deposit link were emailed to {deal.email}. Paste them into the call so they can sign and pay while you are together.
          </p>
          <LinkBox label="Signing link" url={result.contractUrl} />
          {result.depositUrl && <LinkBox label={`Deposit${result.depositAmount ? ` · ${usd2(result.depositAmount)}` : ""}`} url={result.depositUrl} />}
          {result.planUrl && <LinkBox label={`Plan${result.planAmount ? ` · ${usd2(result.planAmount)} / month` : ""}`} url={result.planUrl} />}
          <p className="text-sm text-gray-400">The deposit invoice goes to the practice by email as soon as they sign. Its pay link then shows on this deal.</p>
          {result.paymentLinkError && <p className="text-sm text-yellow-400">Invoices could not be prepared: {result.paymentLinkError}. Chase has been notified.</p>}
          <p className="text-xs text-gray-500">The balance link is sent by Blok Blok when the project is complete. Once the deposit lands, onboarding starts automatically.</p>
          <button onClick={onClose} className="w-full px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Blok Blok&apos;s standard agreement at list price, 50% deposit and 50% on completion. Nothing here can be edited; if they need something different, book Chase.</p>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Website</p>
            <div className="space-y-2">
              <Option selected={websiteId === null} onClick={() => setWebsiteId(null)} title="No website" sub="Brand guide or plan only" />
              {websites.map((w) => (
                <Option key={w.id} selected={websiteId === w.id} onClick={() => setWebsiteId(w.id)} title={w.name} sub={w.timeline} price={usd(w.price)} />
              ))}
            </div>
          </div>
          {brand && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Brand</p>
              <Option selected={brandGuide} onClick={() => setBrandGuide(!brandGuide)} title={brand.name} sub={brand.timeline} price={usd(brand.price)} checkbox />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Monthly plan</p>
            <div className="space-y-2">
              <Option selected={planId === null} onClick={() => setPlanId(null)} title="No plan yet" sub="Can be added after launch" />
              {plans.map((p) => (
                <Option key={p.id} selected={planId === p.id} onClick={() => setPlanId(p.id)} title={p.name} sub={p.timeline} price={`${usd(p.price)} / mo`} />
              ))}
            </div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-lg p-3 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Project total</span>
              <span className="text-white">{usd(oneTime)}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Deposit today (50%)</span>
              <span className="text-orange-400 font-semibold">{usd(oneTime / 2)}</span>
            </div>
            {monthly > 0 && (
              <div className="flex justify-between text-gray-300">
                <span>Monthly plan</span>
                <span className="text-white">{usd(monthly)} / mo</span>
              </div>
            )}
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button onClick={generate} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-medium">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {saving ? "Generating" : "Generate and send"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Option({ selected, onClick, title, sub, price, checkbox }: { selected: boolean; onClick: () => void; title: string; sub?: string; price?: string; checkbox?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between gap-3 ${selected ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-4 h-4 shrink-0 ${checkbox ? "rounded" : "rounded-full"} border ${selected ? "border-orange-400 bg-orange-400" : "border-gray-600"}`} />
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{title}</p>
          {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
        </div>
      </div>
      {price && <span className="text-sm text-gray-300 whitespace-nowrap">{price}</span>}
    </button>
  );
}

function LinkBox({ label, url }: { label: string; url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-lg p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1 bg-transparent text-sm text-gray-200 outline-none truncate" />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            } catch {
              window.prompt("Copy this link", url);
            }
          }}
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-300"
        >
          {done ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-[#121212] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TeamTab({ token, reps, selfId, onChanged, notify }: { token: string; reps: RepRow[]; selfId: string; onChanged: () => Promise<void>; notify: (t: string, k?: "ok" | "err") => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/partner/${token}/reps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
      const r = await readJson(res);
      if (!r.ok) throw new Error(r.error || "Could not add");
      setName("");
      setEmail("");
      notify("Rep added. Copy their link and send it privately.");
      await onChanged();
    } catch (err) {
      notify(friendlyError(err), "err");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rep: RepRow) {
    const res = await fetch(`/api/partner/${token}/reps`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repId: rep.id, isActive: !rep.isActive }) });
    const r = await readJson(res);
    if (!r.ok) notify(r.error || "Could not update", "err");
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Each rep gets a personal link. It is their login: send it privately and never share it with practices. Blok Blok approves who can close; ask Chase when a rep is ready.
      </p>
      <div className="space-y-2">
        {reps.map((r) => (
          <div key={r.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-white">
                {r.name}
                {r.isAdmin ? <span className="text-xs text-orange-400 ml-2">admin</span> : null}
                {r.canClose ? <span className="text-xs text-green-400 ml-2">closer</span> : null}
                {!r.isActive ? <span className="text-xs text-gray-500 ml-2">inactive</span> : null}
              </p>
              {r.email && <p className="text-xs text-gray-500">{r.email}</p>}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(r.portalUrl);
                    setCopied(r.id);
                    setTimeout(() => setCopied(null), 1500);
                  } catch {
                    window.prompt("Copy this link", r.portalUrl);
                  }
                }}
                className="inline-flex items-center gap-1 text-orange-300 hover:text-orange-200"
              >
                {copied === r.id ? <Check size={12} /> : <Copy size={12} />} link
              </button>
              {r.id !== selfId && (
                <button onClick={() => toggle(r)} className="text-gray-400 hover:text-white">
                  {r.isActive ? "deactivate" : "reactivate"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-gray-500">Add a rep</p>
        <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white text-sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
        </button>
      </form>
    </div>
  );
}

function StatementTab({
  token,
  partner,
  commissions,
  payouts,
  totals,
}: {
  token: string;
  partner: PortalData["partner"];
  commissions: CommissionRow[];
  payouts: NonNullable<PortalData["payouts"]>;
  totals: { payable: number; paid: number; lifetime: number };
}) {
  const r = partner.rates;
  const [statements, setStatements] = useState<Array<{ id: string; number: string; payoutId: string }>>([]);
  useEffect(() => {
    fetch(`/api/partner/${token}/statements`)
      .then((res) => readJson<{ data: Array<{ id: string; number: string; payoutId: string }> }>(res))
      .then((res) => {
        if (res.ok && res.data) setStatements(res.data.data);
      })
      .catch(() => {});
  }, [token, payouts.length]);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Payable" value={usd2(totals.payable)} accent />
        <Tile label="Paid to date" value={usd2(totals.paid)} />
        <Tile label="Lifetime" value={usd2(totals.lifetime)} />
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 text-sm space-y-2">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Setup</p>
        <PayoutForm token={token} payout={partner.payout} />
        <p className={partner.w9ReceivedAt ? "text-green-400" : "text-yellow-400"}>{partner.w9ReceivedAt ? "W-9: received" : "W-9: send Chase a completed W-9 before the first payout"}</p>
        <BillingForm token={token} billing={partner.billing} />
        {r && (
          <p className="text-gray-400 pt-1">
            Projects {r.projectHandoff}% handoff / {r.projectClose}% team close (first $15k) · brand guide {r.brandGuideHandoff}% / {r.brandGuideClose}% · plans {r.plan}% for {r.planMonths} months · paid within {r.payoutDays} days of the client payment.
          </p>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Commission ledger</p>
        {commissions.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing yet. Rows appear when a registered practice pays a deposit or a plan month.</p>
        ) : (
          <div className="space-y-2">
            {commissions.map((c) => (
              <div key={c.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">
                    {c.client.name}
                    {c.client.company ? <span className="text-gray-500"> · {c.client.company}</span> : null}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(c.eventAt)} · {c.description}
                    {c.partnerRep ? ` · ${c.partnerRep.name}` : ""}
                  </p>
                  <p className="text-[11px] mt-0.5">
                    {c.status === "PAID" ? <span className="text-green-400">Paid {fmtDate(c.paidAt)}</span> : c.status === "VOID" ? <span className="text-gray-500">Void</span> : <span className="text-yellow-400">Due by {fmtDate(c.payableBy)}</span>}
                  </p>
                </div>
                <p className={`text-sm font-semibold whitespace-nowrap ${c.amount < 0 ? "text-red-400" : "text-white"}`}>{usd2(c.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {payouts.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Payouts</p>
          <p className="text-xs text-gray-500 mb-2">Each payout comes with a numbered commission statement. It is issued on your behalf as a self-billing credit note and is the invoice for that commission: keep it for your books, no invoice to send us.</p>
          <div className="space-y-2">
            {payouts.map((p) => (
              <div key={p.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="text-white">{usd2(p.amount)}</p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(p.createdAt)} · {p.items} item{p.items === 1 ? "" : "s"}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {statements.find((st) => st.payoutId === p.id) ? (
                    <a href={`/api/partner/${token}/statements/${statements.find((st) => st.payoutId === p.id)!.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-300 hover:underline whitespace-nowrap">
                      <Download size={12} /> Statement {statements.find((st) => st.payoutId === p.id)!.number}
                    </a>
                  ) : (
                    <span className="text-[11px] text-gray-500">statement coming</span>
                  )}
                  {(p.wiseTransferId || p.stripeTransferId) && <span className="font-mono text-[11px] text-gray-500 hidden sm:inline">{p.wiseTransferId || p.stripeTransferId}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PayoutForm({ token, payout }: { token: string; payout?: PortalData["partner"]["payout"] }) {
  const [saved, setSaved] = useState(payout);
  const [open, setOpen] = useState(!payout?.onFile);
  const [form, setForm] = useState({ accountHolder: "", bankName: "", routingNumber: "", accountNumber: "", accountType: "checking", address: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/partner/${token}/payout-details`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const r = await readJson<{ data: { last4: string } }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Could not save");
      setSaved({ onFile: true, last4: r.data.data.last4, verified: false });
      setForm({ ...form, routingNumber: "", accountNumber: "" });
      setOpen(false);
      setMsg("Saved. Chase will confirm them with you before the next payout.");
    } catch (err) {
      setMsg(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className={saved?.verified ? "text-green-400" : "text-yellow-400"}>
          {!saved?.onFile ? "Payouts: add the US bank account commissions should go to" : saved.verified ? `Payouts: account ending ${saved.last4}, confirmed` : `Payouts: account ending ${saved.last4}, waiting for Chase to confirm`}
        </p>
        {saved?.onFile && <button onClick={() => setOpen((v) => !v)} className="text-xs text-orange-300 hover:underline">{open ? "Hide" : "Change"}</button>}
      </div>
      <p className="text-xs text-gray-500 mt-1">Commissions are paid by bank transfer through Wise. Your details are encrypted and are not shown here again. Changing them pauses payouts until Chase confirms with you.</p>
      {open && (
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <input className={inputClass} placeholder="Account holder (legal name)" value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} />
          <input className={inputClass} placeholder="Bank name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          <input className={inputClass} inputMode="numeric" autoComplete="off" placeholder="Routing number (9 digits)" value={form.routingNumber} onChange={(e) => setForm({ ...form, routingNumber: e.target.value })} />
          <input className={inputClass} inputMode="numeric" autoComplete="off" placeholder="Account number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          <select className={inputClass} value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
          <input className={inputClass} placeholder="Account holder's address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <button onClick={save} disabled={busy} className="sm:col-span-2 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium disabled:opacity-50">{busy ? "Saving…" : "Save payout details"}</button>
        </div>
      )}
      {msg && <p className="text-xs text-gray-400 mt-2">{msg}</p>}
    </div>
  );
}

function BillingForm({ token, billing }: { token: string; billing?: PortalData["partner"]["billing"] }) {
  const [open, setOpen] = useState(!billing?.billingAddress);
  const [form, setForm] = useState({ legalName: billing?.legalName || "", billingAddress: billing?.billingAddress || "", taxId: billing?.taxId || "", email: billing?.email || "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/partner/${token}/billing`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const r = await readJson(res);
      if (!r.ok) throw new Error(r.error || "Could not save");
      setMsg("Saved. New statements will print these details.");
      setOpen(false);
    } catch (err) {
      setMsg(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="pt-2 border-t border-white/10 mt-2">
      <div className="flex items-center justify-between">
        <p className={billing?.billingAddress ? "text-green-400" : "text-yellow-400"}>{billing?.billingAddress ? "Billing details: on file" : "Billing details: add your legal name, address and tax ID (printed on your commission statements)"}</p>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-orange-300 hover:underline">{open ? "Hide" : "Edit"}</button>
      </div>
      {open && (
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <input className={inputClass} placeholder="Legal entity (e.g. MBMedSolutions LLC)" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
          <input className={inputClass} placeholder="EIN / tax ID" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          <textarea className={`${inputClass} sm:col-span-2 min-h-[70px]`} placeholder={"Street\nCity, State ZIP\nCountry"} value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} />
          <input className={inputClass} placeholder="Billing email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Save billing details"}</button>
        </div>
      )}
      {msg && <p className="text-xs text-gray-400 mt-2">{msg}</p>}
    </div>
  );
}

interface PortalInvoiceRow {
  id: string;
  number: string | null;
  status: "DRAFT" | "ISSUED" | "SENT" | "PAID" | "VOID";
  total: number;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  clientId: string;
  createdAt: string;
  summary: string;
  payUrl: string | null;
}

function PortalInvoices({ token, deals, catalog, canClose, notify }: { token: string; deals: Deal[]; catalog: CatalogItem[]; canClose: boolean; notify: (t: string, k?: "ok" | "err") => void }) {
  const [rows, setRows] = useState<PortalInvoiceRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ clientId: string; websiteId: string; brandGuide: boolean; planId: string; milestone: "deposit" | "balance" | "full"; vat19: boolean }>({ clientId: "", websiteId: "", brandGuide: false, planId: "", milestone: "deposit", vat19: false });
  const websites = catalog.filter((c) => !c.recurring && c.id.includes("website"));
  const plans = catalog.filter((c) => c.recurring);
  const brand = catalog.find((c) => c.id.includes("brand"));
  const load = useCallback(async () => {
    const res = await fetch(`/api/partner/${token}/invoices`);
    const r = await readJson<{ data: PortalInvoiceRow[] }>(res);
    if (r.ok && r.data) setRows(r.data.data);
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);
  const dealName = (id: string) => {
    const d = deals.find((x) => x.id === id);
    return d ? `${d.name}${d.company ? ` · ${d.company}` : ""}` : "Practice";
  };
  const preview = (() => {
    const share = form.milestone === "full" ? 1 : 0.5;
    let total = 0;
    if (form.websiteId) total += (websites.find((w) => w.id === form.websiteId)?.price || 0) * share;
    if (form.brandGuide && brand) total += brand.price * share;
    if (form.planId) total += plans.find((p) => p.id === form.planId)?.price || 0;
    return form.vat19 ? Math.round(total * 1.19 * 100) / 100 : total;
  })();
  async function submit() {
    if (!form.clientId) return notify("Pick the practice", "err");
    if (!form.websiteId && !form.brandGuide && !form.planId) return notify("Pick at least one package", "err");
    setBusy(true);
    try {
      const res = await fetch(`/api/partner/${token}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: form.clientId, websiteId: form.websiteId || null, brandGuide: form.brandGuide, planId: form.planId || null, milestone: form.milestone, vat19: form.vat19 }),
      });
      const r = await readJson(res);
      if (!r.ok) throw new Error(r.error || "Could not create the invoice");
      notify("Draft sent to Chase. You will see the pay link here once it is issued.");
      setFormOpen(false);
      setForm({ clientId: "", websiteId: "", brandGuide: false, planId: "", milestone: "deposit", vat19: false });
      await load();
    } catch (err) {
      notify(friendlyError(err), "err");
    } finally {
      setBusy(false);
    }
  }
  const statusColor: Record<PortalInvoiceRow["status"], string> = { DRAFT: "text-gray-400", ISSUED: "text-yellow-400", SENT: "text-blue-400", PAID: "text-green-400", VOID: "text-red-400" };
  const statusLabel: Record<PortalInvoiceRow["status"], string> = { DRAFT: "waiting for Chase to issue", ISSUED: "issued, awaiting payment", SENT: "sent to the practice", PAID: "paid", VOID: "void" };
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Bank-transfer invoices</p>
          <p className="text-xs text-gray-500 mt-0.5">For practices that prefer ACH or wire over the card link. You draft it from the price list; Chase issues the number and the pay link appears here.</p>
        </div>
        {canClose && (
          <button onClick={() => setFormOpen((v) => !v)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-sm whitespace-nowrap">
            <Plus size={14} /> New invoice
          </button>
        )}
      </div>
      {formOpen && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3 mb-3">
          <select className={inputClass} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Which practice?</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.company ? ` · ${d.company}` : ""}</option>
            ))}
          </select>
          <div className="grid sm:grid-cols-2 gap-2">
            <select className={inputClass} value={form.websiteId} onChange={(e) => setForm({ ...form, websiteId: e.target.value })}>
              <option value="">No website package</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>{w.name} · {usd(w.price)}</option>
              ))}
            </select>
            <select className={inputClass} value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              <option value="">No monthly plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {usd(p.price)}/mo</option>
              ))}
            </select>
          </div>
          {brand && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.brandGuide} onChange={(e) => setForm({ ...form, brandGuide: e.target.checked })} /> Add {brand.name} ({usd(brand.price)})
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {(["deposit", "balance", "full"] as const).map((m) => (
              <button key={m} onClick={() => setForm({ ...form, milestone: m })} className={`px-3 py-1.5 rounded-lg text-sm border ${form.milestone === m ? "border-orange-400 text-orange-300 bg-orange-500/10" : "border-white/10 text-gray-400"}`}>
                {m === "deposit" ? "50% deposit" : m === "balance" ? "50% balance" : "Full amount"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.vat19} onChange={(e) => setForm({ ...form, vat19: e.target.checked })} /> Add 19% German VAT (only for a practice based in Germany)
          </label>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white">Invoice total: {usd2(preview)}</p>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium disabled:opacity-50">{busy ? "Sending…" : "Send draft to Chase"}</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No bank-transfer invoices yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white truncate">{dealName(r.clientId)}</p>
                  <p className="text-xs text-gray-500 truncate">{r.number || "Draft"} · {r.summary}</p>
                  <p className={`text-[11px] mt-0.5 ${statusColor[r.status]}`}>{statusLabel[r.status]}{r.dueDate && r.status !== "PAID" && r.status !== "DRAFT" ? ` · due ${fmtDate(r.dueDate)}` : ""}{r.paidAt ? ` ${fmtDate(r.paidAt)}` : ""}</p>
                </div>
                <p className="text-white font-semibold whitespace-nowrap">{usd2(r.total)}</p>
              </div>
              {r.payUrl && (
                <div className="mt-2 text-xs">
                  <CopyLink label="Pay link (bank details + QR + PDF)" url={r.payUrl} onCopied={() => notify("Copied")} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${accent ? "text-orange-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
