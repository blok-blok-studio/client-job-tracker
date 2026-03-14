import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contentPostSchema } from "@/lib/validations";

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

    const data: Record<string, unknown> = {};
    if (parsed.clientId !== undefined) data.clientId = parsed.clientId;
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

    const post = await prisma.contentPost.update({
      where: { id },
      data,
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
    await prisma.contentPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
