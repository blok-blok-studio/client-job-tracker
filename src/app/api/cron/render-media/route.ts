import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { renderPendingRenditions } from "@/lib/social/renditions";

export const maxDuration = 800;

function verifyBearerToken(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

/**
 * Every minute: render queued formatted copies (9:16 with black bars, etc.).
 * Overlapping runs are safe; each file is leased before it's rendered.
 */
export async function GET(request: NextRequest) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await renderPendingRenditions({ budgetMs: 700_000 });
  return NextResponse.json({ success: true, ...result });
}
