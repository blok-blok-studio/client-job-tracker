"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Send, History, RotateCcw, AlertTriangle, Eye } from "lucide-react";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";
import { readJson, friendlyError } from "@/lib/fetch-json";
import { COPY_RULES, fmtDateTime } from "./helpers";

interface Version {
  id: string;
  subject: string;
  body: string;
  editedBy: string;
  createdAt: string;
}

interface TemplateDetail {
  key: string;
  name: string;
  kind: string;
  subject: string;
  body: string;
  updatedBy: string | null;
  updatedAt: string;
  versions: Version[];
  original: { subject: string; body: string } | null;
  preview: { subject: string; body: string };
  tokens: { name: string; description: string; manual: boolean }[];
}

export default function TemplateEditor({
  templateKey,
  onClose,
  onSaved,
}: {
  templateKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ subject: string; body: string; missing: string[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lifecycle/templates/${templateKey}`);
      const result = await readJson<{ data: TemplateDetail }>(res, "Couldn't load that template.");
      if (result.ok) {
        const loaded = result.data!.data;
        setDetail(loaded);
        setSubject(loaded.subject);
        setBody(loaded.body);
        setPreview({ ...loaded.preview, missing: [] });
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Couldn't load that template."), "error");
    }
  }, [templateKey, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced validate + live preview as the editor types
  useEffect(() => {
    if (!detail) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const [v, p] = await Promise.all([
        fetch(`/api/lifecycle/templates/${templateKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate", subject, body }),
        })
          .then((r) => r.json())
          .catch(() => null),
        fetch(`/api/lifecycle/templates/${templateKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", subject, body }),
        })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (v?.success) setErrors(v.data.errors);
      if (p?.success) setPreview(p.data);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subject, body, templateKey, detail]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lifecycle/templates/${templateKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const result = await readJson(res, "Couldn't save that template. Please try again.");
      if (result.ok) {
        toast("Template saved", "success");
        onSaved();
        load();
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Couldn't save that template. Please try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  const action = async (payload: Record<string, unknown>, successMsg: string) => {
    try {
      const res = await fetch(`/api/lifecycle/templates/${templateKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJson(res, "That didn't work. Please try again.");
      if (result.ok) {
        toast(successMsg, "success");
        onSaved();
        load();
      } else {
        toast(result.error!, "error");
      }
      return result.ok;
    } catch (err) {
      toast(friendlyError(err, "That didn't work. Please try again."), "error");
      return false;
    }
  };

  if (!detail) {
    return (
      <Modal open onClose={onClose} title="Template">
        <p className="text-sm text-bb-dim">Loading…</p>
      </Modal>
    );
  }

  const dirty = subject !== detail.subject || body !== detail.body;

  return (
    <Modal open onClose={onClose} title={detail.name} className="max-w-5xl">
      <div className="space-y-3">
        {/* Fixed copy-rules note */}
        <div className="flex items-start gap-2 bg-bb-orange/10 border border-bb-orange/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="text-bb-orange shrink-0 mt-0.5" />
          <p className="text-xs text-bb-orange">{COPY_RULES} Merge fields use {"{{token}}"} syntax.</p>
        </div>

        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-400">{e}</p>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="space-y-2">
            <label className="text-xs text-bb-dim uppercase tracking-wide">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-sm focus:border-bb-orange outline-none"
            />
            <label className="text-xs text-bb-dim uppercase tracking-wide">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              className="w-full bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-sm font-mono leading-relaxed focus:border-bb-orange outline-none resize-y"
            />
            <button
              onClick={() => setShowTokens((v) => !v)}
              className="text-xs text-bb-dim hover:text-bb-orange transition-colors"
            >
              {showTokens ? "Hide" : "Show"} available merge fields
            </button>
            {showTokens && (
              <div className="max-h-48 overflow-y-auto bg-bb-black border border-bb-border rounded-lg p-2 space-y-1">
                {detail.tokens.map((t) => (
                  <div key={t.name} className="flex items-start gap-2 text-xs">
                    <code className="text-bb-orange shrink-0">{`{{${t.name}}}`}</code>
                    <span className="text-bb-dim">
                      {t.description}
                      {t.manual ? " (human fills before sending)" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live preview with the sample client */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Eye size={13} className="text-bb-dim" />
              <span className="text-xs text-bb-dim uppercase tracking-wide">
                Preview — sample client (Maria Keller, Essential)
              </span>
            </div>
            <div className="bg-bb-black border border-bb-border rounded-lg p-4 h-full max-h-[480px] overflow-y-auto">
              <p className="text-sm font-medium mb-3 pb-3 border-b border-bb-border">
                {preview?.subject}
              </p>
              <p className="text-sm text-bb-muted whitespace-pre-wrap leading-relaxed">
                {preview?.body}
              </p>
              {preview && preview.missing.length > 0 && (
                <p className="text-xs text-yellow-400 mt-3 pt-3 border-t border-bb-border">
                  Unfilled here: {preview.missing.map((m) => `{{${m}}}`).join(", ")}
                  {detail.kind === "SEQUENCE_EMAIL"
                    ? " — auto-send refuses to go out until these resolve with real data."
                    : " — a human fills these before sending."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Version history */}
        {showHistory && (
          <div className="bg-bb-black border border-bb-border rounded-lg p-3 max-h-56 overflow-y-auto space-y-2">
            {detail.versions.length === 0 && (
              <p className="text-xs text-bb-dim">No previous versions yet.</p>
            )}
            {detail.versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 text-xs border-b border-bb-border/50 pb-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-bb-muted truncate">{v.subject}</p>
                  <p className="text-bb-dim">
                    {v.editedBy} · {fmtDateTime(v.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => action({ action: "revert", versionId: v.id }, "Reverted to version")}
                  className="text-bb-dim hover:text-bb-orange transition-colors shrink-0"
                >
                  Revert to this
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <button
            onClick={save}
            disabled={saving || !dirty || errors.length > 0}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              dirty && errors.length === 0
                ? "bg-bb-orange hover:bg-bb-orange-light text-white"
                : "bg-bb-elevated text-bb-dim cursor-not-allowed"
            )}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={async () => {
              setTestSending(true);
              await action({ action: "test-send", subject, body }, "Test sent to your own email");
              setTestSending(false);
            }}
            disabled={testSending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-bb-elevated hover:bg-bb-border rounded-md transition-colors"
          >
            <Send size={13} /> {testSending ? "Sending…" : "Test send to me"}
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-bb-elevated hover:bg-bb-border rounded-md transition-colors"
          >
            <History size={13} /> History ({detail.versions.length})
          </button>
          {detail.original && (
            <button
              onClick={() => {
                if (confirm("Restore the original shipped copy? Current copy is kept in history.")) {
                  action({ action: "reset" }, "Restored the original copy");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-bb-elevated hover:bg-bb-border rounded-md transition-colors"
            >
              <RotateCcw size={13} /> Reset to original
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={detail.kind === "SEQUENCE_EMAIL" ? "orange" : detail.kind === "SEQUENCE_DRAFT" ? "blue" : "gray"}>
              {detail.kind === "SEQUENCE_EMAIL"
                ? "Auto email"
                : detail.kind === "SEQUENCE_DRAFT"
                  ? "Draft, human sends"
                  : "Manual snippet"}
            </Badge>
            {detail.updatedBy && (
              <span className="text-xs text-bb-dim">
                Last edit: {detail.updatedBy}, {fmtDateTime(detail.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
