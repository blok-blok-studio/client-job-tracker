import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { decryptBuffer } from "@/lib/encryption";
import { requestMeta } from "@/lib/request-meta";

export const maxDuration = 60;

// GET /api/contractors/invoices/[id]/file — decrypt and serve the invoice file.
// Auth-gated by middleware; every view is stamped into the audit trail.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    const invoice = await prisma.contractorInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        fileUrl: true,
        filename: true,
        contentType: true,
        encrypted: true,
        encryptionIv: true,
      },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const blobRes = await fetch(invoice.fileUrl);
    if (!blobRes.ok) {
      return NextResponse.json({ success: false, error: "File unavailable" }, { status: 502 });
    }
    let fileBuffer: Buffer = Buffer.from(await blobRes.arrayBuffer());

    if (invoice.encrypted && invoice.encryptionIv) {
      try {
        fileBuffer = decryptBuffer(fileBuffer, invoice.encryptionIv);
      } catch {
        return NextResponse.json({ success: false, error: "Decryption failed" }, { status: 500 });
      }
    }

    const { ipAddress, userAgent } = requestMeta(request);
    await prisma.contractorInvoiceAudit.create({
      data: {
        invoiceId: invoice.id,
        event: "file_viewed",
        actor: session?.name || "team",
        ipAddress,
        userAgent,
      },
    });

    // Sanitize the stored filename before echoing it into a header
    const safeName = invoice.filename.replace(/[^\w.\- ]/g, "_").slice(0, 150) || "invoice";
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": invoice.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load file" }, { status: 500 });
  }
}
