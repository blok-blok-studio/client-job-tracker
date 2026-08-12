import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { decryptBuffer } from "@/lib/encryption";

export const maxDuration = 60;

// GET /api/compliance/documents/[id]/file — decrypt and serve an uploaded tax
// document (e.g. a W-9). Auth-gated by middleware; every view is activity-logged.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    // Tax documents can contain SSNs/TINs (W-9, W-8BEN) — owner-only decryption.
    if (session?.role !== "OWNER") {
      return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
    }

    const doc = await prisma.taxDocument.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        fileUrl: true,
        filename: true,
        contentType: true,
        encrypted: true,
        encryptionIv: true,
        contractor: { select: { name: true } },
        client: { select: { name: true } },
      },
    });
    if (!doc || !doc.fileUrl) {
      return NextResponse.json({ success: false, error: "No file on this document" }, { status: 404 });
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

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "tax_document_viewed",
        details: `Viewed ${doc.type} file for ${doc.contractor?.name || doc.client?.name || "unknown"}`,
      },
    });

    const safeName = (doc.filename || `${doc.type}.bin`).replace(/[^\w.\- ]/g, "_").slice(0, 150);
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": doc.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load file" }, { status: 500 });
  }
}
