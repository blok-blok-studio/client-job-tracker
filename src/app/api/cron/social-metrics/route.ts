import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { refreshPostMetrics } from "@/lib/social/metrics";

export const maxDuration = 300;

function verifyBearerToken(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

/** Hourly: pull views/likes/comments for recently published posts. */
export async function GET(request: NextRequest) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await refreshPostMetrics();
  if (result.errors.length) console.error("[social-metrics]", result.errors);
  return NextResponse.json({ success: true, ...result });
}
