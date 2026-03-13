"use client";

import { useState, useRef } from "react";
import Modal from "@/components/shared/Modal";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";

interface BulkResult {
  row: number;
  status: "created" | "error";
  error?: string;
  postId?: string;
}

export default function BulkImportModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    imported: number;
    errors: number;
    total: number;
    results: BulkResult[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    setImporting(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/content-posts/bulk", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Import failed");
        return;
      }

      setResults(data);
      onComplete();
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setResults(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Modal open={open} onClose={onClose} title="Bulk Import Posts">
      <div className="space-y-4">
        {!results ? (
          <>
            <p className="text-sm text-bb-muted">
              Upload a CSV file to schedule multiple posts at once.
            </p>

            {/* CSV format info */}
            <div className="bg-bb-elevated rounded-lg p-3 border border-bb-border">
              <p className="text-xs font-medium text-white mb-2">Required CSV columns:</p>
              <code className="text-[11px] text-bb-muted block leading-relaxed">
                clientId, platform, title, body, hashtags, scheduledAt, mediaUrls
              </code>
              <p className="text-[11px] text-bb-dim mt-2">
                &bull; <strong>platform</strong>: INSTAGRAM, TWITTER, LINKEDIN, FACEBOOK, TIKTOK, YOUTUBE<br />
                &bull; <strong>hashtags</strong>: semicolon-separated (e.g. tag1;tag2;tag3)<br />
                &bull; <strong>mediaUrls</strong>: semicolon-separated URLs<br />
                &bull; <strong>scheduledAt</strong>: ISO 8601 or YYYY-MM-DD HH:mm
              </p>
            </div>

            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed border-bb-border hover:border-bb-muted cursor-pointer transition-colors bg-bb-elevated/50"
            >
              {importing ? (
                <div className="flex items-center gap-2 text-bb-orange">
                  <Upload size={20} className="animate-bounce" />
                  <span className="text-sm">Importing...</span>
                </div>
              ) : (
                <>
                  <FileText size={24} className="text-bb-muted" />
                  <p className="text-sm text-bb-muted">Click to select CSV file</p>
                  <p className="text-xs text-bb-dim">Maximum 200 rows per import</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
              }}
            />

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Results */}
            <div className="flex items-center gap-3 bg-bb-elevated rounded-lg p-4 border border-bb-border">
              <CheckCircle size={24} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Import complete</p>
                <p className="text-xs text-bb-muted mt-0.5">
                  {results.imported} imported, {results.errors} errors, {results.total} total rows
                </p>
              </div>
            </div>

            {/* Error details */}
            {results.results.filter((r) => r.status === "error").length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {results.results
                  .filter((r) => r.status === "error")
                  .map((r) => (
                    <div
                      key={r.row}
                      className="flex items-start gap-2 text-xs px-3 py-1.5 bg-red-500/5 rounded"
                    >
                      <span className="text-red-400 shrink-0">Row {r.row}:</span>
                      <span className="text-bb-dim">{r.error}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
              >
                Import More
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange/90 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
