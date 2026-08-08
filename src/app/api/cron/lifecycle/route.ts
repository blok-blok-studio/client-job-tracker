import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processDueSteps, runRecurringGenerators } from "@/lib/lifecycle/engine";

export const maxDuration = 300;

function verifyBearerToken(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

/**
 * Lifecycle cron — every 15 minutes. Creates recurring steps (Friday updates,
 * quarterly recaps/touches, weekly contractor reviews, quarterly Care
 * check-ins) and processes every due scheduled step. Sends are triple-gated:
 * sequence enabled + live-emails master switch + not a dry-run record.
 */
export async function GET(request: NextRequest) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const generated = await runRecurringGenerators();
    const summary = await processDueSteps();
    console.log("[Cron:lifecycle]", JSON.stringify({ generated, summary }));
    return NextResponse.json({ success: true, generated, summary });
  } catch (err) {
    console.error("[Cron:lifecycle] error:", err);
    return NextResponse.json({ success: false, error: "Lifecycle cron failed" }, { status: 500 });
  }
}
