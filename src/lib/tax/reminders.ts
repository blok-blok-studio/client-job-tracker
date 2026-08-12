// Tax deadline reminder engine. Runs from the main cron (every 6h); dedupe markers
// in ActivityLog guarantee each (obligation, due date, stage) fires exactly once,
// so catch-up after downtime sends only the current stage, never a flood.
//
// Master switch: Setting "tax_reminders_enabled" (default false). While off, the
// engine computes what WOULD send and reports it, but posts nothing.

import prisma from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import type { DueRule } from "@/lib/tax/obligations-source";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

// Escalation buckets in days-before-due, widest first. A reminder fires when the
// deadline enters a bucket (tightest bucket wins, one send per bucket).
const STAGES = [270, 180, 90, 60, 30, 10, 5];

const DAY_MS = 24 * 60 * 60 * 1000;

interface ObligationRow {
  id: string;
  key: string;
  country: string;
  name: string;
  formName: string | null;
  frequency: string;
  dueRules: unknown;
  earliestOpen: unknown;
  verifyWithAdvisor: boolean;
  profile: { label: string } | null;
}

function startOfUTCDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Roll weekend due dates forward to Monday (IRS/German practice); returns the
// effective date plus a note when it moved.
function rollWeekend(date: Date): { date: Date; movedFrom: Date | null } {
  const day = date.getUTCDay();
  if (day === 6) return { date: new Date(date.getTime() + 2 * DAY_MS), movedFrom: date };
  if (day === 0) return { date: new Date(date.getTime() + DAY_MS), movedFrom: date };
  return { date, movedFrom: null };
}

// Next upcoming occurrence across an obligation's due rules, or null if none
// (e.g. a ONE_TIME date already passed).
function nextDueDate(rules: DueRule[], today: Date): { due: Date; movedFrom: Date | null } | null {
  const candidates: Date[] = [];
  for (const r of rules) {
    if (!r || typeof r.day !== "number") continue;
    if (r.year) {
      candidates.push(new Date(Date.UTC(r.year, (r.month || 1) - 1, r.day)));
    } else if (r.month === undefined) {
      // Every month: this month's occurrence, else next month's
      const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), r.day));
      candidates.push(
        thisMonth >= today
          ? thisMonth
          : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, r.day))
      );
    } else {
      const thisYear = new Date(Date.UTC(today.getUTCFullYear(), r.month - 1, r.day));
      candidates.push(
        thisYear >= today
          ? thisYear
          : new Date(Date.UTC(today.getUTCFullYear() + 1, r.month - 1, r.day))
      );
    }
  }
  const upcoming = candidates
    .map((c) => rollWeekend(c))
    .filter((c) => c.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (!upcoming[0]) return null;
  return { due: upcoming[0].date, movedFrom: upcoming[0].movedFrom };
}

async function markerExists(details: string) {
  const row = await prisma.activityLog.findFirst({
    where: { action: "tax_reminder_sent", details },
    select: { id: true },
  });
  return !!row;
}

async function writeMarker(details: string) {
  await prisma.activityLog.create({
    data: { actor: "system", action: "tax_reminder_sent", details },
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function processTaxReminders(): Promise<{
  enabled: boolean;
  sent: string[];
  wouldSend: string[];
}> {
  const setting = await prisma.setting.findUnique({ where: { key: "tax_reminders_enabled" } });
  const enabled = setting?.value === true;

  const today = startOfUTCDay(new Date());
  const sent: string[] = [];
  const wouldSend: string[] = [];

  const post = async (marker: string, message: string) => {
    if (await markerExists(marker)) return;
    if (enabled) {
      await notifySlack(message);
      await writeMarker(marker);
      sent.push(marker);
    } else {
      wouldSend.push(marker);
    }
  };

  // --- Deadline reminders ---
  const obligations = (await prisma.taxObligation.findMany({
    where: { enabled: true, frequency: { not: "WATCH" } },
    include: { profile: { select: { label: true } } },
  })) as unknown as ObligationRow[];

  for (const o of obligations) {
    const rules = (Array.isArray(o.dueRules) ? o.dueRules : []) as DueRule[];
    const next = nextDueDate(rules, today);
    if (!next) continue;

    const daysUntil = Math.round((next.due.getTime() - today.getTime()) / DAY_MS);
    const dueISO = next.due.toISOString().slice(0, 10);
    const label = o.profile ? ` (${o.country} · ${o.profile.label})` : ` (${o.country})`;
    const form = o.formName ? ` — ${o.formName}` : "";
    const moved = next.movedFrom ? ` (moved from ${fmtDate(next.movedFrom)})` : "";
    const advisor = o.verifyWithAdvisor ? "\n_Flagged: verify details with your tax advisor._" : "";
    const link = `\n<${APP_URL}/compliance|Open Compliance>`;

    // Earliest-submission opening (e.g. IRS e-file opens late January)
    const open = o.earliestOpen as { month?: number; day?: number } | null;
    if (open && typeof open.month === "number" && typeof open.day === "number") {
      const openYear =
        open.month <= next.due.getUTCMonth() + 1 ? next.due.getUTCFullYear() : next.due.getUTCFullYear() - 1;
      const openDate = new Date(Date.UTC(openYear, open.month - 1, open.day));
      if (today >= openDate && daysUntil >= 0) {
        await post(
          `${o.key}#${dueISO}#open`,
          `:unlock: *${o.name}*${label}${form} — submission window is open. Due ${fmtDate(next.due)}${moved} (${daysUntil} days out).${advisor}${link}`
        );
      }
    }

    // Tightest escalation bucket the deadline currently sits in
    const stage = STAGES.filter((s) => daysUntil <= s).sort((a, b) => a - b)[0];
    if (stage === undefined || daysUntil < 0) continue;

    const emoji = daysUntil <= 10 ? ":rotating_light:" : daysUntil <= 30 ? ":warning:" : ":calendar:";
    await post(
      `${o.key}#${dueISO}#${stage}`,
      `${emoji} *${o.name}*${label}${form} due *${fmtDate(next.due)}*${moved} — ${daysUntil} day${daysUntil === 1 ? "" : "s"} out.${advisor}${link}`
    );
  }

  // --- Document chasers (weekly, one combined message) ---
  const fourteenDaysAgo = new Date(today.getTime() - 14 * DAY_MS);
  const ninetyDaysOut = new Date(today.getTime() + 90 * DAY_MS);
  // Prisma include-type inference is broken repo-wide — cast the results
  type DocRow = {
    type: string;
    validUntil: Date | null;
    contractor: { name: string } | null;
    client: { name: string } | null;
  };
  const [pendingDocs, expiringDocs] = (await Promise.all([
    prisma.taxDocument.findMany({
      where: { status: "REQUESTED", requestedAt: { lt: fourteenDaysAgo } },
      include: {
        contractor: { select: { name: true } },
        client: { select: { name: true } },
      },
      take: 25,
    }),
    prisma.taxDocument.findMany({
      where: { status: "RECEIVED", validUntil: { not: null, lt: ninetyDaysOut } },
      include: {
        contractor: { select: { name: true } },
        client: { select: { name: true } },
      },
      take: 25,
    }),
  ])) as unknown as [DocRow[], DocRow[]];

  if (pendingDocs.length || expiringDocs.length) {
    const who = (d: { contractor: { name: string } | null; client: { name: string } | null }) =>
      d.contractor?.name || d.client?.name || "Unknown";
    const lines: string[] = [];
    if (pendingDocs.length) {
      lines.push(
        `*Requested 14+ days ago (${pendingDocs.length})*\n` +
          pendingDocs.map((d) => `• ${d.type} — ${who(d)}`).join("\n")
      );
    }
    if (expiringDocs.length) {
      lines.push(
        `*Expiring within 90 days (${expiringDocs.length})*\n` +
          expiringDocs
            .map((d) => `• ${d.type} — ${who(d)}${d.validUntil ? ` (until ${fmtDate(new Date(d.validUntil))})` : ""}`)
            .join("\n")
      );
    }
    await post(
      `docs#${isoWeek(today)}`,
      `:card_index_dividers: *Tax documents need attention*\n\n${lines.join("\n\n")}\n<${APP_URL}/compliance|Open Compliance>`
    );
  }

  return { enabled, sent, wouldSend };
}
