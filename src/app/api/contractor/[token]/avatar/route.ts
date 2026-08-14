import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { isAllowedBlobUrl } from "@/lib/blob-fetch";
import { requestMeta } from "@/lib/request-meta";

const schema = z.object({
  blobUrl: z.string().url(),
});

// POST /api/contractor/[token]/avatar — contractor sets their own profile photo.
// The blob is already uploaded (browser → Vercel Blob via the shared upload-blob
// token handler); we only record the URL. Selfies are not sensitive documents, so
// unlike invoices they are stored as-is rather than encrypted.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
    }

    const contractor = await prisma.contractor.findUnique({
      where: { uploadToken: token },
      select: { id: true, name: true, isActive: true },
    });
    if (!contractor || !contractor.isActive) {
      return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    if (!isAllowedBlobUrl(parsed.data.blobUrl)) {
      return NextResponse.json({ success: false, error: "Unsupported file location" }, { status: 400 });
    }

    const { ipAddress } = requestMeta(request);

    await prisma.contractor.update({
      where: { id: contractor.id },
      data: { avatarUrl: parsed.data.blobUrl, avatarUpdatedAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        actor: "contractor",
        action: "contractor_avatar_updated",
        details: `${contractor.name} updated their profile photo${ipAddress ? ` (IP: ${ipAddress})` : ""}`,
      },
    });

    return NextResponse.json({ success: true, data: { avatarUrl: parsed.data.blobUrl } });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to save the photo" }, { status: 500 });
  }
}
