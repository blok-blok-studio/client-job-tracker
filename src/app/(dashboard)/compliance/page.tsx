"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Landmark,
  CalendarClock,
  FileCheck2,
  Settings2,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Plus,
  Power,
  Globe,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";

interface Profile {
  id: string;
  country: string;
  label: string;
  entityType: string;
  flags: Record<string, unknown>;
  active: boolean;
}

interface Obligation {
  id: string;
  key: string;
  country: string;
  appliesTo: "SELF" | "CONTRACTOR" | "CLIENT";
  name: string;
  formName: string | null;
  description: string;
  frequency: "ANNUAL" | "QUARTERLY" | "MONTHLY" | "ONE_TIME" | "WATCH";
  dueRules: { month?: number; day: number; year?: number }[];
  earliestOpen: { month: number; day: number } | null;
  sourceUrls: string[];
  verifyWithAdvisor: boolean;
  enabled: boolean;
  profile: { id: string; label: string } | null;
}

interface TaxDoc {
  id: string;
  type: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "REQUESTED" | "RECEIVED" | "SENT" | "EXPIRED" | "NA";
  filename: string | null;
  fileUrl: string | null;
  validUntil: string | null;
  requestedAt: string;
  receivedAt: string | null;
  note: string | null;
  contractor: { id: string; name: string; country: string | null } | null;
  client: { id: string; name: string; country: string | null } | null;
}

interface Person {
  id: string;
  name: string;
  company: string | null;
  country: string | null;
  additionalCountries: string[];
}

const COUNTRIES: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "DE", label: "Germany" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "CH", label: "Switzerland" },
  { code: "AT", label: "Austria" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "ES", label: "Spain" },
  { code: "MX", label: "Mexico" },
];

const APPLIES_LABELS: Record<Obligation["appliesTo"], string> = {
  SELF: "Own filing",
  CONTRACTOR: "Contractors",
  CLIENT: "Clients",
};

const DOC_STATUS_VARIANT: Record<TaxDoc["status"], "green" | "yellow" | "red" | "gray"> = {
  REQUESTED: "yellow",
  RECEIVED: "green",
  SENT: "green",
  EXPIRED: "red",
  NA: "gray",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirror of the server engine's next-due logic, for display
function nextDue(o: Obligation): Date | null {
  if (o.frequency === "WATCH" || !Array.isArray(o.dueRules)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates: Date[] = [];
  for (const r of o.dueRules) {
    if (!r || typeof r.day !== "number") continue;
    if (r.year) candidates.push(new Date(r.year, (r.month || 1) - 1, r.day));
    else if (r.month === undefined) {
      const m = new Date(today.getFullYear(), today.getMonth(), r.day);
      candidates.push(m >= today ? m : new Date(today.getFullYear(), today.getMonth() + 1, r.day));
    } else {
      const y = new Date(today.getFullYear(), r.month - 1, r.day);
      candidates.push(y >= today ? y : new Date(today.getFullYear() + 1, r.month - 1, r.day));
    }
  }
  const roll = (d: Date) => {
    if (d.getDay() === 6) return new Date(d.getTime() + 2 * DAY_MS);
    if (d.getDay() === 0) return new Date(d.getTime() + DAY_MS);
    return d;
  };
  const upcoming = candidates.map(roll).filter((d) => d >= today).sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] || null;
}

function daysUntil(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

function dateStr(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CompliancePage() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"deadlines" | "documents" | "settings">("deadlines");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [documents, setDocuments] = useState<TaxDoc[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [clients, setClients] = useState<Person[]>([]);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [unseededCountries, setUnseededCountries] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addDoc, setAddDoc] = useState({ person: "", type: "", direction: "INBOUND" as "INBOUND" | "OUTBOUND" });
  const [countryDrafts, setCountryDrafts] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance");
      const json = await res.json();
      if (json.success) {
        setProfiles(json.data.profiles);
        setObligations(json.data.obligations);
        setDocuments(json.data.documents);
        setContractors(json.data.contractors);
        setClients(json.data.clients);
        setRemindersEnabled(json.data.remindersEnabled);
        setIsOwner(json.data.isOwner);
        setUnseededCountries(json.data.unseededCountries);
      }
    } catch {
      // API unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Obligation[]>();
    for (const o of obligations) {
      const key = o.profile?.label || `${o.country} — general`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const da = nextDue(a);
        const db = nextDue(b);
        if (!da && !db) return a.name.localeCompare(b.name);
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
    }
    return [...groups.entries()];
  }, [obligations]);

  const docStats = useMemo(() => {
    const active = documents.filter((d) => d.status !== "NA");
    const now = Date.now();
    return {
      awaiting: active.filter((d) => d.status === "REQUESTED").length,
      received: active.filter((d) => d.status === "RECEIVED" || d.status === "SENT").length,
      expiring: active.filter(
        (d) => d.validUntil && new Date(d.validUntil).getTime() < now + 90 * DAY_MS && d.status === "RECEIVED"
      ).length,
      noCountry: [...contractors, ...clients].filter((p) => !p.country).length,
    };
  }, [documents, contractors, clients]);

  async function patchObligation(id: string, payload: Record<string, unknown>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/compliance/obligations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast(okMessage, "success");
        await fetchAll();
      } else {
        toast(json?.error || "Update failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchDocument(id: string, payload: Record<string, unknown>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/compliance/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast(okMessage, "success");
        await fetchAll();
      } else {
        toast(json?.error || "Update failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function setCountry(kind: "contractor" | "client", id: string, country: string) {
    if (busy || !country) return;
    setBusy(true);
    try {
      const res = await fetch("/api/compliance/set-country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, country }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast(
          json.data.docsCreated
            ? `Country set — ${json.data.docsCreated} document requirement${json.data.docsCreated === 1 ? "" : "s"} created`
            : "Country set",
          "success"
        );
        await fetchAll();
      } else {
        toast(json?.error || "Failed to set country", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleReminders() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/compliance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindersEnabled: !remindersEnabled }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRemindersEnabled(json.data.remindersEnabled);
        toast(json.data.remindersEnabled ? "Slack reminders ON" : "Slack reminders off", "success");
      } else {
        toast(json?.error || "Failed to toggle", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetCatalog() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/compliance/obligations/reset", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        toast("Catalog reset to source", "success");
        await fetchAll();
      } else {
        toast(json?.error || "Reset failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddDoc() {
    if (busy || !addDoc.person || !addDoc.type.trim()) return;
    const [kind, id] = addDoc.person.split(":");
    setBusy(true);
    try {
      const res = await fetch("/api/compliance/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(kind === "contractor" ? { contractorId: id } : { clientId: id }),
          type: addDoc.type.trim(),
          direction: addDoc.direction,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast("Document requirement added", "success");
        setShowAddDoc(false);
        setAddDoc({ person: "", type: "", direction: "INBOUND" });
        await fetchAll();
      } else {
        toast(json?.error || "Failed to add", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  const countdownTone = (days: number) =>
    days <= 10 ? "text-red-400" : days <= 30 ? "text-yellow-400" : days <= 90 ? "text-bb-orange" : "text-bb-muted";

  return (
    <div>
      <TopBar
        title="Compliance"
        subtitle="Tax deadlines, form tracking, and escalating reminders — informational, not tax advice"
      />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 w-fit">
          {(
            [
              { key: "deadlines", label: "Deadlines", icon: CalendarClock },
              { key: "documents", label: "Documents", icon: FileCheck2 },
              { key: "settings", label: "Settings", icon: Settings2 },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                tab === t.key ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {!remindersEnabled && !loading && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg text-xs text-yellow-300">
            <Power size={13} className="shrink-0" />
            Slack reminders are OFF — deadlines are tracked but nothing posts until the master switch is
            flipped in Settings{isOwner ? "" : " (owner only)"}.
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-bb-dim">Loading compliance data…</div>
        ) : tab === "deadlines" ? (
          <div className="space-y-4 pb-8">
            {grouped.map(([groupLabel, list]) => (
              <div key={groupLabel} className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Landmark size={15} className="text-bb-orange" />
                  {groupLabel}
                </h2>
                <div className="space-y-2">
                  {list.map((o) => {
                    const due = nextDue(o);
                    const days = due ? daysUntil(due) : null;
                    const open = expanded === o.id;
                    return (
                      <div
                        key={o.id}
                        className={cn(
                          "bg-bb-black border border-bb-border rounded-lg",
                          !o.enabled && "opacity-50"
                        )}
                      >
                        <button
                          onClick={() => setExpanded(open ? null : o.id)}
                          className="w-full flex items-center gap-3 p-3 text-left"
                        >
                          {open ? (
                            <ChevronDown size={14} className="text-bb-dim shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-bb-dim shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {o.name}
                              {o.formName && <span className="text-bb-muted"> &middot; {o.formName}</span>}
                            </p>
                            <p className="text-[11px] text-bb-dim">
                              {o.country} &middot; {APPLIES_LABELS[o.appliesTo]} &middot;{" "}
                              {o.frequency.toLowerCase().replace("_", " ")}
                              {o.verifyWithAdvisor && (
                                <span className="text-yellow-400/80"> &middot; verify with advisor</span>
                              )}
                            </p>
                          </div>
                          {due && days !== null ? (
                            <div className="text-right shrink-0">
                              <p className={cn("text-sm font-medium", countdownTone(days))}>
                                {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}
                              </p>
                              <p className="text-[10px] text-bb-dim">{dateStr(due)}</p>
                            </div>
                          ) : (
                            <Badge variant="gray">{o.frequency === "WATCH" ? "WATCH" : "—"}</Badge>
                          )}
                        </button>
                        {open && (
                          <div className="px-3 pb-3 pt-0 space-y-2 ml-7">
                            <p className="text-xs text-bb-muted whitespace-pre-wrap">{o.description}</p>
                            {o.sourceUrls.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {o.sourceUrls.map((u) => (
                                  <a
                                    key={u}
                                    href={u}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[10px] text-bb-dim hover:text-bb-orange transition-colors"
                                  >
                                    <ExternalLink size={9} />
                                    {new URL(u).hostname}
                                  </a>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() =>
                                patchObligation(
                                  o.id,
                                  { enabled: !o.enabled },
                                  o.enabled ? "Obligation disabled" : "Obligation enabled"
                                )
                              }
                              disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors disabled:opacity-50"
                            >
                              <Power size={11} />
                              {o.enabled ? "Disable reminders for this" : "Enable reminders for this"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : tab === "documents" ? (
          <div className="space-y-4 pb-8">
            {/* Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Awaiting Documents", value: docStats.awaiting, icon: FileCheck2 },
                { label: "On File", value: docStats.received, icon: ShieldCheck },
                { label: "Expiring in 90 Days", value: docStats.expiring, icon: AlertTriangle },
                { label: "People Without Country", value: docStats.noCountry, icon: Globe },
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

            {/* People without a tax country */}
            {docStats.noCountry > 0 && (
              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Globe size={15} className="text-bb-orange" />
                  Set tax countries
                </h2>
                <div className="space-y-2">
                  {([
                    ...contractors.filter((p) => !p.country).map((p) => ({ ...p, kind: "contractor" as const })),
                    ...clients.filter((p) => !p.country).map((p) => ({ ...p, kind: "client" as const })),
                  ]).map((p) => (
                    <div key={`${p.kind}-${p.id}`} className="flex items-center gap-3">
                      <p className="flex-1 text-xs text-white truncate">
                        {p.name}
                        <span className="text-bb-dim"> &middot; {p.kind}</span>
                      </p>
                      <select
                        value={countryDrafts[`${p.kind}-${p.id}`] || ""}
                        onChange={(e) =>
                          setCountryDrafts((prev) => ({ ...prev, [`${p.kind}-${p.id}`]: e.target.value }))
                        }
                        className="px-2 py-1.5 bg-bb-black border border-bb-border rounded-md text-white text-xs focus:outline-none [color-scheme:dark]"
                      >
                        <option value="">Country…</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setCountry(p.kind, p.id, countryDrafts[`${p.kind}-${p.id}`] || "")}
                        disabled={busy || !countryDrafts[`${p.kind}-${p.id}`]}
                        className="px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document list */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileCheck2 size={15} className="text-bb-orange" />
                  Tracked documents
                </h2>
                <button
                  onClick={() => setShowAddDoc(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors"
                >
                  <Plus size={14} />
                  Add Document
                </button>
              </div>
              {documents.length === 0 ? (
                <p className="text-xs text-bb-dim py-2">
                  Nothing tracked yet. Set countries above (or on the Contractors page) and the required
                  documents appear here automatically.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => {
                    const who = d.contractor || d.client;
                    const kind = d.contractor ? "contractor" : "client";
                    return (
                      <div key={d.id} className="flex items-center gap-3 p-3 bg-bb-black border border-bb-border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">
                            {d.type}
                            <span className="text-bb-muted"> &middot; {who?.name || "Unknown"}</span>
                            <span className="text-bb-dim text-[11px]"> ({kind}, {d.direction.toLowerCase()})</span>
                          </p>
                          <p className="text-[11px] text-bb-dim">
                            Requested {dateStr(d.requestedAt)}
                            {d.receivedAt && <> &middot; Received {dateStr(d.receivedAt)}</>}
                            {d.validUntil && <> &middot; Valid until {dateStr(d.validUntil)}</>}
                            {d.note && <> &middot; {d.note}</>}
                          </p>
                        </div>
                        {d.fileUrl && (
                          <a
                            href={`/api/compliance/documents/${d.id}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-bb-dim hover:text-bb-orange transition-colors"
                            title="View file (decrypted on the fly; logged)"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        {d.status === "REQUESTED" && (
                          <button
                            onClick={() =>
                              patchDocument(
                                d.id,
                                { status: d.direction === "OUTBOUND" ? "SENT" : "RECEIVED" },
                                d.direction === "OUTBOUND" ? "Marked as sent" : "Marked as received"
                              )
                            }
                            disabled={busy}
                            className="px-2.5 py-1 text-[11px] rounded-md border border-bb-border text-bb-muted hover:text-white transition-colors disabled:opacity-50"
                          >
                            Mark {d.direction === "OUTBOUND" ? "sent" : "received"}
                          </button>
                        )}
                        {d.status !== "NA" && (
                          <button
                            onClick={() => patchDocument(d.id, { status: "NA" }, "Requirement retired")}
                            disabled={busy}
                            className="px-2.5 py-1 text-[11px] rounded-md border border-bb-border text-bb-dim hover:text-white transition-colors disabled:opacity-50"
                            title="Not applicable — retires the requirement (records are never deleted)"
                          >
                            N/A
                          </button>
                        )}
                        <Badge variant={DOC_STATUS_VARIANT[d.status]}>{d.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-8">
            {/* Master switch */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Power size={15} className="text-bb-orange" />
                Slack reminders
              </h2>
              <p className="text-xs text-bb-muted">
                Escalating reminders post to Slack as each deadline gets closer: when submission opens, then
                9 months, 6 months, 3 months, 60, 30, 10, and 5 days out. Weekly document chasers cover
                missing W-9s / W-8BENs and upcoming expirations.
              </p>
              <button
                onClick={toggleReminders}
                disabled={busy || !isOwner}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50",
                  remindersEnabled
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "border border-bb-border text-bb-muted hover:text-white"
                )}
              >
                <Power size={12} />
                {remindersEnabled ? "Reminders are ON — click to turn off" : "Turn reminders ON"}
              </button>
              {!isOwner && <p className="text-[10px] text-bb-dim">Owner only.</p>}
            </div>

            {/* Profiles */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Landmark size={15} className="text-bb-orange" />
                Business profiles
              </h2>
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-bb-black border border-bb-border rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-white">{p.label}</p>
                    <p className="text-[11px] text-bb-dim">
                      {p.country} &middot; {p.entityType}
                      {Object.entries(p.flags || {}).map(([k, v]) => (
                        <span key={k}> &middot; {k}: {String(v)}</span>
                      ))}
                    </p>
                  </div>
                  <Badge variant={p.active ? "green" : "gray"}>{p.active ? "ACTIVE" : "OFF"}</Badge>
                </div>
              ))}
            </div>

            {/* Catalog maintenance */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <RotateCcw size={15} className="text-bb-orange" />
                Catalog
              </h2>
              <p className="text-xs text-bb-muted">
                Deadlines were researched August 2026 (sources on each entry). Reset restores every entry to
                the shipped copy, discarding in-app edits.
              </p>
              {unseededCountries.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg text-xs text-yellow-300">
                  <AlertTriangle size={13} className="shrink-0" />
                  Countries in use without seeded requirements: {unseededCountries.join(", ")} — requirements
                  for these need research before anything is tracked automatically.
                </div>
              )}
              <button
                onClick={resetCatalog}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-bb-border text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Reset catalog to source
              </button>
            </div>

            <p className="text-[10px] text-bb-dim">
              This page tracks deadlines and paperwork; it is not tax advice. Entries marked &ldquo;verify
              with advisor&rdquo; should be confirmed with the CPA / Steuerberater before relying on them.
            </p>
          </div>
        )}
      </div>

      {/* Add document modal */}
      <Modal open={showAddDoc} onClose={() => setShowAddDoc(false)} title="Add Document Requirement">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-bb-muted mb-1">Person</label>
            <select
              value={addDoc.person}
              onChange={(e) => setAddDoc((p) => ({ ...p, person: e.target.value }))}
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none [color-scheme:dark]"
            >
              <option value="">Select…</option>
              <optgroup label="Contractors">
                {contractors.map((c) => (
                  <option key={c.id} value={`contractor:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Clients">
                {clients.map((c) => (
                  <option key={c.id} value={`client:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-bb-muted mb-1">Type</label>
              <input
                type="text"
                value={addDoc.type}
                onChange={(e) => setAddDoc((p) => ({ ...p, type: e.target.value }))}
                placeholder="W9, W8BEN, CONTRACT..."
                className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-bb-muted mb-1">Direction</label>
              <select
                value={addDoc.direction}
                onChange={(e) => setAddDoc((p) => ({ ...p, direction: e.target.value as "INBOUND" | "OUTBOUND" }))}
                className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none [color-scheme:dark]"
              >
                <option value="INBOUND">They provide it</option>
                <option value="OUTBOUND">We provide it</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddDoc(false)}
              className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDoc}
              disabled={!addDoc.person || !addDoc.type.trim() || busy}
              className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
