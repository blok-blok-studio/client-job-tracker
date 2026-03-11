"use client";

import { useState, useEffect } from "react";

const PHONE_TO_FLAG: [string, string][] = [
  ["+1", "\u{1F1FA}\u{1F1F8}"],
  ["+44", "\u{1F1EC}\u{1F1E7}"],
  ["+49", "\u{1F1E9}\u{1F1EA}"],
  ["+33", "\u{1F1EB}\u{1F1F7}"],
  ["+34", "\u{1F1EA}\u{1F1F8}"],
  ["+39", "\u{1F1EE}\u{1F1F9}"],
  ["+31", "\u{1F1F3}\u{1F1F1}"],
  ["+41", "\u{1F1E8}\u{1F1ED}"],
  ["+43", "\u{1F1E6}\u{1F1F9}"],
  ["+46", "\u{1F1F8}\u{1F1EA}"],
  ["+47", "\u{1F1F3}\u{1F1F4}"],
  ["+45", "\u{1F1E9}\u{1F1F0}"],
  ["+358", "\u{1F1EB}\u{1F1EE}"],
  ["+48", "\u{1F1F5}\u{1F1F1}"],
  ["+351", "\u{1F1F5}\u{1F1F9}"],
  ["+353", "\u{1F1EE}\u{1F1EA}"],
  ["+32", "\u{1F1E7}\u{1F1EA}"],
  ["+61", "\u{1F1E6}\u{1F1FA}"],
  ["+64", "\u{1F1F3}\u{1F1FF}"],
  ["+81", "\u{1F1EF}\u{1F1F5}"],
  ["+82", "\u{1F1F0}\u{1F1F7}"],
  ["+86", "\u{1F1E8}\u{1F1F3}"],
  ["+91", "\u{1F1EE}\u{1F1F3}"],
  ["+55", "\u{1F1E7}\u{1F1F7}"],
  ["+52", "\u{1F1F2}\u{1F1FD}"],
  ["+27", "\u{1F1FF}\u{1F1E6}"],
  ["+234", "\u{1F1F3}\u{1F1EC}"],
  ["+254", "\u{1F1F0}\u{1F1EA}"],
  ["+233", "\u{1F1EC}\u{1F1ED}"],
  ["+971", "\u{1F1E6}\u{1F1EA}"],
  ["+966", "\u{1F1F8}\u{1F1E6}"],
  ["+972", "\u{1F1EE}\u{1F1F1}"],
  ["+90", "\u{1F1F9}\u{1F1F7}"],
  ["+7", "\u{1F1F7}\u{1F1FA}"],
  ["+380", "\u{1F1FA}\u{1F1E6}"],
  ["+65", "\u{1F1F8}\u{1F1EC}"],
  ["+66", "\u{1F1F9}\u{1F1ED}"],
  ["+63", "\u{1F1F5}\u{1F1ED}"],
  ["+62", "\u{1F1EE}\u{1F1E9}"],
  ["+60", "\u{1F1F2}\u{1F1FE}"],
  ["+84", "\u{1F1FB}\u{1F1F3}"],
  ["+20", "\u{1F1EA}\u{1F1EC}"],
  ["+212", "\u{1F1F2}\u{1F1E6}"],
  ["+56", "\u{1F1E8}\u{1F1F1}"],
  ["+57", "\u{1F1E8}\u{1F1F4}"],
  ["+54", "\u{1F1E6}\u{1F1F7}"],
  ["+51", "\u{1F1F5}\u{1F1EA}"],
];

// Sort by longest code first so +358 matches before +3
const SORTED_CODES = [...PHONE_TO_FLAG].sort((a, b) => b[0].length - a[0].length);

export function getFlagFromPhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\s/g, "");
  for (const [code, flag] of SORTED_CODES) {
    if (cleaned.startsWith(code)) return flag;
  }
  return null;
}

export function getGmtOffset(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName");
    return offset?.value || "";
  } catch {
    return "";
  }
}

export function LiveClock({ timezone }: { timezone: string }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    function update() {
      try {
        const now = new Date();
        setTime(
          now.toLocaleTimeString("en-US", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        );
      } catch {
        setTime("");
      }
    }
    update();
    const interval = setInterval(update, 10000); // update every 10s
    return () => clearInterval(interval);
  }, [timezone]);

  if (!time) return null;
  return <span>{time}</span>;
}
