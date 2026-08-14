"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { upload as vercelBlobUpload } from "@vercel/blob/client";
import {
  ArrowLeft,
  Camera,
  Check,
  Clock,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Save,
  Sparkles,
  Timer,
  Users,
  Wallet,
  FileSignature,
  ShieldCheck,
  AlertTriangle,
  Globe,
  Cake,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import ContractsView, { type ContractorOption } from "@/components/contractors/ContractsView";
import ContractorAvatar, { avatarGradient } from "@/components/contractors/ContractorAvatar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string;
  status: "PENDING" | "PAID" | "DISPUTED";
  submittedAt: string;
  paidAt: string | null;
  filename: string;
}

interface HoursRow {
  id: string;
  durationMinutes: number;
  workDate: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  clientName: string | null;
  description: string;
  status: "LOGGED" | "REVIEWED" | "DISPUTED";
  startAt: string;
  correctedBy: { id: string } | null;
}

interface DocRow {
  id: string;
  type: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "REQUESTED" | "RECEIVED" | "SENT" | "EXPIRED" | "NA" | "ATTESTED";
  validUntil: string | null;
}

interface ContractSummary {
  id: string;
  token: string;
  kind: string;
  title: string;
  status: "DRAFT" | "PENDING" | "SIGNED" | "EXPIRED";
  signedAt: string | null;
}

interface Contractor {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  uploadToken: string;
  country: string | null;
  avatarUrl: string | null;
  role: string | null;
  skills: string[];
  accentColor: string | null;
  emoji: string | null;
  bio: string | null;
  funFact: string | null;
  location: string | null;
  timezone: string | null;
  startedAt: string | null;
  links: Record<string, string> | null;
  createdAt: string;
  agreementSignedAt: string | null;
  invoices: InvoiceRow[];
  hoursEntries: HoursRow[];
  clientAssignments: { id: string; client: { id: string; name: string } }[];
  taxDocuments: DocRow[];
  contracts: ContractSummary[];
}

const ACCENTS = ["#f97316", "#ec4899", "#8b5cf6", "#3b82f6", "#06b6d4", "#22c55e", "#eab308", "#ef4444"];
const EMOJI_CHOICES = ["🎬", "✂️", "🎨", "💻", "📸", "🎧", "✍️", "🚀", "🧠", "🛠️", "📈", "☕️"];

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

function money(amount: string | null, currency: string) {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n)) return null;
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tenure(from: string | null): string | null {
  if (!from) return null;
  const start = new Date(from);
  const months = Math.max(
    0,
    (new Date().getFullYear() - start.getFullYear()) * 12 + (new Date().getMonth() - start.getMonth())
  );
  if (months < 1) return "New this month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} in`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} year${years === 1 ? "" : "s"}${rest ? ` ${rest}m` : ""} in`;
}

const DOC_LABELS: Record<string, string> = {
  CONTRACTOR_AGREEMENT: "Signed contractor agreement",
  COUNTERSIGNED_AGREEMENT: "Their countersigned copy",
  COMPANY_INFO: "Our billing details",
  W9: "Form W-9",
  W8BEN: "Form W-8BEN",
  "1099_NEC_COPY": "1099-NEC copy",
};

export default function ContractorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [skillDraft, setSkillDraft] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [edit, setEdit] = useState({
    role: "",
    bio: "",
    funFact: "",
    location: "",
    startedAt: "",
    accentColor: "",
    emoji: "",
    skills: [] as string[],
  });
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contractors/${id}`);
      const json = await res.json();
      if (!json.success) {
        toast(json.error || "Contractor not found", "error");
        router.replace("/contractors");
        return;
      }
      const c: Contractor = json.data;
      setContractor(c);
      setEdit({
        role: c.role || "",
        bio: c.bio || "",
        funFact: c.funFact || "",
        location: c.location || "",
        startedAt: c.startedAt ? c.startedAt.slice(0, 10) : "",
        accentColor: c.accentColor || "",
        emoji: c.emoji || "",
        skills: c.skills || [],
      });
      setDirty(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!contractor) return null;
    const live = contractor.hoursEntries.filter((h) => !h.correctedBy);
    const now = new Date();
    const monthMinutes = live
      .filter((h) => {
        const d = new Date(h.startAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, h) => s + h.durationMinutes, 0);
    const totalMinutes = live.reduce((s, h) => s + h.durationMinutes, 0);
    const pending = contractor.invoices.filter((i) => i.status === "PENDING");
    const paidThisYear = contractor.invoices
      .filter((i) => i.status === "PAID" && i.paidAt && new Date(i.paidAt).getFullYear() === now.getFullYear())
      .reduce((s, i) => s + (parseFloat(i.amount || "0") || 0), 0);
    const signedAgreements = contractor.contracts.filter((c) => c.status === "SIGNED").length;
    const awaiting = contractor.contracts.filter((c) => c.status === "PENDING").length;
    const missingDocs = contractor.taxDocuments.filter(
      (d) => d.direction === "INBOUND" && d.status === "REQUESTED"
    );
    return { monthMinutes, totalMinutes, pending, paidThisYear, signedAgreements, awaiting, missingDocs };
  }, [contractor]);

  async function save(payload: Record<string, unknown>, okMessage = "Saved") {
    if (!contractor || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contractors/${contractor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to save");
      toast(okMessage, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(file: File) {
    if (!contractor || avatarUploading) return;
    setAvatarUploading(true);
    try {
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : ".jpg";
      const blob = await vercelBlobUpload(`contractor-avatars/${crypto.randomUUID()}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/contractors/avatar-blob",
      });
      await save({ avatarUrl: blob.url }, "Photo updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function copyPortalLink() {
    if (!contractor) return;
    await navigator.clipboard.writeText(`${window.location.origin}/i/${contractor.uploadToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast("Portal link copied", "success");
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Contractor" />
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-bb-orange" size={28} />
        </div>
      </div>
    );
  }

  if (!contractor || !stats) return null;

  const accent = edit.accentColor || contractor.accentColor;
  // No accent picked yet: reuse their avatar's generated gradient at low alpha
  const headerBackground = accent
    ? `linear-gradient(135deg, ${accent}33, transparent 65%)`
    : avatarGradient(contractor.name).replace(/#([0-9a-f]{6})/gi, "#$133");

  const contractorOption: ContractorOption = {
    id: contractor.id,
    name: contractor.name,
    company: contractor.company,
    email: contractor.email,
    country: contractor.country,
    location: contractor.location,
    avatarUrl: contractor.avatarUrl,
    accentColor: contractor.accentColor,
    isActive: contractor.isActive,
  };

  const inputClass =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <div>
      <TopBar title={contractor.name} subtitle={contractor.role || "Contractor profile"} />

      <div className="px-4 lg:px-6 space-y-4 pb-10">
        <button
          onClick={() => router.push("/contractors")}
          className="flex items-center gap-1.5 text-xs text-bb-dim hover:text-white transition-colors"
        >
          <ArrowLeft size={13} /> All contractors
        </button>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div
          className="rounded-xl border border-bb-border overflow-hidden"
          style={{ background: headerBackground, backgroundColor: "#141414" }}
        >
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-start bg-bb-surface/60">
            <div className="relative">
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                title="Change photo"
                className="group relative block rounded-full overflow-hidden"
              >
                <ContractorAvatar
                  contractor={{ ...contractor, accentColor: accent, emoji: edit.emoji || contractor.emoji }}
                  size={96}
                  ring
                />
                <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                  {avatarUploading ? (
                    <Loader2 size={20} className="text-white animate-spin" />
                  ) : (
                    <Camera size={20} className="text-white" />
                  )}
                </span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatar(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                    {contractor.name}
                    {(edit.emoji || contractor.emoji) && <span>{edit.emoji || contractor.emoji}</span>}
                  </h1>
                  <p className="text-sm text-bb-muted">
                    {contractor.role || "No role set"}
                    {contractor.company ? ` · ${contractor.company}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 ml-auto">
                  {!contractor.isActive && <Badge variant="gray">INACTIVE</Badge>}
                  {stats.signedAgreements > 0 ? (
                    <Badge variant="green">AGREEMENT ON FILE</Badge>
                  ) : (
                    <Badge variant="yellow">NO SIGNED AGREEMENT</Badge>
                  )}
                  {tenure(contractor.startedAt || contractor.createdAt) && (
                    <Badge variant="orange">{tenure(contractor.startedAt || contractor.createdAt)}</Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-bb-muted">
                {contractor.email && (
                  <a href={`mailto:${contractor.email}`} className="flex items-center gap-1.5 hover:text-white">
                    <Mail size={12} /> {contractor.email}
                  </a>
                )}
                {contractor.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={12} /> {contractor.phone}
                  </span>
                )}
                {contractor.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} /> {contractor.location}
                  </span>
                )}
                {contractor.country && (
                  <span className="flex items-center gap-1.5">
                    <Globe size={12} /> {contractor.country}
                  </span>
                )}
                <button onClick={copyPortalLink} className="flex items-center gap-1.5 hover:text-bb-orange">
                  {copied ? <Check size={12} className="text-green-400" /> : <Link2 size={12} />}
                  Copy portal link
                </button>
              </div>

              {contractor.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contractor.skills.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded-md text-[11px] text-white/90 border"
                      style={{
                        borderColor: `${accent || "#f97316"}55`,
                        background: `${accent || "#f97316"}18`,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {contractor.bio && <p className="text-sm text-bb-muted leading-relaxed">{contractor.bio}</p>}
              {contractor.funFact && (
                <p className="text-xs text-bb-dim flex items-center gap-1.5">
                  <Sparkles size={12} className="text-bb-orange" /> {contractor.funFact}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Stat tiles ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Hours This Month", value: fmtDuration(stats.monthMinutes), icon: Timer },
            { label: "Hours All Time", value: fmtDuration(stats.totalMinutes), icon: Clock },
            { label: "Pending Invoices", value: stats.pending.length, icon: Receipt },
            {
              label: "Paid This Year",
              value: `$${stats.paidThisYear.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              icon: Wallet,
            },
            { label: "Signed Agreements", value: stats.signedAgreements, icon: FileSignature },
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

        {(stats.missingDocs.length > 0 || stats.awaiting > 0) && (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200/90">
              {stats.missingDocs.length > 0 && (
                <p>
                  Paperwork still open:{" "}
                  <span className="font-medium">
                    {stats.missingDocs.map((d) => DOC_LABELS[d.type] || d.type).join(", ")}
                  </span>
                  . Invoices stay blocked until the agreement and tax form are on file.
                </p>
              )}
              {stats.awaiting > 0 && <p className="mt-1">{stats.awaiting} agreement waiting on their signature.</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Left: editable profile ───────────────────────── */}
          <div className="space-y-4">
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white">Profile</h2>

              <div>
                <label className="block text-xs text-bb-muted mb-1">Role</label>
                <input
                  type="text"
                  value={edit.role}
                  onChange={(e) => {
                    setEdit({ ...edit, role: e.target.value });
                    setDirty(true);
                  }}
                  placeholder="Video Editor"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1">Where they are</label>
                <input
                  type="text"
                  value={edit.location}
                  onChange={(e) => {
                    setEdit({ ...edit, location: e.target.value });
                    setDirty(true);
                  }}
                  placeholder="Berlin, Germany"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1 flex items-center gap-1.5">
                  <Cake size={11} /> Started with us
                </label>
                <input
                  type="date"
                  value={edit.startedAt}
                  onChange={(e) => {
                    setEdit({ ...edit, startedAt: e.target.value });
                    setDirty(true);
                  }}
                  className={cn(inputClass, "[color-scheme:dark]")}
                />
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1">Short bio</label>
                <textarea
                  value={edit.bio}
                  onChange={(e) => {
                    setEdit({ ...edit, bio: e.target.value });
                    setDirty(true);
                  }}
                  rows={3}
                  placeholder="What they're great at, how you work together…"
                  className={cn(inputClass, "resize-y")}
                />
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1">Fun fact</label>
                <input
                  type="text"
                  value={edit.funFact}
                  onChange={(e) => {
                    setEdit({ ...edit, funFact: e.target.value });
                    setDirty(true);
                  }}
                  placeholder="Edits everything to drum & bass"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1.5">Skills</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {edit.skills.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setEdit({ ...edit, skills: edit.skills.filter((x) => x !== s) });
                        setDirty(true);
                      }}
                      className="px-2 py-0.5 rounded-md text-[11px] bg-bb-black border border-bb-border text-bb-muted hover:text-red-400 hover:border-red-400/40 transition-colors"
                      title="Remove"
                    >
                      {s} ×
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && skillDraft.trim()) {
                      e.preventDefault();
                      const s = skillDraft.trim();
                      if (!edit.skills.includes(s) && edit.skills.length < 20) {
                        setEdit({ ...edit, skills: [...edit.skills, s] });
                        setDirty(true);
                      }
                      setSkillDraft("");
                    }
                  }}
                  placeholder="Add a skill, press Enter"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1.5">Accent colour</label>
                <div className="flex gap-2 flex-wrap">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setEdit({ ...edit, accentColor: c });
                        setDirty(true);
                      }}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                        (edit.accentColor || contractor.accentColor) === c
                          ? "border-white"
                          : "border-transparent"
                      )}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-bb-muted mb-1.5">Their emoji</label>
                <div className="flex gap-1.5 flex-wrap">
                  {EMOJI_CHOICES.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setEdit({ ...edit, emoji: edit.emoji === e ? "" : e });
                        setDirty(true);
                      }}
                      className={cn(
                        "w-8 h-8 rounded-lg border text-base transition-colors",
                        (edit.emoji || contractor.emoji) === e
                          ? "border-bb-orange bg-bb-orange/10"
                          : "border-bb-border bg-bb-black hover:border-bb-border/80"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() =>
                  save(
                    {
                      role: edit.role,
                      bio: edit.bio,
                      funFact: edit.funFact,
                      location: edit.location,
                      startedAt: edit.startedAt || null,
                      accentColor: edit.accentColor || null,
                      emoji: edit.emoji || null,
                      skills: edit.skills,
                    },
                    "Profile saved"
                  )
                }
                disabled={saving || !dirty}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save profile
              </button>
            </div>

            {/* Assigned clients */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Users size={15} className="text-bb-orange" />
                Assigned clients
              </h2>
              {contractor.clientAssignments.length === 0 ? (
                <p className="text-xs text-bb-dim">
                  No clients assigned — they can still log general / internal hours.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contractor.clientAssignments.map((a) => (
                    <a
                      key={a.id}
                      href={`/clients/${a.client.id}`}
                      className="px-2.5 py-1 rounded-md text-xs bg-bb-black border border-bb-border text-bb-muted hover:text-white hover:border-bb-orange/50 transition-colors"
                    >
                      {a.client.name}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Compliance */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <ShieldCheck size={15} className="text-bb-orange" />
                Paperwork
              </h2>
              <div className="space-y-1.5">
                {contractor.taxDocuments.length === 0 ? (
                  <p className="text-xs text-bb-dim">No document requirements on file.</p>
                ) : (
                  contractor.taxDocuments.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-bb-muted truncate">{DOC_LABELS[d.type] || d.type}</span>
                      <Badge
                        variant={
                          d.status === "RECEIVED" || d.status === "ATTESTED" || d.status === "SENT"
                            ? "green"
                            : d.status === "REQUESTED"
                            ? "yellow"
                            : "gray"
                        }
                      >
                        {d.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
              <a
                href="/compliance"
                className="inline-block mt-3 text-[11px] text-bb-dim hover:text-bb-orange transition-colors"
              >
                Manage in Compliance →
              </a>
            </div>
          </div>

          {/* ── Right: agreements, invoices, hours ───────────── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <FileSignature size={15} className="text-bb-orange" />
                Agreements
              </h2>
              <ContractsView
                contractors={[contractorOption]}
                search=""
                presetContractorId={contractor.id}
                compact
                onChanged={load}
              />
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Receipt size={15} className="text-bb-orange" />
                Recent invoices
              </h2>
              {contractor.invoices.length === 0 ? (
                <p className="text-xs text-bb-dim">Nothing submitted yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {contractor.invoices.slice(0, 8).map((inv) => (
                    <a
                      key={inv.id}
                      href={`/contractors?invoice=${inv.id}`}
                      className="flex items-center gap-3 p-2 rounded-md bg-bb-black border border-bb-border hover:border-bb-orange/50 transition-colors"
                    >
                      <span className="text-xs text-white flex-1 truncate">
                        {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.filename}
                        {money(inv.amount, inv.currency) && (
                          <span className="text-bb-muted"> · {money(inv.amount, inv.currency)}</span>
                        )}
                      </span>
                      <span className="text-[10px] text-bb-dim">
                        {new Date(inv.submittedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <Badge
                        variant={
                          inv.status === "PAID" ? "green" : inv.status === "PENDING" ? "yellow" : "red"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Timer size={15} className="text-bb-orange" />
                Recent hours
              </h2>
              {contractor.hoursEntries.length === 0 ? (
                <p className="text-xs text-bb-dim">No hours logged yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {contractor.hoursEntries.slice(0, 8).map((h) => (
                    <a
                      key={h.id}
                      href={`/contractors?hours=${h.id}`}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md bg-bb-black border border-bb-border hover:border-bb-orange/50 transition-colors",
                        h.correctedBy && "opacity-50"
                      )}
                    >
                      <span className="text-xs text-white flex-1 truncate">
                        {fmtDuration(h.durationMinutes)}
                        <span className="text-bb-muted">
                          {" "}
                          · {h.workDate} {h.startLocal}–{h.endLocal} · {h.clientName || "General"}
                        </span>
                      </span>
                      <Badge
                        variant={
                          h.correctedBy
                            ? "gray"
                            : h.status === "REVIEWED"
                            ? "green"
                            : h.status === "DISPUTED"
                            ? "red"
                            : "yellow"
                        }
                      >
                        {h.correctedBy ? "CORRECTED" : h.status}
                      </Badge>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
