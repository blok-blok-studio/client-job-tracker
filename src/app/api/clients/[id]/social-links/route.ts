import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { syncEvent } from "@/lib/sync";

const socialLinkSchema = z.object({
  platform: z.string().min(1).max(100),
  url: z.string().url().max(500),
  handle: z.string().max(200).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = socialLinkSchema.parse(body);
    const link = await prisma.socialLink.create({
      data: { clientId: id, ...parsed },
    });

    syncEvent({ type: "social_link_added", clientId: id, platform: parsed.platform }).catch(() => {});

    return NextResponse.json({ success: true, data: link });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add social link" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");
    if (!linkId) {
      return NextResponse.json({ success: false, error: "linkId required" }, { status: 400 });
    }
    await prisma.socialLink.delete({ where: { id: linkId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete social link" }, { status: 500 });
  }
}
