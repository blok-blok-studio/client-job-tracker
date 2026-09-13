import { NextRequest, NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/social/publish-runner";
import crypto from "crypto";

function verifyBearerToken(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

/**
 * Vercel Cron calls this every minute via GET.
 * Publishes due posts; overlapping runs are safe (see publish-runner).
 */
export async function GET(request: NextRequest) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await publishDuePosts({ actor: "cron" });
  return NextResponse.json({ success: true, ...run });
}
