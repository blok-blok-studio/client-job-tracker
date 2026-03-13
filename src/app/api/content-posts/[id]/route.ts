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

    const post = await prisma.contentPost.update({
      where: { id },
      data: {
        ...(parsed.clientId !== undefined ? { clientId: parsed.clientId } : {}),
        ...(parsed.platform !== undefined ? { platform: parsed.platform } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.title !== undefined ? { title: parsed.title || null } : {}),
        ...(parsed.body !== undefined ? { body: parsed.body || null } : {}),
        ...(parsed.hashtags !== undefined ? { hashtags: parsed.hashtags } : {}),
        ...(parsed.mediaUrls !== undefined ? { mediaUrls: parsed.mediaUrls } : {}),
        ...(parsed.scheduledAt !== undefined
          ? { scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null }
          : {}),
      },
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
