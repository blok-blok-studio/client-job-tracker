"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Globe2, Sparkles } from "lucide-react";
import { Card, FieldLabel, inputClass } from "./ui";
import { browserTimezone, formatInZone, isoToZonedLocal, nextUtcSlot, zonedLocalToIso, zoneAbbreviation } from "./timezone";
import { platformName } from "./types";

interface BestTime {
  day: number;
  hour: number;
  label: string;
  source: "historical" | "recommended";
}

interface Props {
  clientId: string;
  timeZone: string;
  timeZoneIsClient: boolean;
  scheduledAtIso: string;
  platform?: string;
  disabled?: boolean;
  onChange: (iso: string) => void;
}

export default function SchedulePanel({ clientId, timeZone, timeZoneIsClient, scheduledAtIso, platform, disabled, onChange }: Props) {
  const [bestTimes, setBestTimes] = useState<BestTime[]>([]);
  const local = isoToZonedLocal(scheduledAtIso, timeZone);
  const myZone = browserTimezone();
  const inPast = !!scheduledAtIso && new Date(scheduledAtIso).getTime() < Date.now();

  useEffect(() => {
    if (!platform || platform === "REDNOTE") {
      setBestTimes([]);
      return;
    }
    const params = new URLSearchParams({ platform });
    if (clientId) params.set("clientId", clientId);
    let cancelled = false;
    fetch(`/api/content-posts/best-times?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.success) setBestTimes((d.data as BestTime[]).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [platform, clientId]);

  const [date, time] = local ? local.split("T") : ["", ""];

  const setParts = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(zonedLocalToIso(`${nextDate}T${nextTime || "09:00"}`, timeZone));
  };

  return (
    <Card id="composer-when" title="When" icon={<CalendarClock size={13} />}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel htmlFor="composer-date">Date</FieldLabel>
          <input id="composer-date" type="date" value={date} disabled={disabled} onChange={(e) => setParts(e.target.value, time)} className={inputClass} />
        </div>
        <div>
          <FieldLabel htmlFor="composer-time">Time</FieldLabel>
          <input id="composer-time" type="time" value={time} disabled={disabled || !date} onChange={(e) => setParts(date, e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-bb-dim">
        <Globe2 size={12} className="mt-px shrink-0" />
        <span>
          {timeZoneIsClient ? "Client's time zone: " : "Your time zone (client has none set): "}
          <span className="text-bb-muted">
            {timeZone} ({zoneAbbreviation(timeZone)})
          </span>
          {scheduledAtIso && myZone !== timeZone && (
            <>
              {" "}
              · {formatInZone(scheduledAtIso, myZone)} your time
            </>
          )}
        </span>
      </div>

      {scheduledAtIso && (
        <div className="flex items-center justify-between gap-2">
          <p className={inPast ? "text-xs text-red-400" : "text-xs text-bb-muted"}>
            {inPast ? "That time has passed." : formatInZone(scheduledAtIso, timeZone, { year: "numeric" })}
          </p>
          {!disabled && (
            <button type="button" onClick={() => onChange("")} className="text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors">
              Clear
            </button>
          )}
        </div>
      )}

      {bestTimes.length > 0 && !disabled && (
        <div>
          <p className="flex items-center gap-1 text-[11px] text-bb-dim mb-1.5">
            <Sparkles size={11} className="text-bb-orange" />
            {bestTimes[0].source === "historical" ? "Times that worked before" : "Good times"} for {platformName(platform || "")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bestTimes.map((t) => {
              const slot = nextUtcSlot(t.day, t.hour).toISOString();
              return (
                <button
                  key={`${t.day}-${t.hour}`}
                  type="button"
                  onClick={() => onChange(slot)}
                  className="px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-md border border-bb-border bg-bb-elevated text-[11px] text-bb-muted hover:text-white hover:border-bb-orange/50 cursor-pointer transition-colors"
                >
                  {formatInZone(slot, timeZone, { month: undefined, day: undefined })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
