import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/lifecycle/settings";

// GET /api/compliance/settings — master reminder switch + role
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    success: true,
    data: {
      remindersEnabled: await getSetting<boolean>("tax_reminders_enabled", false),
      isOwner: session.role === "OWNER",
    },
  });
}

const putSchema = z.object({
  remindersEnabled: z.boolean(),
});

// PUT /api/compliance/settings — owner-only master switch for Slack reminders
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { success: false, error: "Owner only: the reminder master switch" },
      { status: 403 }
    );
  }

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  await setSetting("tax_reminders_enabled", parsed.data.remindersEnabled, session.name);
  await prisma.activityLog.create({
    data: {
      actor: session.name,
      action: "tax_reminders_toggled",
      details: `Tax deadline reminders ${parsed.data.remindersEnabled ? "ENABLED" : "disabled"}`,
    },
  });

  return NextResponse.json({ success: true, data: { remindersEnabled: parsed.data.remindersEnabled } });
}
