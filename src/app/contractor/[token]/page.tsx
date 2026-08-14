"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { upload as vercelBlobUpload } from "@vercel/blob/client";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Clock,
  Receipt,
  Timer,
  ShieldCheck,
  Pencil,
  Camera,
  PenLine,
  Download,
} from "lucide-react";

interface ContractorInfo {
  name: string;
  company?: string | null;
  avatarUrl?: string | null;
}

interface ContractRow {
  id: string;
  token: string;
  kind: string;
  title: string;
  status: "DRAFT" | "PENDING" | "SIGNED" | "EXPIRED";
  signedName: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  providerSignedName: string | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  amount: string | number | null;
  currency: string;
  filename: string;
  status: "PENDING" | "PAID" | "DISPUTED";
  submittedAt: string;
  paidAt: string | null;
}

interface HoursClient {
  id: string;
  name: string;
}

interface TaxDocRow {
  id: string;
  type: string;
  label: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "REQUESTED" | "RECEIVED" | "SENT" | "EXPIRED" | "NA" | "ATTESTED";
  note: string | null;
  filename: string | null;
  validUntil: string | null;
  requestedAt: string;
  receivedAt: string | null;
  downloadable: boolean;
  selfHeld: boolean;
}

interface HoursRow {
  id: string;
  workDate: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  durationMinutes: number;
  clientId: string | null;
  clientName: string | null;
  description: string;
  status: "LOGGED" | "REVIEWED" | "DISPUTED";
  submittedAt: string;
  correctsId: string | null;
  correctedBy: { id: string } | null;
}

const CURRENCIES = ["USD", "EUR", "GBP", "CHF"];

function formatAmount(amount: string | number | null, currency: string) {
  if (amount === null || amount === undefined) return null;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return null;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function todayLocalDate() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const inputClass =
  "w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50";

export default function ContractorPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState("");
  const [contractor, setContractor] = useState<ContractorInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [missingDocs, setMissingDocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [tab, setTab] = useState<"invoices" | "hours" | "documents" | "contracts">("invoices");

  // Agreements to read and sign
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  // Profile photo
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Tax documents
  const [taxDocs, setTaxDocs] = useState<TaxDocRow[]>([]);
  const [docUploading, setDocUploading] = useState("");
  const [docError, setDocError] = useState("");
  const [docSuccess, setDocSuccess] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  const docTargetRef = useRef<string>("");

  // Invoice form
  const [file, setFile] = useState<File | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hours log
  const [hoursClients, setHoursClients] = useState<HoursClient[]>([]);
  const [hoursEntries, setHoursEntries] = useState<HoursRow[]>([]);
  const [attestationText, setAttestationText] = useState(
    "I certify that the hours reported in this entry are true and accurate."
  );
  const [workDate, setWorkDate] = useState(todayLocalDate());
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [hoursClientId, setHoursClientId] = useState("");
  const [hoursDescription, setHoursDescription] = useState("");
  const [attested, setAttested] = useState(false);
  const [correcting, setCorrecting] = useState<HoursRow | null>(null);
  const [hoursSubmitting, setHoursSubmitting] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const [hoursSuccess, setHoursSuccess] = useState(false);
  const hoursFormRef = useRef<HTMLDivElement>(null);

  const loadPortal = useCallback((t: string) => {
    fetch(`/api/contractor/${t}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setContractor(d.data.contractor);
          setInvoices(d.data.invoices);
          setMissingDocs(d.data.missingDocs || []);
        } else {
          setInvalid(true);
        }
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, []);

  const loadHours = useCallback((t: string) => {
    fetch(`/api/contractor/${t}/hours`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setHoursClients(d.data.clients);
          setHoursEntries(d.data.entries);
          if (d.data.attestationText) setAttestationText(d.data.attestationText);
        }
      })
      .catch(() => {});
  }, []);

  const loadDocs = useCallback((t: string) => {
    fetch(`/api/contractor/${t}/documents`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTaxDocs(d.data.documents);
      })
      .catch(() => {});
  }, []);

  const loadContracts = useCallback((t: string) => {
    fetch(`/api/contractor/${t}/contracts`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setContracts(d.data.contracts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t);
      loadPortal(t);
      loadHours(t);
      loadDocs(t);
      loadContracts(t);
    });
  }, [params, loadPortal, loadHours, loadDocs, loadContracts]);

  const handleAvatarUpload = async (f: File) => {
    if (!token || avatarUploading) return;
    setAvatarUploading(true);
    setAvatarError("");
    try {
      const ext = f.name.includes(".") ? "." + f.name.split(".").pop() : ".jpg";
      const blob = await vercelBlobUpload(`contractor-avatars/${crypto.randomUUID()}${ext}`, f, {
        access: "public",
        handleUploadUrl: "/api/contractor/upload-blob",
        clientPayload: JSON.stringify({ token }),
      });
      const res = await fetch(`/api/contractor/${token}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to save photo");
      setContractor((c) => (c ? { ...c, avatarUrl: json.data.avatarUrl } : c));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't save that photo");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAttest = async (docId: string) => {
    if (!token || docUploading) return;
    setDocUploading(docId);
    setDocError("");
    setDocSuccess(false);
    try {
      const res = await fetch(`/api/contractor/${token}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId, attest: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to confirm");
      setDocSuccess(true);
      loadDocs(token);
      loadPortal(token);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Failed, please try again");
    } finally {
      setDocUploading("");
    }
  };

  const handleDocUpload = async (docId: string, f: File) => {
    if (!token || docUploading) return;
    setDocUploading(docId);
    setDocError("");
    setDocSuccess(false);
    try {
      const ext = f.name.includes(".") ? "." + f.name.split(".").pop() : "";
      const blob = await vercelBlobUpload(`tax-documents/${crypto.randomUUID()}${ext}`, f, {
        access: "public",
        handleUploadUrl: "/api/contractor/upload-blob",
        clientPayload: JSON.stringify({ token }),
      });
      const res = await fetch(`/api/contractor/${token}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: docId,
          blobUrl: blob.url,
          filename: f.name,
          contentType: blob.contentType || f.type,
          size: f.size,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to submit document");
      setDocSuccess(true);
      loadDocs(token);
      loadPortal(token); // refreshes the invoice-tab gating

    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Upload failed, please try again");
    } finally {
      setDocUploading("");
    }
  };

  // Live duration preview; end at or before start means the session ends the next day
  const preview = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(startLocal) || !/^\d{2}:\d{2}$/.test(endLocal)) return null;
    const [sh, sm] = startLocal.split(":").map(Number);
    const [eh, em] = endLocal.split(":").map(Number);
    let minutes = eh * 60 + em - (sh * 60 + sm);
    const overnight = minutes <= 0;
    if (overnight) minutes += 24 * 60;
    return { minutes, overnight };
  }, [startLocal, endLocal]);

  const acceptFile = (f: File) => {
    setFile(f);
    setError("");
    setSuccess(false);
  };

  const handleSubmit = async () => {
    if (!file || !token || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const blobPathname = `contractor-invoices/${crypto.randomUUID()}${ext}`;
      const blob = await vercelBlobUpload(blobPathname, file, {
        access: "public",
        handleUploadUrl: "/api/contractor/upload-blob",
        clientPayload: JSON.stringify({ token }),
        onUploadProgress: ({ loaded, total }) => {
          setUploadProgress(Math.round((loaded / total) * 100));
        },
      });

      const res = await fetch(`/api/contractor/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          filename: file.name,
          contentType: blob.contentType || file.type,
          size: file.size,
          invoiceNumber: invoiceNumber.trim(),
          amount: amount.trim() ? parseFloat(amount) : null,
          currency,
          invoiceDate,
          description: description.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to submit invoice");
      }

      setFile(null);
      setInvoiceNumber("");
      setAmount("");
      setInvoiceDate("");
      setDescription("");
      setSuccess(true);
      loadPortal(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed, please try again");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const startCorrection = (entry: HoursRow) => {
    setCorrecting(entry);
    setWorkDate(entry.workDate);
    setStartLocal(entry.startLocal);
    setEndLocal(entry.endLocal);
    setHoursClientId(entry.clientId || "");
    setHoursDescription(entry.description);
    setAttested(false);
    setHoursError("");
    setHoursSuccess(false);
    hoursFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetHoursForm = () => {
    setCorrecting(null);
    setWorkDate(todayLocalDate());
    setStartLocal("");
    setEndLocal("");
    setHoursClientId("");
    setHoursDescription("");
    setAttested(false);
  };

  const handleHoursSubmit = async () => {
    if (hoursSubmitting || !token) return;
    setHoursError("");
    setHoursSuccess(false);

    if (!workDate || !startLocal || !endLocal) {
      setHoursError("Please fill in the date, start time, and end time");
      return;
    }
    if (hoursDescription.trim().length < 3) {
      setHoursError("Please describe what you worked on");
      return;
    }
    if (!attested) {
      setHoursError("Please confirm the certification checkbox before submitting");
      return;
    }

    // Browser owns the timezone math: build local Dates, send UTC instants plus
    // the literal typed values and the zone they were typed in.
    const start = new Date(`${workDate}T${startLocal}`);
    const end = new Date(`${workDate}T${endLocal}`);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);

    setHoursSubmitting(true);
    try {
      const res = await fetch(`/api/contractor/${token}/hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate,
          startLocal,
          endLocal,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          utcOffsetMinutes: start.getTimezoneOffset(),
          clientId: hoursClientId || null,
          description: hoursDescription.trim(),
          attested: true,
          ...(correcting ? { correctsId: correcting.id } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to log hours");
      }
      resetHoursForm();
      setHoursSuccess(true);
      loadHours(token);
    } catch (err) {
      setHoursError(err instanceof Error ? err.message : "Failed to log hours, please try again");
    } finally {
      setHoursSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
      </div>
    );
  }

  if (invalid || !contractor) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-400">
            This link is expired or invalid. Please contact Blok Blok Studio for a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C]">
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        {/* Header — the avatar doubles as the selfie uploader */}
        <div className="text-center mb-6 pt-8">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            title="Add a photo of yourself"
            className="group relative w-20 h-20 rounded-full mx-auto mb-4 block overflow-hidden bg-gradient-to-br from-orange-500 to-pink-500 disabled:opacity-60"
          >
            {contractor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contractor.avatarUrl}
                alt={contractor.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                {contractor.name.charAt(0)}
              </span>
            )}
            <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {avatarUploading ? (
                <Loader2 size={18} className="text-white animate-spin" />
              ) : (
                <Camera size={18} className="text-white" />
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
              if (f) handleAvatarUpload(f);
              e.target.value = "";
            }}
          />
          {avatarError && <p className="text-xs text-red-400 mb-2">{avatarError}</p>}
          {!contractor.avatarUrl && !avatarError && (
            <p className="text-[11px] text-gray-600 mb-2">Tap the circle to add a photo of yourself 👋</p>
          )}
          <h1 className="text-2xl font-bold text-white mb-1">
            {tab === "invoices"
              ? "Submit an Invoice"
              : tab === "hours"
              ? "Log Your Hours"
              : tab === "contracts"
              ? "Your Agreements"
              : "Tax Documents"}
          </h1>
          <p className="text-sm text-gray-400">
            {contractor.company || contractor.name} &middot;{" "}
            {tab === "invoices"
              ? "Upload your invoice for payment"
              : tab === "hours"
              ? "Record when you worked"
              : tab === "contracts"
              ? "Read, sign, and keep your copy"
              : "Paperwork we need on file to pay you"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-1 mb-8 p-1 bg-white/[0.03] border border-white/5 rounded-xl w-fit mx-auto flex-wrap">
          {(
            [
              { key: "invoices" as const, label: "Invoices", icon: Receipt },
              { key: "hours" as const, label: "Log Hours", icon: Timer },
              ...(contracts.length > 0
                ? [{ key: "contracts" as const, label: "Agreements", icon: PenLine }]
                : []),
              ...(taxDocs.length > 0
                ? [{ key: "documents" as const, label: "Documents", icon: FileText }]
                : []),
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "contracts" && (
          <div className="space-y-3">
            {contracts.map((c) => {
              const signed = c.status === "SIGNED";
              const expired = c.status === "EXPIRED";
              return (
                <div
                  key={c.id}
                  className="p-4 bg-white/[0.03] border border-white/5 rounded-xl flex items-start gap-3"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      signed ? "bg-green-500/10" : expired ? "bg-white/5" : "bg-orange-500/10"
                    }`}
                  >
                    {signed ? (
                      <CheckCircle size={16} className="text-green-400" />
                    ) : (
                      <PenLine size={16} className={expired ? "text-gray-600" : "text-orange-400"} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{c.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {signed
                        ? `Signed by you${c.signedAt ? ` on ${new Date(c.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}`
                        : expired
                        ? "This link has expired — ask us for a new one"
                        : `Waiting for your signature${c.expiresAt ? ` · open until ${new Date(c.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {!signed && !expired && (
                        <a
                          href={`/a/${c.token}`}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                        >
                          <PenLine size={12} /> Review &amp; sign
                        </a>
                      )}
                      {signed && (
                        <>
                          <a
                            href={`/a/${c.token}`}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs font-medium rounded-lg hover:text-white transition-colors"
                          >
                            <FileText size={12} /> View
                          </a>
                          <a
                            href={`/api/agreement/${c.token}/pdf`}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs font-medium rounded-lg hover:text-white transition-colors"
                          >
                            <Download size={12} /> PDF
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-gray-600 text-center pt-2">
              Signed agreements stay here permanently — your copy is always a click away.
            </p>
          </div>
        )}

        {tab === "invoices" && (
          <>
            {/* Onboarding gate: required paperwork before invoices can be submitted */}
            {missingDocs.length > 0 && (
              <div className="mb-6 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <p className="text-sm text-yellow-300 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Before submitting invoices, we need the following on file:{" "}
                    <span className="font-medium">{missingDocs.join(", ")}</span>. It only takes a
                    minute.
                  </span>
                </p>
                {contracts.some((c) => c.status === "PENDING") ? (
                  <button
                    type="button"
                    onClick={() => setTab("contracts")}
                    className="mt-2 ml-6 px-4 py-1.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Sign your agreement
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTab("documents")}
                    className="mt-2 ml-6 px-4 py-1.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Go to Documents
                  </button>
                )}
              </div>
            )}

            {/* Success banner */}
            {success && (
              <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle size={16} className="text-green-400 shrink-0" />
                <p className="text-sm text-green-300">
                  Invoice submitted. You&apos;ll see it marked as paid below once it&apos;s processed.
                </p>
              </div>
            )}

            {/* Drop zone / selected file (hidden while required paperwork is missing) */}
            {missingDocs.length === 0 && (!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-4 py-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                  dragOver
                    ? "border-orange-500 bg-orange-500/5 scale-[1.01]"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                }`}
              >
                <div className={`p-4 rounded-full transition-colors ${dragOver ? "bg-orange-500/10" : "bg-white/5"}`}>
                  <Upload size={28} className={dragOver ? "text-orange-400" : "text-white/40"} />
                </div>
                <div className="text-center">
                  <p className="text-white font-medium">Drag &amp; drop your invoice here</p>
                  <p className="text-xs text-gray-500 mt-1">or</p>
                  <span className="inline-block mt-2 px-5 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors">
                    Browse Files
                  </span>
                  <p className="text-xs text-gray-500 mt-3">PDF, image, Word, or Excel &middot; Up to 25MB</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                <FileText size={16} className="text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(0)} KB`
                      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                  </p>
                </div>
                <button type="button" onClick={() => setFile(null)} className="text-gray-600 hover:text-white">
                  <X size={14} />
                </button>
              </div>
            ))}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files?.[0]) acceptFile(e.target.files[0]);
                e.target.value = "";
              }}
            />

            {/* Invoice details */}
            {file && (
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Invoice number</label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="INV-001"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Invoice date</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className={`${inputClass} [color-scheme:dark]`}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Note (optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="What this invoice covers..."
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-300">{error}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={uploading}
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 relative overflow-hidden"
                >
                  {uploading ? (
                    <>
                      <div
                        className="absolute inset-0 bg-white/10 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                      <span className="relative flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Uploading... {uploadProgress}%
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Submit Invoice
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Previous submissions */}
            {invoices.length > 0 && (
              <div className="mt-10">
                <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Receipt size={15} className="text-white/40" />
                  Your submitted invoices
                </h2>
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl"
                    >
                      <FileText size={16} className="text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.filename}
                          {formatAmount(inv.amount, inv.currency) && (
                            <span className="text-gray-400"> &middot; {formatAmount(inv.amount, inv.currency)}</span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock size={9} />
                          Submitted {new Date(inv.submittedAt).toLocaleString()}
                          {inv.status === "PAID" && inv.paidAt && (
                            <> &middot; Paid {new Date(inv.paidAt).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                          inv.status === "PAID"
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : inv.status === "DISPUTED"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                        }`}
                      >
                        {inv.status === "PENDING" ? "AWAITING PAYMENT" : inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "hours" && (
          <>
            {hoursSuccess && (
              <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle size={16} className="text-green-400 shrink-0" />
                <p className="text-sm text-green-300">
                  Hours logged. Thanks for keeping your record up to date.
                </p>
              </div>
            )}

            <div ref={hoursFormRef} className="space-y-3">
              {correcting && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Pencil size={14} className="text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-300 flex-1">
                    Correcting your entry from {correcting.workDate} ({correcting.startLocal} to{" "}
                    {correcting.endLocal}). The original stays on record and will be marked as
                    corrected.
                  </p>
                  <button
                    type="button"
                    onClick={resetHoursForm}
                    className="text-blue-400 hover:text-white shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={workDate}
                    max={todayLocalDate()}
                    onChange={(e) => setWorkDate(e.target.value)}
                    className={`${inputClass} [color-scheme:dark]`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Start</label>
                  <input
                    type="time"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className={`${inputClass} [color-scheme:dark]`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">End</label>
                  <input
                    type="time"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    className={`${inputClass} [color-scheme:dark]`}
                  />
                </div>
              </div>

              {preview && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Timer size={12} className="text-orange-400" />
                  {fmtDuration(preview.minutes)}
                  {preview.overnight && <span className="text-blue-400">(ends the next day)</span>}
                  <span className="text-gray-600">
                    &middot; {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </span>
                </p>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Client / project</label>
                <select
                  value={hoursClientId}
                  onChange={(e) => setHoursClientId(e.target.value)}
                  className={`${inputClass} [color-scheme:dark]`}
                >
                  <option value="">General / internal</option>
                  {hoursClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">What did you work on?</label>
                <textarea
                  value={hoursDescription}
                  onChange={(e) => setHoursDescription(e.target.value)}
                  rows={3}
                  placeholder="Short summary of the work you did in this session..."
                  className={`${inputClass} resize-none`}
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 bg-white/[0.03] border border-white/5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                  className="mt-0.5 accent-orange-500"
                />
                <span className="text-xs text-gray-300">{attestationText}</span>
              </label>

              {hoursError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <p className="text-xs text-red-300">{hoursError}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleHoursSubmit}
                disabled={hoursSubmitting || !attested}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
              >
                {hoursSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    {correcting ? "Submit Correction" : "Log Hours"}
                  </>
                )}
              </button>
            </div>

            {/* Logged entries */}
            {hoursEntries.length > 0 && (
              <div className="mt-10">
                <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Timer size={15} className="text-white/40" />
                  Your logged hours
                </h2>
                <div className="space-y-2">
                  {hoursEntries.map((entry) => {
                    const corrected = !!entry.correctedBy;
                    return (
                      <div
                        key={entry.id}
                        className={`p-3 bg-white/[0.03] border border-white/5 rounded-xl ${
                          corrected ? "opacity-45" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Clock size={16} className="text-orange-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {entry.workDate} &middot; {entry.startLocal} to {entry.endLocal}
                              <span className="text-gray-400">
                                {" "}&middot; {fmtDuration(entry.durationMinutes)}
                              </span>
                              {entry.clientName && (
                                <span className="text-gray-400"> &middot; {entry.clientName}</span>
                              )}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">
                              {corrected
                                ? "Replaced by a correction. "
                                : entry.correctsId
                                ? "Correction. "
                                : ""}
                              Submitted {new Date(entry.submittedAt).toLocaleString()} &middot;{" "}
                              {entry.timezone}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                              corrected
                                ? "bg-white/5 text-gray-500 border border-white/10"
                                : entry.status === "REVIEWED"
                                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                : entry.status === "DISPUTED"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            }`}
                          >
                            {corrected ? "CORRECTED" : entry.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5 ml-7 line-clamp-2">
                          {entry.description}
                        </p>
                        {!corrected && (
                          <button
                            type="button"
                            onClick={() => startCorrection(entry)}
                            className="ml-7 mt-1.5 text-[10px] text-gray-500 hover:text-orange-400 flex items-center gap-1 transition-colors"
                          >
                            <Pencil size={9} />
                            Submit correction
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "documents" && (
          <>
            {docSuccess && (
              <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle size={16} className="text-green-400 shrink-0" />
                <p className="text-sm text-green-300">Document received. Thank you.</p>
              </div>
            )}
            {docError && (
              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-300">{docError}</p>
              </div>
            )}
            {/* Documents we need from them */}
            {taxDocs.some((d) => d.direction === "INBOUND") && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-white flex items-center gap-2">
                  <Upload size={15} className="text-white/40" />
                  Documents we need from you
                </h2>
                {taxDocs
                  .filter((d) => d.direction === "INBOUND")
                  .map((doc) => (
                    <div key={doc.id} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-orange-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{doc.label}</p>
                          <p className="text-[10px] text-gray-500">
                            {doc.status === "REQUESTED"
                              ? `Requested ${new Date(doc.requestedAt).toLocaleDateString()}`
                              : doc.status === "ATTESTED"
                              ? `Confirmed ${doc.receivedAt ? new Date(doc.receivedAt).toLocaleDateString() : ""}${
                                  doc.validUntil ? `, valid until ${new Date(doc.validUntil).toLocaleDateString()}` : ""
                                }`
                              : doc.receivedAt
                              ? `Received ${new Date(doc.receivedAt).toLocaleDateString()}${
                                  doc.filename ? ` (${doc.filename})` : ""
                                }${doc.validUntil ? `, valid until ${new Date(doc.validUntil).toLocaleDateString()}` : ""}`
                              : doc.status.toLowerCase()}
                          </p>
                        </div>
                        {doc.status === "REQUESTED" && doc.selfHeld ? (
                          <button
                            type="button"
                            disabled={!!docUploading}
                            onClick={() => handleAttest(doc.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                          >
                            {docUploading === doc.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle size={12} />
                            )}
                            Confirm
                          </button>
                        ) : doc.status === "REQUESTED" ? (
                          <button
                            type="button"
                            disabled={!!docUploading}
                            onClick={() => {
                              docTargetRef.current = doc.id;
                              docFileRef.current?.click();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                          >
                            {docUploading === doc.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Upload size={12} />
                            )}
                            Upload
                          </button>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                              doc.status === "RECEIVED" || doc.status === "SENT" || doc.status === "ATTESTED"
                                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                : doc.status === "EXPIRED"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-white/5 text-gray-500 border border-white/10"
                            }`}
                          >
                            {doc.status === "RECEIVED" ? "ON FILE" : doc.status === "ATTESTED" ? "CONFIRMED" : doc.status}
                          </span>
                        )}
                      </div>
                      {doc.note && doc.status === "REQUESTED" && (
                        <p className="text-xs text-gray-500 mt-1.5 ml-7">{doc.note}</p>
                      )}
                      {doc.selfHeld && doc.status === "REQUESTED" && (
                        <p className="text-[10px] text-gray-600 mt-1 ml-7">
                          Your SSN / Tax ID stays with you — Blok Blok never stores it here.
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Documents from Blok Blok */}
            {taxDocs.some((d) => d.direction === "OUTBOUND") && (
              <div className="space-y-2 mt-8">
                <h2 className="text-sm font-medium text-white flex items-center gap-2">
                  <FileText size={15} className="text-white/40" />
                  Documents from Blok Blok
                </h2>
                {taxDocs
                  .filter((d) => d.direction === "OUTBOUND")
                  .map((doc) => (
                    <div key={doc.id} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-orange-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{doc.label}</p>
                          <p className="text-[10px] text-gray-500">
                            {doc.downloadable && doc.receivedAt
                              ? `Sent ${new Date(doc.receivedAt).toLocaleDateString()}${
                                  doc.filename ? ` (${doc.filename})` : ""
                                }`
                              : "Coming soon from the Blok Blok team"}
                          </p>
                        </div>
                        {doc.downloadable ? (
                          <a
                            href={`/api/contractor/${token}/documents/${doc.id}/file`}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                          >
                            <FileText size={12} />
                            Download
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 bg-white/5 text-gray-500 border border-white/10">
                            PENDING
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <input
              ref={docFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && docTargetRef.current) handleDocUpload(docTargetRef.current, f);
                e.target.value = "";
              }}
            />
            <p className="text-[10px] text-gray-600 mt-4">
              Blank forms: the W-9 and W-8BEN are available at irs.gov. Fill one out, sign it, and upload it
              here. Files are encrypted and only the Blok Blok Studio team can access them.
            </p>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600 mt-12">
          Submissions are encrypted, timestamped, and securely stored. Only the Blok Blok Studio team can access them.
        </p>
      </div>
    </div>
  );
}
