"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Play, Pause, Square, Repeat } from "lucide-react";
import Modal from "@/components/shared/Modal";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import { VAT_OVERRIDE_OPTIONS, type VatOverride, type InvoiceTemplate, type InvoiceLanguage } from "@/lib/invoicing/vat";
import { CURRENCY_OPTIONS } from "@/lib/invoicing/settings-core";
import { inputCls, labelCls, chipCls, btnPrimary, btnGhost, readJsonSafe, money, shortDate } from "./shared";

interface Plan {
  id: string;
  clientId: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  runs: number;
  template: InvoiceTemplate;
  language: InvoiceLanguage;
  currency: string;
  vatOverride: string | null;
  dueDays: number;
  items: Array<{ description: string; qty: number; unitPrice: number }>;
  notes: string | null;
  autoSend: boolean;
  amount: number;
  client: { id: string; name: string; company: string | null };
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

const INTERVAL_LABEL = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" } as const;

export default function PlansPanel({ onInvoiceIssued }: { onInvoiceIssued: () => void }) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [confirmRun, setConfirmRun] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/studio-invoices/plans");
    const j = await readJsonSafe(res);
    if (j.success) setPlans(j.data as Plan[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(p: Plan, body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/studio-invoices/plans/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await readJsonSafe(res);
      if (!j.success) throw new Error(j.error || "Failed");
      toast(okMsg, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runNow(p: Plan) {
    setBusy(true);
    try {
      const res = await fetch(`/api/studio-invoices/plans/${p.id}/run`, { method: "POST" });
      const j = await readJsonSafe(res);
      if (!j.success) throw new Error(j.error || "Failed");
      const d = j.data as { number: string; sent?: boolean };
      toast(`Issued ${d.number}${d.sent ? " and emailed" : ""}`, "success");
      await load();
      onInvoiceIssued();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
      setConfirmRun(null);
    }
  }

  const active = plans.filter((p) => p.status === "ACTIVE");
  const monthlyRunRate = useMemo(() => {
    const by: Record<string, number> = {};
    for (const p of active) {
      const perMonth = p.interval === "MONTHLY" ? p.amount : p.interval === "QUARTERLY" ? p.amount / 3 : p.amount / 12;
      by[p.currency] = Math.round(((by[p.currency] || 0) + perMonth) * 100) / 100;
    }
    return by;
  }, [active]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-sm text-white font-medium">Recurring plans</p>
          <p className="text-xs text-bb-dim">Monthly, quarterly or yearly invoices issued and emailed automatically on the chosen day. The client pays each one by transfer; no payment details are stored.</p>
        </div>
        <button className={`${btnPrimary} inline-flex items-center gap-1.5`} onClick={() => setEditing("new")}><Plus size={14} /> New plan</button>
      </div>
      {active.length > 0 && (
        <p className="text-xs text-bb-dim mb-3">
          {active.length} active · about {Object.entries(monthlyRunRate).map(([c, v]) => money(v, c)).join(" + ")} per month
        </p>
      )}
      {loading ? (
        <div className="h-16 bg-bb-surface border border-bb-border rounded-lg animate-pulse" />
      ) : plans.length === 0 ? (
        <div className="text-center py-12 bg-bb-surface border border-bb-border rounded-xl">
          <Repeat size={24} className="mx-auto text-bb-dim mb-2" />
          <p className="text-bb-dim text-sm">No plans yet. Create one for each client on a monthly retainer.</p>
        </div>
      ) : (
        <div className="bg-bb-surface border border-bb-border rounded-xl divide-y divide-bb-border/60">
          {plans.map((p) => (
            <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm">
                  {p.name} <span className="text-bb-dim">· {p.client.company || p.client.name}</span>
                </p>
                <p className="text-xs text-bb-dim">
                  {money(p.amount, p.currency)} {INTERVAL_LABEL[p.interval].toLowerCase()} on day {p.dayOfMonth} · {p.status === "ACTIVE" ? `next ${shortDate(p.nextRunAt)}` : p.status.toLowerCase()} · {p.runs} issued{p.endDate ? ` · ends ${shortDate(p.endDate)}` : ""}{p.autoSend ? "" : " · issued without email"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {p.status !== "ENDED" && (
                  <button className={`${btnGhost} inline-flex items-center gap-1 py-1.5`} disabled={busy} onClick={() => setConfirmRun(p)} title="Issue this period's invoice now"><Play size={12} /> Bill now</button>
                )}
                {p.status === "ACTIVE" && <button className={`${btnGhost} py-1.5`} disabled={busy} onClick={() => patch(p, { status: "PAUSED" }, "Plan paused")} title="Pause"><Pause size={12} /></button>}
                {p.status === "PAUSED" && <button className={`${btnGhost} py-1.5`} disabled={busy} onClick={() => patch(p, { status: "ACTIVE" }, "Plan resumed")} title="Resume"><Play size={12} /></button>}
                {p.status !== "ENDED" && <button className={`${btnGhost} py-1.5 text-red-400`} disabled={busy} onClick={() => patch(p, { status: "ENDED" }, "Plan ended")} title="End plan"><Square size={12} /></button>}
                <button className={`${btnGhost} py-1.5`} onClick={() => setEditing(p)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <PlanEditor plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}

      <ConfirmDialog
        open={!!confirmRun}
        onClose={() => setConfirmRun(null)}
        onConfirm={() => confirmRun && runNow(confirmRun)}
        title={confirmRun ? `Bill "${confirmRun.name}" now?` : ""}
        message={confirmRun ? `A numbered invoice for ${money(confirmRun.amount, confirmRun.currency)} is issued${confirmRun.autoSend ? " and emailed to the client" : ""}. ${new Date(confirmRun.nextRunAt) <= new Date() ? "This covers the period that is due." : "This is an extra run; the next scheduled date stays as it is."}` : ""}
        confirmLabel="Issue invoice"
        loading={busy}
      />
    </div>
  );
}

function PlanEditor({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    clientId: plan?.clientId || "",
    name: plan?.name || "Website care plan",
    interval: plan?.interval || "MONTHLY",
    dayOfMonth: plan?.dayOfMonth || 1,
    startDate: plan?.startDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    endDate: plan?.endDate?.slice(0, 10) || "",
    template: plan?.template || "US",
    language: plan?.language || "en",
    currency: plan?.currency || "EUR",
    vatOverride: (plan?.vatOverride || "AUTO") as VatOverride,
    dueDays: plan?.dueDays ?? 14,
    items: plan?.items?.map((i) => ({ description: i.description, qty: String(i.qty), unitPrice: String(i.unitPrice) })) || [{ description: "Website care plan, {month}", qty: "1", unitPrice: "" }],
    notes: plan?.notes || "",
    autoSend: plan?.autoSend ?? true,
  });

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        const list: ClientOption[] = (d?.data || []).map((c: ClientOption) => ({ id: c.id, name: c.name, company: c.company }));
        list.sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
        setClients(list);
      })
      .catch(() => {});
  }, []);

  // Picking a client the first time: template / language / currency from their country
  useEffect(() => {
    if (plan || !f.clientId) return;
    fetch(`/api/studio-invoices/prepare?clientId=${encodeURIComponent(f.clientId)}`)
      .then(readJsonSafe)
      .then((j) => {
        if (!j.success) return;
        const p = j.data as { template: InvoiceTemplate; language: InvoiceLanguage; currency: string; dueDays: number };
        setF((prev) => ({ ...prev, template: p.template, language: p.language, currency: p.currency, dueDays: p.dueDays }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.clientId]);

  const items = f.items.map((i) => ({ description: i.description.trim(), qty: Number(i.qty), unitPrice: Number(i.unitPrice) })).filter((i) => i.description && i.qty > 0 && i.unitPrice >= 0);
  const amount = Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;

  async function save() {
    if (!f.clientId) return toast("Pick a client", "error");
    if (!items.length) return toast("Add at least one line with a price", "error");
    setSaving(true);
    try {
      const body = { ...f, items, endDate: f.endDate || null, notes: f.notes || null };
      const res = await fetch(plan ? `/api/studio-invoices/plans/${plan.id}` : "/api/studio-invoices/plans", { method: plan ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await readJsonSafe(res);
      if (!j.success) throw new Error(j.error || "Save failed");
      toast(plan ? "Plan updated" : "Plan created", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={plan ? "Edit plan" : "New recurring plan"} className="max-w-2xl">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Client</label>
            <select className={inputCls} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} disabled={!!plan}>
              <option value="">Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Plan name (internal)</label>
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Every</label>
            <div className="flex gap-1.5">
              {(["MONTHLY", "QUARTERLY", "YEARLY"] as const).map((i) => (
                <button key={i} type="button" className={chipCls(f.interval === i)} onClick={() => setF({ ...f, interval: i })}>{INTERVAL_LABEL[i]}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>On day of month (1–28)</label>
            <input type="number" min={1} max={28} className={inputCls} value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>First invoice from</label>
            <input type="date" className={inputCls} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Ends (optional)</label>
            <input type="date" className={inputCls} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Template / language</label>
            <div className="flex gap-1.5 flex-wrap">
              {(["DE", "US", "EU"] as const).map((t) => (
                <button key={t} type="button" className={chipCls(f.template === t)} onClick={() => setF({ ...f, template: t, language: t === "DE" ? "de" : "en", currency: t === "US" ? (f.currency === "EUR" ? "USD" : f.currency) : "EUR" })}>{t === "DE" ? "Germany" : t === "US" ? "Non-EU" : "EU"}</button>
              ))}
              <button type="button" className={chipCls(f.language === "de")} onClick={() => setF({ ...f, language: f.language === "de" ? "en" : "de" })}>{f.language === "de" ? "Deutsch" : "English"}</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select className={inputCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>VAT</label>
            <select className={inputCls} value={f.vatOverride} onChange={(e) => setF({ ...f, vatOverride: e.target.value as VatOverride })}>
              {VAT_OVERRIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Due in (days)</label>
            <input type="number" min={0} max={90} className={inputCls} value={f.dueDays} onChange={(e) => setF({ ...f, dueDays: Number(e.target.value) })} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Line items · write {"{month}"}, {"{period}"} or {"{year}"} to print the billing period</label>
            <button type="button" className="text-xs text-bb-orange hover:underline inline-flex items-center gap-1" onClick={() => setF({ ...f, items: [...f.items, { description: "", qty: "1", unitPrice: "" }] })}><Plus size={12} /> Add line</button>
          </div>
          <div className="space-y-2">
            {f.items.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_110px_28px] gap-2">
                <input className={inputCls} placeholder="Description" value={row.description} onChange={(e) => setF({ ...f, items: f.items.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)) })} />
                <input className={inputCls} inputMode="decimal" value={row.qty} onChange={(e) => setF({ ...f, items: f.items.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)) })} />
                <input className={inputCls} inputMode="decimal" placeholder={`Unit ${f.currency}`} value={row.unitPrice} onChange={(e) => setF({ ...f, items: f.items.map((r, j) => (j === i ? { ...r, unitPrice: e.target.value } : r)) })} />
                <button type="button" aria-label="Remove" className="p-2 text-bb-dim hover:text-red-400" onClick={() => setF({ ...f, items: f.items.length > 1 ? f.items.filter((_, j) => j !== i) : f.items })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <p className="text-sm text-white text-right mt-2">{money(amount, f.currency)} per {f.interval === "MONTHLY" ? "month" : f.interval === "QUARTERLY" ? "quarter" : "year"} (net)</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Notes (printed)</label>
            <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-bb-muted">
          <input type="checkbox" checked={f.autoSend} onChange={(e) => setF({ ...f, autoSend: e.target.checked })} /> Email each invoice to the client automatically when it is issued
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t border-bb-border">
          <button className={btnGhost} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : plan ? "Save changes" : "Create plan"}</button>
        </div>
      </div>
    </Modal>
  );
}
