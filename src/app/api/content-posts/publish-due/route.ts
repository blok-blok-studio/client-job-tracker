import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishDuePosts } from "@/lib/social/publish-runner";
import crypto from "crypto";

function timingSafeTokenCheck(token: string | undefined, secret: string | undefined): boolean {
  if (!token || !secret) return false;
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

// GET: Count posts due for publishing — requires auth
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;

  if (!timingSafeTokenCheck(token, cronSecret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const duePosts = await prisma.contentPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
      NOT: {
        platform: { in: ["TWITTER", "THREADS"] },
        client: { name: { contains: "Chase Haynes" } },
      },
    },
    select: { id: true, platform: true, status: true, scheduledAt: true, title: true },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ success: true, count: duePosts.length });
}

// POST: Publish all due posts — same shared runner as the cron
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;

  if (!timingSafeTokenCheck(token, cronSecret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const run = await publishDuePosts({ actor: "api" });
  return NextResponse.json({ success: true, ...run });
}
