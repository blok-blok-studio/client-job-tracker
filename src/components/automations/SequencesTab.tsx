"use client";

import { useState } from "react";
import { Ban, Clock } from "lucide-react";
import Badge from "@/components/shared/Badge";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";
import { humanOffset, KIND_LABEL, KIND_VARIANT } from "./helpers";

export interface SequenceStepRow {
  key: string;
  label: string;
  kind: string;
  templateKey: string | null;
  offsetMinutes: number;
  defaultOffsetMinutes: number;
  offsetBounds: [number, number];
  editable: boolean;
  cancelCondition: { key: string; description: string } | null;
}

export interface SequenceRow {
  key: string;
  name: string;
  enabled: boolean;
  trigger: string;
  anchorDescription: string;
  recurring: boolean;
  steps: SequenceStepRow[];
}

function OffsetEditor({
  step,
  sequenceKey,
  onSaved,
}: {
  step: SequenceStepRow;
  sequenceKey: string;
  onSaved: () => void;
}) {
  const isDays = Math.abs(step.offsetMinutes) % 1440 === 0 && step.offsetMinutes !== 0;
  const [unit, setUnit] = useState<"days" | "hours">(isDays || step.offsetMinutes === 0 ? "days" : "hours");
  const [value, setValue] = useState(
    String(unit === "days" ? step.offsetMinutes / 1440 : step.offsetMinutes / 60)
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    const n = Number(value);
    if (Number.isNaN(n)) return toast("Enter a number", "error");
    const offsetMinutes = Math.round(n * (unit === "days" ? 1440 : 60));
    setSaving(true);
    try {
      const res = await fetch("/api/lifecycle/sequences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sequenceKey, stepKey: step.key, offsetMinutes }),
      });
      const data = await res.json();
      if (data.success) {
        toast(
          `Timing saved${data.data?.rescheduled ? ` — ${data.data.rescheduled} pending step(s) rescheduled` : ""}`,
          "success"
        );
        onSaved();
      } else {
        toast(data.error || "Failed", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 bg-bb-black border border-bb-border rounded px-2 py-0.5 text-xs focus:border-bb-orange outline-none"
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as "days" | "hours")}
        className="bg-bb-black border border-bb-border rounded px-1 py-0.5 text-xs outline-none"
      >
        <option value="days">days</option>
        <option value="hours">hours</option>
      </select>
      <button
        onClick={save}
        disabled={saving}
        className="text-xs text-bb-orange hover:text-bb-orange-light px-1"
      >
        {saving ? "…" : "Save"}
      </button>
    </span>
  );
}

export default function SequencesTab({
  sequences,
  isOwner,
  onChanged,
}: {
  sequences: SequenceRow[];
  isOwner: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();

  const toggle = async (seq: SequenceRow) => {
    const res = await fetch("/api/lifecycle/sequences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: seq.key, enabled: !seq.enabled }),
    });
    const data = await res.json();
    if (data.success) {
      toast(`Sequence ${seq.key} ${seq.enabled ? "disabled" : "enabled"}`, "success");
      onChanged();
    } else {
      toast(data.error || "Failed", "error");
    }
  };

  return (
    <div className="space-y-3">
      {sequences.map((seq) => (
        <div key={seq.key} className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">
                  {seq.key} — {seq.name}
                </h3>
                {seq.recurring && <Badge variant="purple">Recurring</Badge>}
                <Badge variant={seq.enabled ? "green" : "gray"}>
                  {seq.enabled ? "Enabled" : "Off"}
                </Badge>
              </div>
              <p className="text-xs text-bb-dim mt-1">
                Trigger: {seq.trigger} · timings measured from {seq.anchorDescription}
              </p>
            </div>
            <button
              onClick={() => isOwner && toggle(seq)}
              disabled={!isOwner}
              title={isOwner ? undefined : "Owner only"}
              className={cn(
                "relative w-10 h-5.5 rounded-full transition-colors shrink-0 h-6",
                seq.enabled ? "bg-bb-orange" : "bg-bb-elevated",
                !isOwner && "opacity-40 cursor-not-allowed"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                  seq.enabled ? "translate-x-4.5 left-0.5" : "left-0.5"
                )}
                style={{ transform: seq.enabled ? "translateX(16px)" : undefined }}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            {seq.steps.map((step) => (
              <div
                key={step.key}
                className="flex items-center gap-2 flex-wrap text-xs bg-bb-black/50 border border-bb-border/50 rounded-md px-2.5 py-1.5"
              >
                <Badge variant={KIND_VARIANT[step.kind] || "gray"}>{KIND_LABEL[step.kind] || step.kind}</Badge>
                <span className="text-bb-muted">{step.label}</span>
                <span className="flex items-center gap-1 text-bb-dim ml-auto">
                  <Clock size={11} />
                  {step.editable ? (
                    <OffsetEditor step={step} sequenceKey={seq.key} onSaved={onChanged} />
                  ) : (
                    humanOffset(step.offsetMinutes)
                  )}
                  {step.editable && step.offsetMinutes !== step.defaultOffsetMinutes && (
                    <span className="text-bb-dim/60">(default {humanOffset(step.defaultOffsetMinutes)})</span>
                  )}
                </span>
                {step.cancelCondition && (
                  <span className="w-full flex items-start gap-1 text-bb-dim/80 pl-1">
                    <Ban size={10} className="mt-0.5 shrink-0" />
                    {step.cancelCondition.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
