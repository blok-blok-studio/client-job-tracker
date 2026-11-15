import prisma from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { getSetting } from "@/lib/lifecycle/settings";
import { channelOf } from "@/lib/analytics/query";

/**
 * Monday summary of every tracked website, posted to the team's Slack channel.
 *
 * Switch: Setting "analytics_weekly_digest" (default off, owner turns it on in the Analytics tab).
 * Runs from the 6-hourly cron; sends once per week, on the first run on or after Monday 07:00 UTC.
 * Sent weeks are remembered in the activity log, the same way the tax reminders are.
 */
export const DIGEST_SETTING = "analytics_weekly_digest";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week `now` falls in. */
function weekStart(now: Date): Date {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}

const change = (now: number, before: number) => {
  if (!before) return "none the week before";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "the same as the week before" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on the week before`;
};

export async function weeklyDigestText(now = new Date()): Promise<string | null> {
  const thisMonday = weekStart(now);
  const from = new Date(thisMonday.getTime() - WEEK);
  const before = new Date(from.getTime() - WEEK);
  const sites = await prisma.analyticsSite.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, domain: true } });
  const lines: string[] = [];
  for (const site of sites) {
    const [week, earlier, sent] = await Promise.all([
      prisma.analyticsPageview.findMany({
        where: { siteId: site.id, createdAt: { gte: from, lt: thisMonday } },
        orderBy: { createdAt: "asc" },
        take: 100_000,
        select: { visitorId: true, sessionId: true, path: true, referrer: true, utmSource: true, utmMedium: true },
      }),
      prisma.analyticsPageview.findMany({
        where: { siteId: site.id, createdAt: { gte: before, lt: from } },
        distinct: ["visitorId"],
        select: { visitorId: true },
      }),
      prisma.analyticsEvent.findMany({
        where: { siteId: site.id, name: "Form sent", createdAt: { gte: from, lt: thisMonday } },
        distinct: ["sessionId"],
        select: { sessionId: true },
      }),
    ]);
    if (!week.length && !earlier.length) continue;
    const visitors = new Set(week.map((v) => v.visitorId)).size;
    const pages = new Map<string, number>();
    const channels = new Map<string, number>();
    const seen = new Set<string>();
    for (const v of week) {
      pages.set(v.path, (pages.get(v.path) || 0) + 1);
      if (!seen.has(v.sessionId)) {
        seen.add(v.sessionId);
        const c = channelOf(v);
        channels.set(c, (channels.get(c) || 0) + 1);
      }
    }
    const best = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
    lines.push(
      `*${site.name}* (${site.domain}): ${visitors.toLocaleString("en-US")} visitors (${change(visitors, earlier.length)}). ` +
        `${seen.size.toLocaleString("en-US")} visits, ${week.length.toLocaleString("en-US")} page views` +
        (best(pages) ? `. Top page ${best(pages)}` : "") +
        (best(channels) ? `, most visits from ${best(channels)}` : "") +
        (sent.length ? `. Forms sent: ${sent.length}` : "") +
        "."
    );
  }
  if (!lines.length) return null;
  return `:bar_chart: *Websites last week*\n${lines.join("\n")}`;
}

/** Called by the cron. Returns true when a summary went out. */
export async function sendWeeklyDigestIfDue(now = new Date()): Promise<boolean> {
  if (!(await getSetting<boolean>(DIGEST_SETTING, false))) return false;
  const monday = weekStart(now);
  if (now.getTime() < monday.getTime() + 7 * 60 * 60 * 1000) return false; // not before Monday 07:00 UTC
  const marker = `week#${monday.toISOString().slice(0, 10)}`;
  const already = await prisma.activityLog.findFirst({ where: { action: "analytics_digest_sent", details: marker }, select: { id: true } });
  if (already) return false;
  const text = await weeklyDigestText(now);
  // Remember the week either way, so a quiet week is not retried every six hours
  await prisma.activityLog.create({ data: { actor: "system", action: "analytics_digest_sent", details: marker } });
  if (!text) return false;
  await notifySlack(text);
  return true;
}
