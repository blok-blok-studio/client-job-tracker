import { createHash, createHmac, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

/**
 * Site analytics, server side of the tracker in public/bb.js.
 *
 * Privacy model (the reason no consent banner is needed for it):
 *  - nothing is stored on the visitor's device, no cookies and no ids
 *  - the IP address is never written anywhere; it only feeds a hash
 *  - that hash is keyed with a value that changes every UTC day, so a visitor
 *    cannot be followed from one day to the next or across sites
 *  - referrers are reduced to a host, paths carry no query string
 */

export const SESSION_GAP_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function dayKey(date: Date): string {
  return createHmac("sha256", secret()).update(`bb-analytics:${date.toISOString().slice(0, 10)}`).digest("hex");
}

/** Daily-rotating visitor hash. Also returns yesterday's, so a visit that runs past midnight stays one session. */
export function visitorIds(siteId: string, ip: string, ua: string, now = new Date()): { today: string; yesterday: string } {
  const make = (d: Date) => createHash("sha256").update(`${dayKey(d)}|${siteId}|${ip}|${ua}`).digest("hex").slice(0, 32);
  return { today: make(now), yesterday: make(new Date(now.getTime() - 24 * 60 * 60 * 1000)) };
}

export function newId(): string {
  return randomBytes(12).toString("hex");
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|scrape|curl|wget|python|node-fetch|axios|go-http|java\/|facebookexternalhit|whatsapp|telegram|embedly|chrome-lighthouse|vercel/i;

export function isBot(ua: string): boolean {
  return !ua || ua.length < 20 || BOT.test(ua);
}

export function parseUa(ua: string): { device: "desktop" | "tablet" | "mobile"; browser: string; os: string } {
  const tablet = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  let browser = "Other";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "Other";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return { device: tablet ? "tablet" : mobile ? "mobile" : "desktop", browser, os };
}

/** "https://www.Example.com/a?b" -> "example.com"; anything unparseable -> null */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normaliseDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  return (hostOf(raw.includes("://") ? raw : `https://${raw}`) || raw).replace(/\/.*$/, "");
}

/** Does this request host belong to the site (the domain itself or any subdomain)? */
export function hostMatches(host: string | null, domain: string): boolean {
  if (!host) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

export function cleanPath(p: unknown): string {
  let s = typeof p === "string" ? p : "/";
  s = s.split("?")[0].split("#")[0].slice(0, 300);
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

export function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

export function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

// ── Site lookup, cached for a minute so a page view is not two queries ──
type SiteLite = { id: string; key: string; domain: string; active: boolean };
const siteCache = new Map<string, { site: SiteLite | null; at: number }>();

export async function siteByKey(key: string): Promise<SiteLite | null> {
  const hit = siteCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.site;
  const site = await prisma.analyticsSite.findUnique({
    where: { key },
    select: { id: true, key: true, domain: true, active: true },
  });
  siteCache.set(key, { site, at: Date.now() });
  return site;
}

export function forgetSite(key: string) {
  siteCache.delete(key);
}

// ── Heatmap view links: a short-lived token lets the live site load its own numbers ──
export function createHeatToken(siteId: string): string {
  return jwt.sign({ stage: "heat", sid: siteId }, secret(), { expiresIn: 4 * 60 * 60 });
}

export function verifyHeatToken(token: string): string | null {
  try {
    const p = jwt.verify(token, secret()) as { stage?: string; sid?: string };
    return p.stage === "heat" && p.sid ? p.sid : null;
  } catch {
    return null;
  }
}
