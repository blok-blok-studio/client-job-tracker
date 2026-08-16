import type { Client, Contractor, ClientService, PackageTier } from "@prisma/client";
import { addDays, CARE_TIER_PRICES, type TierConstants } from "./tiers";

/**
 * Merge-field system. Templates use {{token}} syntax. Every token must exist
 * in this registry — the editor blocks saving templates that reference
 * anything else, and the engine refuses to auto-send an email that would
 * render with an unresolved token.
 *
 * `manual: true` tokens are human-filled placeholders (Care stats, phase
 * names). They are allowed in DRAFT and SNIPPET templates because a person
 * edits before sending, and are rejected in auto-send SEQUENCE_EMAIL bodies.
 */

export interface RenderContext {
  client?: Client & { services?: ClientService[] };
  contractor?: Contractor;
  tierConstants: Record<PackageTier, TierConstants>;
  settings: { bookingLink: string; assetChecklistLink: string; appUrl: string };
  now: Date;
  extra?: Record<string, string>; // per-step values, e.g. n = "30"
}

interface TokenDef {
  description: string;
  sample: string; // shown in the editor's sample preview
  manual?: boolean;
  resolve?: (ctx: RenderContext) => string | null;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Flat numbers per the copy rules: 3500, not €3,500.00 (currency wording lives in the copy). */
export function formatMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

function clientTier(ctx: RenderContext): TierConstants | null {
  const t = ctx.client?.packageTier;
  return t ? ctx.tierConstants[t] : null;
}

function scopeLines(ctx: RenderContext): string | null {
  const services = (ctx.client?.services || []).filter((s) => s.status !== "CANCELLED");
  if (services.length > 0) return services.map((s) => s.name).join("\n");
  const tier = clientTier(ctx);
  return tier ? tier.scopeBullets.join("\n") : null;
}

export const TOKEN_REGISTRY: Record<string, TokenDef> = {
  first_name: {
    description: "Recipient's first name",
    sample: "Maria",
    resolve: (ctx) => {
      const name = ctx.client?.name || ctx.contractor?.name;
      return name ? firstName(name) : null;
    },
  },
  client: {
    description: "Client's full name",
    sample: "Maria Keller",
    resolve: (ctx) => ctx.client?.name || null,
  },
  partner: {
    description: "Partner's full name",
    sample: "Maria Keller",
    resolve: (ctx) => ctx.client?.name || null,
  },
  project_name: {
    description: "Project name (falls back to the client's name)",
    sample: "Keller Bakery Website",
    resolve: (ctx) => ctx.client?.projectName || ctx.client?.name || null,
  },
  tier_name: {
    description: "Package tier label (Launch, Essential, Growth, Scale)",
    sample: "Essential",
    resolve: (ctx) => clientTier(ctx)?.label || null,
  },
  scope_bullets: {
    description: "Scope lines — the client's services on record, or the tier's default scope",
    sample: "A website of up to 5 pages designed and built for you\nMobile friendly and fast",
    resolve: scopeLines,
  },
  price: {
    description: "Project price, flat number",
    sample: "3500",
    resolve: (ctx) => formatMoney(ctx.client?.projectPrice),
  },
  deposit: {
    description: "Deposit received, flat number",
    sample: "1750",
    resolve: (ctx) => formatMoney(ctx.client?.depositReceived),
  },
  balance: {
    description: "Remaining balance, flat number",
    sample: "1750",
    resolve: (ctx) => formatMoney(ctx.client?.projectBalance),
  },
  booking_link: {
    description: "Studio calendar URL (Automations settings)",
    sample: "https://cal.com/blokblok/kickoff",
    resolve: (ctx) => ctx.settings.bookingLink || null,
  },
  timeline_line: {
    description: "Build timeline line from the tier constants",
    sample: "Build: 4 to 6 weeks",
    resolve: (ctx) => {
      const tier = clientTier(ctx);
      return tier ? `Build: ${tier.timeline}` : null;
    },
  },
  target_date: {
    description: "Launch date if set, otherwise projected from signing plus the tier timeline",
    sample: "September 18, 2026",
    resolve: (ctx) => {
      const c = ctx.client;
      if (!c) return null;
      if (c.launchDate) return formatDate(c.launchDate);
      const tier = clientTier(ctx);
      if (c.contractSignedAt && tier?.timelineUpperWeeks) {
        return formatDate(addDays(c.contractSignedAt, tier.timelineUpperWeeks * 7));
      }
      return "we lock the exact date at kickoff";
    },
  },
  revision_rounds: {
    description: "Revision rounds for the tier",
    sample: "2",
    resolve: (ctx) => clientTier(ctx)?.revisions || null,
  },
  asset_checklist_link: {
    description: "Client's content upload portal (falls back to Automations settings link)",
    sample: "https://blokblokstudio-clients.vercel.app/u/abc123",
    resolve: (ctx) => {
      const c = ctx.client;
      if (c?.uploadToken) return `${ctx.settings.appUrl}/u/${c.uploadToken}`;
      return ctx.settings.assetChecklistLink || null;
    },
  },
  asset_deadline: {
    description: "Content deadline date",
    sample: "August 18, 2026",
    resolve: (ctx) => (ctx.client?.assetDeadline ? formatDate(ctx.client.assetDeadline) : null),
  },
  deadline_plus_7: {
    description: "Content deadline plus 7 days",
    sample: "August 25, 2026",
    resolve: (ctx) =>
      ctx.client?.assetDeadline ? formatDate(addDays(ctx.client.assetDeadline, 7)) : null,
  },
  url: {
    description: "Client's live website URL",
    sample: "https://kellerbakery.com",
    resolve: (ctx) => ctx.client?.websiteUrl || null,
  },
  date: {
    description: "Today's date",
    sample: "August 8, 2026",
    resolve: (ctx) => formatDate(ctx.now),
  },
  deliverables_list: {
    description: "Delivered items — the client's services on record, or the tier's default scope",
    sample: "Website design and build\nContact forms\nSearch engine setup",
    resolve: scopeLines,
  },
  support_end: {
    description: "Support period end date (launch plus 3, 6, 9 or 12 months by tier)",
    sample: "February 18, 2027",
    resolve: (ctx) => (ctx.client?.supportEnd ? formatDate(ctx.client.supportEnd) : null),
  },
  care_free_end: {
    description: "Free Care period end date (launch plus 3 months)",
    sample: "December 18, 2026",
    resolve: (ctx) => (ctx.client?.careFreeEnd ? formatDate(ctx.client.careFreeEnd) : null),
  },
  care_price: {
    description: "Monthly price of the client's Care tier",
    sample: "200",
    resolve: (ctx) =>
      ctx.client?.careTier ? String(CARE_TIER_PRICES[ctx.client.careTier]) : "200",
  },
  month: {
    description: "Current month name",
    sample: "August",
    resolve: (ctx) => ctx.now.toLocaleDateString("en-US", { month: "long" }),
  },
  n: {
    description: "Day number for review steps (30, 60, 90)",
    sample: "30",
    resolve: (ctx) => ctx.extra?.n || null,
  },
  // --- Human-filled placeholders (drafts and snippets only) ---
  uptime: { description: "Care stat: uptime percent", sample: "99.9", manual: true },
  patch_count: { description: "Care stat: updates and patches run", sample: "14", manual: true },
  backup_count: { description: "Care stat: backups taken", sample: "30", manual: true },
  hours_used: { description: "Care stat: edit hours used", sample: "1.5", manual: true },
  what_was_done: { description: "Care stat: what the edits were", sample: "menu update and two new photos", manual: true },
  hours_remaining: { description: "Care stat: edit hours left", sample: "0.5 hours", manual: true },
  phase: { description: "Phase being signed off", sample: "Design", manual: true },
  next_phase: { description: "Next phase", sample: "Build", manual: true },
  milestone: { description: "Next milestone", sample: "First build preview", manual: true },
  list: { description: "Agreed page list", sample: "Home, About, Menu, Contact", manual: true },
  summary: { description: "Design direction summary", sample: "warm, editorial, lots of photography", manual: true },
  vertical: { description: "Partner's client vertical", sample: "restaurant", manual: true },
  their_service: { description: "The partner's own service", sample: "brand photography", manual: true },
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTokens(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) found.add(m[1]);
  return [...found];
}

/** Tokens referenced in `text` that do not exist in the registry at all. */
export function unknownTokens(text: string): string[] {
  return extractTokens(text).filter((t) => !TOKEN_REGISTRY[t]);
}

/** Manual (human-filled) tokens referenced in `text`. */
export function manualTokens(text: string): string[] {
  return extractTokens(text).filter((t) => TOKEN_REGISTRY[t]?.manual);
}

export interface RenderResult {
  text: string;
  missing: string[]; // tokens that stayed unresolved (no data, or manual)
}

/**
 * Renders {{token}} merge fields against real data. Manual tokens are left
 * as-is (they surface in `missing` so auto-send can refuse; drafts keep them
 * for the human to fill).
 */
/**
 * Tokens that resolve to dollar amounts. Kanban task descriptions are visible
 * to the whole team, and tasks must never show invoice/price figures — renders
 * bound for a task pass redactMoney so these come out as a placeholder while
 * the real email/draft body keeps the numbers.
 */
const MONEY_TOKENS = new Set(["price", "deposit", "balance", "care_price"]);

export function renderTokens(
  text: string,
  ctx: RenderContext,
  opts?: { redactMoney?: boolean }
): RenderResult {
  const missing = new Set<string>();
  const rendered = text.replace(TOKEN_RE, (raw, name: string) => {
    if (opts?.redactMoney && MONEY_TOKENS.has(name)) return "[amount]";
    const def = TOKEN_REGISTRY[name];
    if (!def) {
      missing.add(name);
      return raw;
    }
    if (ctx.extra && ctx.extra[name] !== undefined) return ctx.extra[name];
    if (def.manual || !def.resolve) {
      missing.add(name);
      return raw;
    }
    const value = def.resolve(ctx);
    if (value === null || value === "") {
      missing.add(name);
      return raw;
    }
    return value;
  });
  return { text: rendered, missing: [...missing] };
}

/** Sample context for the admin editor's live preview and test sends. */
export function sampleRenderContext(
  tierConstants: Record<PackageTier, TierConstants>,
  settings: RenderContext["settings"]
): RenderContext {
  const now = new Date();
  const signed = addDays(now, -14);
  const launch = addDays(now, 28);
  const sampleClient = {
    id: "sample",
    name: "Maria Keller",
    email: "maria@kellerbakery.example",
    projectName: "Keller Bakery Website",
    packageTier: "ESSENTIAL",
    projectPrice: 3500,
    depositReceived: 1750,
    projectBalance: 1750,
    websiteUrl: "https://kellerbakery.example",
    contractSignedAt: signed,
    assetDeadline: addDays(signed, 10),
    launchDate: launch,
    supportEnd: addDays(launch, 183),
    careFreeEnd: addDays(launch, 92),
    careStatus: "FREE",
    careTier: "CARE",
    uploadToken: null,
    services: [],
  } as unknown as Client & { services: ClientService[] };
  return {
    client: sampleClient,
    tierConstants,
    settings,
    now,
    extra: { n: "30" },
  };
}
