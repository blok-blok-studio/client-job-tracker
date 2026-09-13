import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { cancelInFlightPost } from "@/lib/social/publish-runner";
import { contentPostSchema, USER_SETTABLE_POST_STATUSES } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await prisma.contentPost.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });

  if (!post) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: post });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = contentPostSchema.partial().parse(body);

    let current = await prisma.contentPost.findUnique({ where: { id }, select: { status: true } });
    if (!current) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // While the runner is sending, the post is frozen: an edit could change
    // what's half-uploaded or re-queue something that already went out. Where
    // the platform can pull it back (YouTube uploaded early, not live yet),
    // cancel first and apply the edit to the returned draft.
    if (current.status === "PUBLISHING") {
      const session = await getSession();
      const cancelled = await cancelInFlightPost(id, session?.name || "team");
      if (!cancelled.ok) {
        return NextResponse.json({ success: false, error: cancelled.error }, { status: cancelled.status });
      }
      current = await prisma.contentPost.findUnique({ where: { id }, select: { status: true } });
      if (!current) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (parsed.status !== undefined && !(USER_SETTABLE_POST_STATUSES as readonly string[]).includes(parsed.status)) {
      return NextResponse.json(
        { success: false, error: "That status is set by the publisher. Use Mark as posted for manual posts." },
        { status: 400 }
      );
    }
    // A published post can be edited for the record, but never re-queued
    if (current.status === "PUBLISHED" && parsed.status !== undefined) {
      return NextResponse.json(
        { success: false, error: "This post is already published. Duplicate it to post again." },
        { status: 409 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.clientId !== undefined) data.clientId = parsed.clientId;
    if (parsed.credentialId !== undefined) data.credentialId = parsed.credentialId || null;
    if (parsed.platform !== undefined) data.platform = parsed.platform;
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.title !== undefined) data.title = parsed.title || null;
    if (parsed.body !== undefined) data.body = parsed.body || null;
    if (parsed.hashtags !== undefined) data.hashtags = parsed.hashtags;
    if (parsed.mediaUrls !== undefined) data.mediaUrls = parsed.mediaUrls;
    if (parsed.scheduledAt !== undefined) data.scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt) : null;
    if (parsed.location !== undefined) data.location = parsed.location || null;
    if (parsed.locationLat !== undefined) data.locationLat = parsed.locationLat;
    if (parsed.locationLng !== undefined) data.locationLng = parsed.locationLng;
    if (parsed.taggedUsers !== undefined) data.taggedUsers = parsed.taggedUsers;
    if (parsed.collaborators !== undefined) data.collaborators = parsed.collaborators;
    if (parsed.altText !== undefined) data.altText = parsed.altText || null;
    if (parsed.coverImageUrl !== undefined) data.coverImageUrl = parsed.coverImageUrl || null;
    if (parsed.thumbnailUrl !== undefined) data.thumbnailUrl = parsed.thumbnailUrl || null;
    if (parsed.firstComment !== undefined) data.firstComment = parsed.firstComment || null;
    if (parsed.platformSettings !== undefined) data.platformSettings = parsed.platformSettings;
    if (parsed.visibility !== undefined) data.visibility = parsed.visibility;
    if (parsed.enableComments !== undefined) data.enableComments = parsed.enableComments;
    if (parsed.groupId !== undefined) data.groupId = parsed.groupId || null;
    if (parsed.publishMode !== undefined) data.publishMode = parsed.publishMode;
    if (parsed.assignedToId !== undefined) data.assignedToId = parsed.assignedToId || null;
    if (parsed.holdForApproval) {
      data.approvalStatus = "PENDING";
      data.approvalNote = null;
    }
    // Re-scheduling a failed post clears the old error and resume state
    if (parsed.status === "SCHEDULED" && current.status !== "SCHEDULED") {
      data.publishError = null;
      data.publishPhase = null;
      data.publishState = Prisma.DbNull;
      data.pollLockedUntil = null;
    }

    // Write only if the status is still what we checked: the per-minute
    // publisher may have claimed the post since, and an edit must never land
    // on a post that's mid-publish.
    const { count } = await prisma.contentPost.updateMany({
      where: { id, status: current.status },
      data,
    });
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "This post changed while you were editing (it may have started publishing). Reload and try again." },
        { status: 409 }
      );
    }

    const post = await prisma.contentPost.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: post });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update content post";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const existing = await prisma.contentPost.findUnique({ where: { id }, select: { status: true } });
    if (existing?.status === "PUBLISHING") {
      const session = await getSession();
      const cancelled = await cancelInFlightPost(id, session?.name || "team");
      if (!cancelled.ok) {
        return NextResponse.json({ success: false, error: cancelled.error }, { status: cancelled.status });
      }
    }
    const { count } = await prisma.contentPost.deleteMany({ where: { id, status: { not: "PUBLISHING" } } });
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "This post is being published right now, or no longer exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
