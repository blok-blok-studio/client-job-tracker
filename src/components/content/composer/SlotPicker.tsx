"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, Loader2, Plus, X } from "lucide-react";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { inputClass } from "./ui";
import { formatInZone, nextFreeSlot, type PostingSlot } from "./timezone";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  clientId: string;
  /** Zone the slot times are read in: the client's, or the one being scheduled in */
  slotZone: string;
  /** This post's own group, so its current time doesn't count as taken */
  groupId?: string;
  onPick: (iso: string) => void;
}

/** The client's usual posting times, and a one-tap "next free one". */
export default function SlotPicker({ clientId, slotZone, groupId, onPick }: Props) {
  const [slots, setSlots] = useState<PostingSlot[]>([]);
  const [taken, setTaken] = useState<{ at: string; groupId: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PostingSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setEditing(false);
    setMessage(null);
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/posting-slots?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => readJson<{ data: { slots: PostingSlot[]; taken: { at: string; groupId: string }[] } }>(r))
      .then((result) => {
        if (cancelled || !result.ok || !result.data) return;
        setSlots(result.data.data.slots);
        setTaken(result.data.data.taken);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId || !loaded) return null;

  const pickNext = () => {
    const iso = nextFreeSlot(slots, slotZone, taken.filter((t) => t.groupId !== groupId).map((t) => t.at));
    if (!iso) {
      setMessage("Every slot in the next few months is taken.");
      return;
    }
    setMessage(null);
    onPick(iso);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/posting-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, slots: draft }),
      });
      const result = await readJson<{ data: { slots: PostingSlot[] } }>(res, "Couldn't save the posting times.");
      if (!result.ok || !result.data) {
        setMessage(result.error || "Couldn't save the posting times.");
        return;
      }
      setSlots(result.data.data.slots);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-bb-border bg-bb-elevated p-2.5 space-y-2">
        <p className="text-xs font-medium text-white">Usual posting times for this client</p>
        <p className="text-[11px] text-bb-dim">Read in {slotZone.replace(/_/g, " ")} time.</p>
        {draft.map((slot, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={slot.weekday}
              aria-label="Day"
              onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))}
              className={cn(inputClass, "flex-1 min-w-0")}
            >
              {DAYS.map((day, n) => (
                <option key={day} value={n}>
                  {day}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={slot.time}
              aria-label="Time"
              onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
              className={cn(inputClass, "w-32 shrink-0")}
            />
            <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label="Remove" className="p-2 text-bb-dim hover:text-red-400 cursor-pointer shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft((d) => [...d, { weekday: d.length ? (d[d.length - 1].weekday + 2) % 7 : 1, time: d.length ? d[d.length - 1].time : "18:00" }])}
          className="inline-flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light cursor-pointer"
        >
          <Plus size={12} /> Add a time
        </button>
        {message && <p className="text-xs text-red-400">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditing(false)} disabled={busy} className="px-3 py-2.5 sm:py-2 rounded-lg border border-bb-border text-xs text-bb-muted hover:text-white cursor-pointer transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || draft.some((s) => !s.time)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-bb-orange text-white text-xs font-medium cursor-pointer disabled:opacity-50"
          >
            {busy && <Loader2 size={12} className="animate-spin" />} Save times
          </button>
        </div>
      </div>
    );
  }

  const summary = slots.map((s) => `${DAYS[s.weekday].slice(0, 3)} ${formatInZone(`2026-01-04T${s.time}:00Z`, "UTC", { weekday: undefined, month: undefined, day: undefined })}`).join(" · ");
  const startEditing = () => {
    setDraft(slots.length ? slots : [{ weekday: 1, time: "18:00" }]);
    setMessage(null);
    setEditing(true);
  };

  return (
    <div className="space-y-1.5">
      {slots.length > 0 ? (
        <>
          <button
            type="button"
            onClick={pickNext}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 rounded-lg border border-bb-border text-sm text-bb-muted hover:text-white hover:border-bb-orange/50 cursor-pointer transition-colors"
          >
            <CalendarCheck size={14} /> Next free slot
          </button>
          <p className="text-[11px] text-bb-dim">
            {summary} ·{" "}
            <button type="button" onClick={startEditing} className="underline hover:text-white cursor-pointer">
              Edit
            </button>
          </p>
        </>
      ) : (
        <button type="button" onClick={startEditing} className="inline-flex items-center gap-1 text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors">
          <CalendarCheck size={11} /> Set this client&apos;s usual posting times
        </button>
      )}
      {message && <p className="text-xs text-amber-300">{message}</p>}
    </div>
  );
}
