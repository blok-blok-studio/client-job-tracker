import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const bodySchema = z.object({
  externalUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Paste the full post link, starting with https://"),
});

/**
 * POST — a teammate posted an ASSISTED post by hand. Records it as published.
 * Allowed from ACTION_NEEDED (the handoff fired), or early from DRAFT/SCHEDULED
 * when the post is in manual mode.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ success: false, error: message || "Invalid request" }, { status: 400 });
  }

  const post = await prisma.contentPost.findUnique({
    where: { id },
    select: { id: true, clientId: true, platform: true, title: true, status: true, publishMode: true },
  });
  if (!post) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Guard in the update itself so a concurrent runner/edit can't be overwritten
  const { count } = await prisma.contentPost.updateMany({
    where: {
      id,
      OR: [
        { status: "ACTION_NEEDED" },
        { status: { in: ["DRAFT", "SCHEDULED"] }, publishMode: "ASSISTED" },
      ],
    },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      externalUrl: parsed.externalUrl || null,
      publishError: null,
      publishPhase: null,
      publishState: Prisma.DbNull,
      pollLockedUntil: null,
    },
  });

  if (count !== 1) {
    return NextResponse.json(
      {
        success: false,
        error:
          post.status === "PUBLISHED"
            ? "This post is already marked as posted."
            : "Only manual posts can be marked as posted.",
      },
      { status: 409 }
    );
  }

  await prisma.activityLog
    .create({
      data: {
        clientId: post.clientId,
        actor: session.name,
        action: "content_published",
        details: `Posted ${post.platform} post by hand: ${post.title || "(untitled)"}${parsed.externalUrl ? ` (${parsed.externalUrl})` : ""}`,
      },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
