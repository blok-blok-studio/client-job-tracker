"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Plus, Loader2, Copy, Check } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import { useToast } from "@/components/shared/Toast";
import { readJson, friendlyError } from "@/lib/fetch-json";

interface PartnerRow {
  id: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  email: string | null;
  isActive: boolean;
  connectOnboarded: boolean;
  w9ReceivedAt: string | null;
  reps: number;
  clients: number;
  totals: { payable: number; paid: number; lifetime: number };
  createdAt: string;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const inputClass =
  "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

export default function PartnersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; adminPortalUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    contactName: "",
    email: "",
    phone: "",
    country: "US",
    notes: "",
  });

  async function load() {
    try {
      const res = await fetch("/api/partners");
      const r = await readJson<{ data: PartnerRow[] }>(res);
      if (r.ok && r.data) setPartners(r.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const r = await readJson<{ data: { id: string; adminPortalUrl: string } }>(res);
      if (!r.ok || !r.data) throw new Error(r.error || "Could not create the partner");
      setCreated(r.data.data);
      toast(`${form.name} added`, "success");
      load();
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed, select the link by hand", "error");
    }
  }

  return (
    <>
      <TopBar title="Partners" subtitle="Sales partners, their reps, deals and commission payouts" />
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-bb-muted">
            Partners register practices and, once approved, close on our standard contract. Commissions accrue from Stripe
            and pay out through Stripe Connect.
          </p>
          <button
            onClick={() => {
              setCreated(null);
              setAdding(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add partner
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-bb-muted text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading
          </div>
        ) : partners.length === 0 ? (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-10 text-center">
            <Handshake size={32} className="mx-auto text-bb-dim mb-3" />
            <p className="text-white font-medium">No partners yet</p>
            <p className="text-sm text-bb-muted mt-1">Add MBMedSolutions to get Eric&apos;s admin link, the kit and the agreement.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/partners/${p.id}`)}
                className="text-left bg-bb-surface border border-bb-border hover:border-bb-orange/50 rounded-xl p-5 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-display font-bold text-white">{p.name}</h2>
                      {!p.isActive && <Badge variant="gray">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-bb-muted">
                      {p.contactName}
                      {p.email ? ` · ${p.email}` : ""}
                      {p.legalName ? ` · ${p.legalName}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant={p.connectOnboarded ? "green" : "yellow"}>
                        {p.connectOnboarded ? "Stripe connected" : "Stripe not connected"}
                      </Badge>
                      <Badge variant={p.w9ReceivedAt ? "green" : "yellow"}>{p.w9ReceivedAt ? "W-9 on file" : "W-9 missing"}</Badge>
                      <Badge variant="gray">
                        {p.reps} rep{p.reps === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="gray">
                        {p.clients} practice{p.clients === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right">
                    <Stat label="Payable" value={usd(p.totals.payable)} highlight={p.totals.payable > 0} />
                    <Stat label="Paid" value={usd(p.totals.paid)} />
                    <Stat label="Lifetime" value={usd(p.totals.lifetime)} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title={created ? "Partner created" : "Add a sales partner"}>
        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-bb-muted">
              This is the partner admin&apos;s portal link. Send it to them privately: it is their login. They add their own reps
              from inside it.
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={created.adminPortalUrl} className={inputClass} onFocus={(e) => e.currentTarget.select()} />
              <button
                onClick={() => copy(created.adminPortalUrl)}
                className="p-2 rounded-lg border border-bb-border hover:bg-bb-elevated text-bb-muted hover:text-white"
                title="Copy"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setAdding(false);
                  router.push(`/partners/${created.id}`);
                }}
                className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-lg text-sm font-medium"
              >
                Open partner
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-3">
            <Field label="Partner name" hint="How reps and clients know them">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="MBMedSolutions" />
            </Field>
            <Field label="Legal entity" hint="On the agreement and the 1099">
              <input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className={inputClass} placeholder="MBMedSolutions LLC" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner / admin">
                <input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={inputClass} placeholder="Eric Mbualungu" />
              </Field>
              <Field label="Country">
                <input value={form.country} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputClass} min-h-[70px]`} />
            </Field>
            <p className="text-xs text-bb-dim">
              Commission rates default to the agreed MMS terms (9% / 18% projects, 5% / 10% brand guide, 15% plans for 16 months,
              paid within 30 days). Change them on the partner page.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} Create partner
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-bb-dim">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-bb-orange" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-bb-muted mb-1">
        {label}
        {hint ? <span className="text-bb-dim"> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
