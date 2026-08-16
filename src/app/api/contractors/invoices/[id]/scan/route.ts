import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decryptBuffer } from "@/lib/encryption";
import { scanContractorInvoice } from "@/lib/invoice-scan";
import { getSession } from "@/lib/auth";

export const maxDuration = 300;

// POST /api/contractors/invoices/[id]/scan — (re)run the AI amount scan.
// Synchronous: returns the updated invoice when the scan completes.
// Owner-only: the scan is amount verification and the response carries amounts.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (session?.role !== "OWNER") {
      return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
    }

    const { id } = await params;

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
      fileBuffer = decryptBuffer(fileBuffer, invoice.encryptionIv);
    }

    await scanContractorInvoice(invoice.id, fileBuffer, invoice.contentType, invoice.filename);

    const updated = await prisma.contractorInvoice.findUnique({
      where: { id },
      include: {
        contractor: { select: { id: true, name: true, company: true } },
        notes: { orderBy: { createdAt: "asc" } },
        audits: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "Scan failed" }, { status: 500 });
  }
}
