"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";

interface ContractorInfo {
  name: string;
  company?: string | null;
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

const CURRENCIES = ["USD", "EUR", "GBP", "CHF"];

function formatAmount(amount: string | number | null, currency: string) {
  if (amount === null || amount === undefined) return null;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return null;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ContractorInvoicePortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState("");
  const [contractor, setContractor] = useState<ContractorInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

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

  const loadPortal = useCallback((t: string) => {
    fetch(`/api/contractor/${t}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setContractor(d.data.contractor);
          setInvoices(d.data.invoices);
        } else {
          setInvalid(true);
        }
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t);
      loadPortal(t);
    });
  }, [params, loadPortal]);

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
      setError(err instanceof Error ? err.message : "Upload failed — please try again");
    } finally {
      setUploading(false);
      setUploadProgress(0);
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
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Invoice Link</h1>
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
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white text-xl font-bold">
            {contractor.name.charAt(0)}
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Submit an Invoice</h1>
          <p className="text-sm text-gray-400">
            {contractor.company || contractor.name} &middot; Upload your invoice for payment
          </p>
        </div>

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
            <CheckCircle size={16} className="text-green-400 shrink-0" />
            <p className="text-sm text-green-300">
              Invoice submitted. You&apos;ll see it marked as paid below once it&apos;s processed.
            </p>
          </div>
        )}

        {/* Drop zone / selected file */}
        {!file ? (
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
        )}

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
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Invoice date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 [color-scheme:dark]"
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
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 [color-scheme:dark]"
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
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
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

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600 mt-12">
          Submissions are encrypted, timestamped, and securely stored. Only the Blok Blok Studio team can access them.
        </p>
      </div>
    </div>
  );
}
