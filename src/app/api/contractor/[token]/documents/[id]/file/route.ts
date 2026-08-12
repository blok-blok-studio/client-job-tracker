import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decryptBuffer } from "@/lib/encryption";
import { requestMeta } from "@/lib/request-meta";

export const maxDuration = 60;

// GET /api/contractor/[token]/documents/[id]/file — token-scoped download of a
// tax document belonging to THIS contractor (e.g. their countersigned agreement
// or 1099 copy we uploaded for them). Decrypted on the fly; every download is
// activity-logged with IP/user-agent.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  try {
    const { token, id } = await params;
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

    const doc = await prisma.taxDocument.findFirst({
      where: { id, contractorId: contractor.id },
      select: {
        id: true,
        type: true,
        fileUrl: true,
        filename: true,
        contentType: true,
        encrypted: true,
        encryptionIv: true,
      },
    });
    if (!doc || !doc.fileUrl) {
      return NextResponse.json({ success: false, error: "No file available" }, { status: 404 });
    }

    const blobRes = await fetch(doc.fileUrl);
    if (!blobRes.ok) {
      return NextResponse.json({ success: false, error: "File unavailable" }, { status: 502 });
    }
    let fileBuffer: Buffer = Buffer.from(await blobRes.arrayBuffer());

    if (doc.encrypted && doc.encryptionIv) {
      try {
        fileBuffer = decryptBuffer(fileBuffer, doc.encryptionIv);
      } catch {
        return NextResponse.json({ success: false, error: "Decryption failed" }, { status: 500 });
      }
    }

    const { ipAddress, userAgent } = requestMeta(request);
    await prisma.activityLog.create({
      data: {
        actor: "contractor",
        action: "tax_document_downloaded",
        details: `${contractor.name} downloaded ${doc.type} from their portal`,
        ipAddress,
        userAgent,
      },
    });

    const safeName = (doc.filename || `${doc.type}.bin`).replace(/[^\w.\- ]/g, "_").slice(0, 150);
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": doc.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load file" }, { status: 500 });
  }
}
