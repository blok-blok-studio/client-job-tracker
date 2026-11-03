"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Mail } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";
import { btnPrimary, btnGhost, chipCls, readJsonSafe } from "./shared";

interface Preview {
  number: string;
  to: string | null;
  autoSend: boolean;
  blockers: string[];
  subject: string;
  html: string;
}

interface Props {
  open: boolean;
  id: string | null;
  onClose: () => void;
  onIssued: () => void;
}

/**
 * Last look before a draft becomes a numbered invoice: the final PDF (as the
 * client gets it, no DRAFT stamp) and the email that goes with it. Nothing is
 * issued or sent until one of the issue buttons is pressed.
 */
export default function IssuePreview({ open, id, onClose, onIssued }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pdf" | "email">("pdf");
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    if (!open || !id) return;
    setData(null);
    setError(null);
    setTab("pdf");
    setStamp(Date.now());
    fetch(`/api/studio-invoices/${id}/preview`)
      .then(readJsonSafe)
      .then((json) => (json.success ? setData(json.data as Preview) : setError(json.error || "Could not build the preview")))
      .catch(() => setError("Could not build the preview"));
  }, [open, id]);

  async function issue(send: boolean) {
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/studio-invoices/${id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send }),
      });
      const json = await readJsonSafe(res);
      if (!json.success) throw new Error(json.error || "Failed");
      const d = json.data as { number: string; send?: { sent: boolean; to: string | null; error: string | null } };
      if (d.send?.sent) toast(`Issued ${d.number} and emailed to ${d.send.to}`, "success");
      else if (d.send?.error) toast(`Issued ${d.number}. Not emailed: ${d.send.error}`, "info");
      else toast(`Issued ${d.number}. Not emailed yet.`, "success");
      onIssued();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const pdfSrc = id ? `/api/studio-invoices/${id}/preview?format=pdf&t=${stamp}` : "";
  const blocked = !!data?.blockers.length;

  return (
    <Modal open={open} onClose={onClose} title="Preview before issuing" className="max-w-4xl">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : !data ? (
        <div className="text-sm text-bb-dim py-8">Building the preview…</div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-bb-muted">
            This is exactly what the client gets. Nothing is numbered or sent yet. The number will be{" "}
            <span className="text-white font-medium">{data.number}</span> unless another invoice is issued first.
          </p>

          {blocked && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 space-y-1">
              <p className="font-medium">Can&apos;t issue yet:</p>
              {data.blockers.map((b) => <p key={b}>{b}</p>)}
            </div>
          )}

          <div className="flex gap-2">
            <button className={`${chipCls(tab === "pdf")} inline-flex items-center gap-1.5`} onClick={() => setTab("pdf")}><FileText size={14} /> Invoice PDF</button>
            <button className={`${chipCls(tab === "email")} inline-flex items-center gap-1.5`} onClick={() => setTab("email")}><Mail size={14} /> Email</button>
            {tab === "pdf" && (
              <a href={pdfSrc} target="_blank" rel="noreferrer" className={`${btnGhost} ml-auto inline-flex items-center gap-1.5`}><ExternalLink size={14} /> Open in new tab</a>
            )}
          </div>

          {tab === "pdf" ? (
            <iframe key={pdfSrc} src={pdfSrc} title="Invoice preview" className="w-full h-[52vh] rounded-lg border border-bb-border bg-white" />
          ) : (
            <div className="space-y-2">
              <div className="text-sm space-y-0.5">
                <p><span className="text-bb-dim">To:</span> <span className="text-white">{data.to || "no email on the invoice"}</span></p>
                <p><span className="text-bb-dim">Subject:</span> <span className="text-white">{data.subject}</span></p>
                <p><span className="text-bb-dim">Attached:</span> <span className="text-white">{data.number}.pdf</span></p>
              </div>
              <iframe srcDoc={data.html} sandbox="" title="Email preview" className="w-full h-[44vh] rounded-lg border border-bb-border bg-white" />
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <button className={btnGhost} disabled={busy} onClick={onClose}>Back to draft</button>
            {data.to ? (
              <>
                <button className={btnGhost} disabled={busy || blocked} onClick={() => issue(false)}>Issue, don&apos;t email yet</button>
                <button className={btnPrimary} disabled={busy || blocked} onClick={() => issue(true)}>Issue and email to {data.to}</button>
              </>
            ) : (
              <button className={btnPrimary} disabled={busy || blocked} onClick={() => issue(false)}>Issue number</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
