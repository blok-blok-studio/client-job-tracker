"use client";

import { useState } from "react";
import { FlaskConical, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import LifecycleTimeline from "./LifecycleTimeline";
import { readJson, friendlyError } from "@/lib/fetch-json";

interface DryRunReport {
  clientId: string;
  contractorId: string;
  t0: string;
  events: { day: number; action: string }[];
  assertions: { name: string; pass: boolean; detail: string }[];
  emailsDelivered: number;
}

export default function DryRunTab() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const { toast } = useToast();

  const run = async () => {
    setRunning(true);
    setReport(null);
    try {
      const res = await fetch("/api/lifecycle/dry-run", { method: "POST" });
      const result = await readJson<{ data: DryRunReport }>(res, "Dry run failed. Please try again.");
      if (result.ok) {
        setReport(result.data!.data);
        toast("Dry run complete — no real emails were sent", "success");
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Dry run failed. Please try again."), "error");
    } finally {
      setRunning(false);
    }
  };

  const cleanup = async () => {
    // Reported success unconditionally, so a 500 still said the records were gone
    try {
      const res = await fetch("/api/lifecycle/dry-run", { method: "DELETE" });
      const result = await readJson(res, "Couldn't remove the dry-run records. Please try again.");
      if (!result.ok) {
        toast(result.error!, "error");
        return;
      }
      setReport(null);
      toast("Dry-run records removed", "success");
    } catch (err) {
      toast(friendlyError(err, "Couldn't remove the dry-run records. Please try again."), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Isolated lifecycle test</h3>
            <p className="text-xs text-bb-dim mt-1 max-w-xl">
              Walks a fake client (Essential tier) and a fake contractor through the whole journey with
              simulated time: contract signed, kickoff booked, content in, launch, Care conversion. Every
              email is recorded instead of sent, no kanban tasks are created, and cancel conditions are
              verified along the way.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors"
            >
              <FlaskConical size={14} /> {running ? "Running…" : "Run dry run"}
            </button>
            <button
              onClick={cleanup}
              className="flex items-center gap-1.5 px-3 py-2 bg-bb-elevated hover:bg-bb-border text-sm rounded-md transition-colors"
              title="Remove the fake records"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {report && (
        <>
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">
              Acceptance checks · {report.assertions.filter((a) => a.pass).length}/
              {report.assertions.length} passed · {report.emailsDelivered} real emails delivered
            </h4>
            <div className="space-y-1">
              {report.assertions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {a.pass ? (
                    <CheckCircle2 size={13} className="text-green-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                  )}
                  <span className="text-bb-muted">{a.name}</span>
                  <span className="text-bb-dim/60 ml-auto text-right">{a.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Simulated events</h4>
            <div className="space-y-0.5">
              {report.events.map((e, i) => (
                <p key={i} className="text-xs text-bb-dim">
                  <span className="text-bb-orange font-mono">day {String(e.day).padStart(3, " ")}</span>{" "}
                  {e.action}
                </p>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Fake client timeline</h4>
              <LifecycleTimeline clientId={report.clientId} showPause={false} />
            </div>
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Fake contractor timeline</h4>
              <LifecycleTimeline contractorId={report.contractorId} showPause={false} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
