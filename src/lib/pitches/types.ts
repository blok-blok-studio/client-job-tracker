import { z } from "zod";
import { PROOF_KEYS } from "./proof";

export const SECTION_KEYS = ["hook", "research", "problem", "proposal", "whyUs", "investment", "timeline", "ask"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type PitchSections = Partial<Record<SectionKey, string>>;

/** Heading on the PDF page and the label + hint in the editor. */
export const SECTION_META: Record<SectionKey, { brand: string; internal: string; hint: string }> = {
  hook: { brand: "Why we reached out", internal: "The idea in one line", hint: "One or two sentences. What made you pick this brand?" },
  research: { brand: "What we found", internal: "What I found", hint: "Your research: their site, socials, reviews, competitors. Start a line with - for a bullet." },
  problem: { brand: "The opportunity", internal: "The problem or opportunity", hint: "What is costing them customers or money right now?" },
  proposal: { brand: "What we would build", internal: "What I want to pitch them", hint: "The work, in plain words. Bullets work well." },
  whyUs: { brand: "Why Blok Blok", internal: "Why we win this", hint: "Why us and not another agency." },
  investment: { brand: "Investment", internal: "Price and effort", hint: "Optional. Leave empty to keep the price out of the deck." },
  timeline: { brand: "Timeline", internal: "Timeline", hint: "Optional. Phases or weeks." },
  ask: { brand: "Next step", internal: "What I need from you", hint: "The one thing you want them to do next." },
};

const text = z.string().max(6000);
export const sectionsSchema = z.object(Object.fromEntries(SECTION_KEYS.map((k) => [k, text.optional()])) as Record<SectionKey, z.ZodOptional<typeof text>>);

export const statSchema = z.object({
  value: z.string().trim().min(1).max(24),
  label: z.string().trim().min(1).max(80),
  source: z.string().trim().max(120).optional().nullable(),
});

const url = z
  .string()
  .trim()
  .max(300)
  .transform((s) => s.replace(/^https?:\/\//i, "").replace(/\/+$/, ""));

export const pitchInputSchema = z.object({
  kind: z.enum(["INTERNAL", "BRAND"]).optional(),
  status: z.enum(["DRAFT", "READY", "SENT", "WON", "LOST"]).optional(),
  title: z.string().trim().min(1).max(140).optional(),
  brandName: z.string().trim().min(1).max(120).optional(),
  brandWebsite: url.nullable().optional(),
  brandIndustry: z.string().trim().max(120).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  recipient: z.string().trim().max(120).nullable().optional(),
  clientId: z.string().max(40).nullable().optional(),
  sections: sectionsSchema.optional(),
  stats: z.array(statSchema).max(4).optional(),
  proof: z.array(z.enum(PROOF_KEYS as [string, ...string[]])).max(4).optional(),
});
export type PitchInput = z.infer<typeof pitchInputSchema>;

export interface PitchStat { value: string; label: string; source?: string | null }
