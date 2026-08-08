"use client";

import { useState, useEffect, useCallback } from "react";
import { Pause, Play, Eye, SkipForward, Send } from "lucide-react";
import Badge from "@/components/shared/Badge";
import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";
import { fmtDateTime, STEP_STATUS_VARIANT, KIND_VARIANT, KIND_LABEL } from "./helpers";

interface StepRow {
  id: string;
  sequenceKey: string;
  sequenceName: string;
  stepKey: string;
  label: string;
  kind: string;
  status: string;
  dryRun: boolean;
  scheduledFor: string;
  processedAt: string | null;
  cancelReason: string | null;
  cancelCondition: string | null;
  renderedSubject: string | null;
  renderedBody: string | null;
}

/**
 * A record's full lifecycle timeline: sent, pending, cancelled and why.
 * Used on the client page, the contractor drawer, and the dry-run tab.
 */
export default function LifecycleTimeline({
  clientId,
  contractorId,
  showPause = true,
}: {
  clientId?: string;
  contractorId?: string;
  showPause?: boolean;
}) {
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<StepRow | null>(null);
  const [sendingDraft, setSendingDraft] = useState<StepRow | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const query = clientId ? `clientId=${clientId}` : `contractorId=${contractorId}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lifecycle/steps?${query}`);
      const data = await res.json();
      if (data.success) {
        setSteps(data.data.steps);
        setPaused(data.data.automationsPaused);
      }
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePause = async () => {
    const url = clientId ? `/api/clients/${clientId}` : `/api/contractors/${contractorId}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automationsPaused: !paused }),
    });
    const data = await res.json();
    if (data.success) {
      toast(!paused ? "Automations paused for this record" : "Automations resumed", "success");
      setPaused(!paused);
    } else {
      toast(data.error || "Failed", "error");
    }
  };

  const skip = async (step: StepRow) => {
    const reason = prompt(`Skip "${step.label}"? Optional reason:`);
    if (reason === null) return;
    const res = await fetch(`/api/lifecycle/steps/${step.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip", reason: reason || undefined }),
    });
    const data = await res.json();
    if (data.success) {
      toast("Step skipped", "success");
      load();
    } else {
      toast(data.error || "Failed", "error");
    }
  };

  const sendDraft = async () => {
    if (!sendingDraft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lifecycle/steps/${sendingDraft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-draft", subject: draftSubject, body: draftBody }),
      });
      const data = await res.json();
      if (data.success) {
        toast(
          data.data.note || `Sent (${data.data.delivered} delivered)`,
          data.data.delivered > 0 ? "success" : "info"
        );
        setSendingDraft(null);
        load();
      } else {
        toast(data.error || "Failed", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-xs text-bb-dim">Loading timeline…</p>;

  return (
    <div className="space-y-2">
      {showPause && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-bb-dim">
            {steps.length} scheduled step{steps.length === 1 ? "" : "s"}
            {paused && " · automations paused"}
          </span>
          <button
            onClick={togglePause}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors",
              paused
                ? "bg-bb-orange/15 text-bb-orange hover:bg-bb-orange/25"
                : "bg-bb-elevated text-bb-dim hover:text-bb-muted"
            )}
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            {paused ? "Resume automations" : "Pause all automations"}
          </button>
        </div>
      )}

      {steps.length === 0 && (
        <p className="text-xs text-bb-dim py-2">
          Nothing scheduled yet. Steps appear when lifecycle dates are set (contract signed, launch, …).
        </p>
      )}

      <div className="space-y-1">
        {steps.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 flex-wrap text-xs bg-bb-black/40 border border-bb-border/50 rounded-md px-2.5 py-1.5"
          >
            <Badge variant={STEP_STATUS_VARIANT[s.status] || "gray"}>
              {s.status}
              {s.dryRun && (s.status === "SENT" || s.status === "DONE") ? " (dry)" : ""}
            </Badge>
            <Badge variant={KIND_VARIANT[s.kind] || "gray"}>{KIND_LABEL[s.kind] || s.kind}</Badge>
            <span className="text-bb-muted">
              {s.sequenceKey}: {s.label}
            </span>
            <span className="text-bb-dim ml-auto">{fmtDateTime(s.scheduledFor)}</span>
            {(s.renderedSubject || s.renderedBody) && (
              <button
                onClick={() => setViewing(s)}
                title="View content"
                className="text-bb-dim hover:text-bb-orange transition-colors"
              >
                <Eye size={13} />
              </button>
            )}
            {s.status === "PENDING" && (
              <button
                onClick={() => skip(s)}
                title="Skip this step"
                className="text-bb-dim hover:text-yellow-400 transition-colors"
              >
                <SkipForward size={13} />
              </button>
            )}
            {s.kind === "DRAFT" && s.status === "DONE" && s.renderedBody && (
              <button
                onClick={() => {
                  setSendingDraft(s);
                  setDraftSubject(s.renderedSubject || "");
                  setDraftBody(s.renderedBody || "");
                }}
                title="Fill and send this draft"
                className="flex items-center gap-1 text-bb-orange hover:text-bb-orange-light transition-colors"
              >
                <Send size={12} /> Fill &amp; send
              </button>
            )}
            {s.cancelReason && <span className="w-full text-bb-dim/70 pl-1">{s.cancelReason}</span>}
            {s.status === "PENDING" && s.cancelCondition && (
              <span className="w-full text-bb-dim/50 pl-1">{s.cancelCondition}</span>
            )}
          </div>
        ))}
      </div>

      {/* Content viewer */}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={`${viewing.sequenceKey}: ${viewing.label}`}>
          <div className="space-y-2">
            {viewing.dryRun && (
              <p className="text-xs text-yellow-400">
                Dry run — this was recorded, not sent.
              </p>
            )}
            <p className="text-sm font-medium border-b border-bb-border pb-2">
              {viewing.renderedSubject}
            </p>
            <p className="text-sm text-bb-muted whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {viewing.renderedBody}
            </p>
          </div>
        </Modal>
      )}

      {/* Draft fill-and-send */}
      {sendingDraft && (
        <Modal
          open
          onClose={() => setSendingDraft(null)}
          title={`Fill & send — ${sendingDraft.label}`}
          className="max-w-2xl"
        >
          <div className="space-y-3">
            <p className="text-xs text-bb-dim">
              Replace the {"{{placeholders}}"} with real values. Send goes out only when you click, and
              only if live emails are on (otherwise it records a dry run).
            </p>
            <input
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
              className="w-full bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-sm focus:border-bb-orange outline-none"
            />
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={12}
              className="w-full bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-sm leading-relaxed focus:border-bb-orange outline-none resize-y"
            />
            <button
              onClick={sendDraft}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors"
            >
              <Send size={13} /> {busy ? "Sending…" : "Send now"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
