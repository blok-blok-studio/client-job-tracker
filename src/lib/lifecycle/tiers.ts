import type { PackageTier, CareTier } from "@prisma/client";
import { getSetting } from "./settings";

/**
 * Tier constants — the single source of truth for revisions, support months,
 * and timelines. Used by merge tokens, computed dates, and the admin settings
 * table. Owner can override values via the `tier_constants` Setting; the
 * defaults below are the shipped values.
 */

export interface TierConstants {
  label: string;
  revisions: string; // "2", "3", or "priority"
  supportMonths: number;
  timeline: string; // plain copy, e.g. "2 to 3 weeks"
  timelineUpperWeeks: number | null; // null = scoped per project
  scopeBullets: string[]; // default scope lines when the client has no services on record
}

export const DEFAULT_TIER_CONSTANTS: Record<PackageTier, TierConstants> = {
  LAUNCH: {
    label: "Launch",
    revisions: "2",
    supportMonths: 3,
    timeline: "2 to 3 weeks",
    timelineUpperWeeks: 3,
    scopeBullets: [
      "A one page website designed and built for you",
      "Mobile friendly and fast",
      "Contact form and map",
      "Basic search engine setup",
    ],
  },
  ESSENTIAL: {
    label: "Essential",
    revisions: "2",
    supportMonths: 6,
    timeline: "4 to 6 weeks",
    timelineUpperWeeks: 6,
    scopeBullets: [
      "A website of up to 5 pages designed and built for you",
      "Mobile friendly and fast",
      "Contact forms and integrations",
      "Search engine setup",
    ],
  },
  GROWTH: {
    label: "Growth",
    revisions: "3",
    supportMonths: 9,
    timeline: "6 to 10 weeks",
    timelineUpperWeeks: 10,
    scopeBullets: [
      "A full custom website designed and built for you",
      "Mobile friendly and fast",
      "Forms, integrations and content structure",
      "Search engine setup and tracking",
    ],
  },
  SCALE: {
    label: "Scale",
    revisions: "priority",
    supportMonths: 12,
    timeline: "scoped",
    timelineUpperWeeks: null,
    scopeBullets: [
      "A custom web build scoped to your project",
      "Mobile friendly and fast",
      "Integrations and custom features as scoped",
      "Search engine setup and tracking",
    ],
  },
};

export const CARE_TIER_PRICES: Record<CareTier, number> = {
  CARE: 200,
  CARE_PLUS: 500,
  CARE_PRO: 1000,
};

/** Tier constants with any owner overrides from Settings applied. */
export async function getTierConstants(): Promise<Record<PackageTier, TierConstants>> {
  const overrides = await getSetting<Partial<Record<PackageTier, Partial<TierConstants>>>>(
    "tier_constants",
    {}
  );
  const merged = {} as Record<PackageTier, TierConstants>;
  for (const key of Object.keys(DEFAULT_TIER_CONSTANTS) as PackageTier[]) {
    merged[key] = { ...DEFAULT_TIER_CONSTANTS[key], ...(overrides?.[key] || {}) };
  }
  return merged;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp end-of-month overflow (e.g. Jan 31 + 1 month → Feb 28, not Mar 3)
  if (d.getDate() < day) d.setDate(0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function computeSupportEnd(
  launchDate: Date,
  tier: PackageTier | null,
  constants: Record<PackageTier, TierConstants>
): Date {
  const months = tier ? constants[tier].supportMonths : 3;
  return addMonths(launchDate, months);
}

export function computeCareFreeEnd(launchDate: Date): Date {
  return addMonths(launchDate, 3);
}
