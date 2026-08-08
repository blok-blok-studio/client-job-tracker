import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/lifecycle/settings";
import { getTierConstants, DEFAULT_TIER_CONSTANTS, CARE_TIER_PRICES } from "@/lib/lifecycle/tiers";

// GET /api/lifecycle/settings — booking link, master switch, tier constants
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    success: true,
    data: {
      bookingLink: await getSetting<string>("booking_link", ""),
      assetChecklistLink: await getSetting<string>("asset_checklist_link", ""),
      liveEmails: await getSetting<boolean>("lifecycle_live_emails", false),
      tierConstants: await getTierConstants(),
      tierDefaults: DEFAULT_TIER_CONSTANTS,
      careTierPrices: CARE_TIER_PRICES,
      isOwner: session.role === "OWNER",
    },
  });
}

const tierSchema = z.object({
  label: z.string().min(1),
  revisions: z.string().min(1),
  supportMonths: z.number().int().min(0).max(36),
  timeline: z.string().min(1),
  timelineUpperWeeks: z.number().int().min(1).max(52).nullable(),
  scopeBullets: z.array(z.string().min(1)).max(12),
});

const putSchema = z.object({
  bookingLink: z.string().url().or(z.literal("")).optional(),
  assetChecklistLink: z.string().url().or(z.literal("")).optional(),
  liveEmails: z.boolean().optional(), // owner only — the master send switch
  tierConstants: z
    .object({ LAUNCH: tierSchema, ESSENTIAL: tierSchema, GROWTH: tierSchema, SCALE: tierSchema })
    .optional(), // owner only
});

// PUT /api/lifecycle/settings
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  if ((d.tierConstants !== undefined || d.liveEmails !== undefined) && session.role !== "OWNER") {
    return NextResponse.json(
      { success: false, error: "Owner only: tier constants and the live email switch" },
      { status: 403 }
    );
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (d.bookingLink !== undefined) {
    changes.booking_link = { old: await getSetting("booking_link", ""), new: d.bookingLink };
    await setSetting("booking_link", d.bookingLink, session.name);
  }
  if (d.assetChecklistLink !== undefined) {
    changes.asset_checklist_link = {
      old: await getSetting("asset_checklist_link", ""),
      new: d.assetChecklistLink,
    };
    await setSetting("asset_checklist_link", d.assetChecklistLink, session.name);
  }
  if (d.liveEmails !== undefined) {
    changes.lifecycle_live_emails = {
      old: await getSetting("lifecycle_live_emails", false),
      new: d.liveEmails,
    };
    await setSetting("lifecycle_live_emails", d.liveEmails, session.name);
  }
  if (d.tierConstants !== undefined) {
    changes.tier_constants = { old: await getTierConstants(), new: d.tierConstants };
    await setSetting("tier_constants", d.tierConstants, session.name);
  }

  await prisma.activityLog.create({
    data: {
      actor: session.name,
      action: "lifecycle_settings_edited",
      details: JSON.stringify(changes),
    },
  });
  return NextResponse.json({ success: true });
}
