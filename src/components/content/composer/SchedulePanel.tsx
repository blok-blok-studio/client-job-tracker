"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Globe2, Sparkles } from "lucide-react";
import { Card, FieldLabel, inputClass } from "./ui";
import { allTimezones, browserTimezone, formatInZone, isoToZonedLocal, nextUtcSlot, zonedLocalToIso, zoneAbbreviation } from "./timezone";
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
  /** null when the client has no zone saved */
  clientTimeZone: string | null;
  onTimeZoneChange: (zone: string) => void;
  scheduledAtIso: string;
  platform?: string;
  disabled?: boolean;
  onChange: (iso: string) => void;
}

export default function SchedulePanel({ clientId, timeZone, clientTimeZone, onTimeZoneChange, scheduledAtIso, platform, disabled, onChange }: Props) {
  const [bestTimes, setBestTimes] = useState<BestTime[]>([]);
  const local = isoToZonedLocal(scheduledAtIso, timeZone);
  const myZone = browserTimezone();
  const zones = useMemo(() => allTimezones(), []);
  const quickZones = [...new Set([clientTimeZone, myZone, timeZone].filter((z): z is string => !!z))];
  const zoneLabel = (zone: string) => {
    const name = zone.replace(/_/g, " ");
    if (zone === clientTimeZone) return `${name} (client)`;
    if (zone === myZone) return `${name} (you)`;
    return name;
  };
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

      <div>
        <FieldLabel htmlFor="composer-zone">Time zone</FieldLabel>
        <select id="composer-zone" value={timeZone} disabled={disabled} onChange={(e) => onTimeZoneChange(e.target.value)} className={inputClass}>
          <optgroup label="Suggested">
            {quickZones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </optgroup>
          <optgroup label="All time zones">
            {zones
              .filter((zone) => !quickZones.includes(zone))
              .map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </option>
              ))}
          </optgroup>
        </select>
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-bb-dim">
        <Globe2 size={12} className="mt-px shrink-0" />
        <span>
          {timeZone === clientTimeZone ? "Client's time zone" : timeZone === myZone ? "Your time zone" : "Scheduling in"}
          {": "}
          <span className="text-bb-muted">{zoneAbbreviation(timeZone, scheduledAtIso ? new Date(scheduledAtIso) : undefined)}</span>
          {!clientTimeZone && " · client has none set"}
          {scheduledAtIso && clientTimeZone && clientTimeZone !== timeZone && (
            <>
              {" "}
              · {formatInZone(scheduledAtIso, clientTimeZone)} for the client
            </>
          )}
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
