import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const createSchema = z.object({
  clientId: z.string().min(1),
  postIds: z.array(z.string().min(1)).min(1, "Pick at least one post").max(100),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(5000).optional().or(z.literal("")),
});

function approvalUrl(token: string): string {
  return `${APP_URL}/p/${token}`;
}

// GET ?clientId= — approval links for a client, newest first, with decision counts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ success: false, error: "clientId is required" }, { status: 400 });
  }

  // Cast: Prisma's include type inference is broken repo-wide
  const approvals = (await prisma.contentApproval.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      posts: { select: { id: true, platform: true, title: true, approvalStatus: true, approvalNote: true, scheduledAt: true } },
    },
  })) as unknown as Array<{
    id: string;
    token: string;
    title: string | null;
    message: string | null;
    status: string;
    createdBy: string | null;
    respondedAt: Date | null;
    createdAt: Date;
    posts: Array<{
      id: string;
      platform: string;
      title: string | null;
      approvalStatus: string | null;
      approvalNote: string | null;
      scheduledAt: Date | null;
    }>;
  }>;

  return NextResponse.json({
    success: true,
    data: approvals.map((a) => ({
      id: a.id,
      token: a.token,
      url: approvalUrl(a.token),
      title: a.title,
      message: a.message,
      status: a.status,
      createdBy: a.createdBy,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt,
      counts: {
        total: a.posts.length,
        pending: a.posts.filter((p) => p.approvalStatus === "PENDING").length,
        approved: a.posts.filter((p) => p.approvalStatus === "APPROVED").length,
        changesRequested: a.posts.filter((p) => p.approvalStatus === "CHANGES_REQUESTED").length,
      },
      posts: a.posts,
    })),
  });
}

// POST — send a set of posts to the client for sign-off
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ success: false, error: message || "Invalid request" }, { status: 400 });
  }

  const postIds = Array.from(new Set(parsed.postIds));
  const posts = await prisma.contentPost.findMany({
    where: { id: { in: postIds } },
    select: { id: true, clientId: true, status: true },
  });

  if (posts.length !== postIds.length || posts.some((p) => p.clientId !== parsed.clientId)) {
    return NextResponse.json(
      { success: false, error: "Some of those posts don't exist or belong to a different client." },
      { status: 400 }
    );
  }
  const locked = posts.filter((p) => p.status === "PUBLISHED" || p.status === "PUBLISHING");
  if (locked.length > 0) {
    return NextResponse.json(
      { success: false, error: "Posts that are publishing or already published can't be sent for approval." },
      { status: 409 }
    );
  }

  const token = randomBytes(16).toString("base64url");

  const approval = await prisma.$transaction(async (tx) => {
    const created = await tx.contentApproval.create({
      data: {
        token,
        clientId: parsed.clientId,
        title: parsed.title || null,
        message: parsed.message || null,
        createdBy: session.name,
      },
    });
    // Re-check status inside the transaction so a post the runner claimed in
    // the meantime isn't pulled into a review
    const { count } = await tx.contentPost.updateMany({
      where: { id: { in: postIds }, clientId: parsed.clientId, status: { notIn: ["PUBLISHED", "PUBLISHING"] } },
      data: { approvalId: created.id, approvalStatus: "PENDING", approvalNote: null },
    });
    if (count !== postIds.length) {
      throw new Error("A post started publishing while the link was being created. Try again.");
    }
    return created;
  }).catch((err: Error) => err);

  if (approval instanceof Error) {
    return NextResponse.json({ success: false, error: approval.message }, { status: 409 });
  }

  await prisma.activityLog
    .create({
      data: {
        clientId: parsed.clientId,
        actor: session.name,
        action: "content_approval_sent",
        details: `Sent ${postIds.length} post${postIds.length === 1 ? "" : "s"} for client approval${parsed.title ? `: ${parsed.title}` : ""}`,
      },
    })
    .catch(() => {});

  return NextResponse.json(
    { success: true, data: { id: approval.id, token, url: approvalUrl(token) } },
    { status: 201 }
  );
}
