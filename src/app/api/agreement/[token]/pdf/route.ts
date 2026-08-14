import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { renderContractPdf } from "@/lib/contract-pdf";

// GET — download the contractor agreement as a branded PDF
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const contract = await prisma.contractorContract.findUnique({
      where: { token },
      include: { contractor: { select: { name: true, company: true } } },
    });

    if (!contract || contract.status === "DRAFT") {
      return NextResponse.json({ success: false, error: "Agreement not found" }, { status: 404 });
    }

    const label = contract.contractor.company || contract.contractor.name;

    const pdfBytes = await renderContractPdf({
      documentLabel: contract.title,
      counterpartyLabel: label,
      counterpartyRole: "Contractor",
      contractBody: contract.contractBody,
      providerSignedName: contract.providerSignedName,
      providerSignatureData: contract.providerSignatureData,
      providerSignedAt: contract.providerSignedAt,
      signedName: contract.signedName,
      signatureData: contract.signatureData,
      signedAt: contract.signedAt,
      documentHash: contract.documentHash,
      signedDocumentHash: contract.signedDocumentHash,
    });

    const safeName = contract.contractor.name.replace(/[^a-zA-Z0-9]/g, "-");
    const safeTitle = contract.title.replace(/[^a-zA-Z0-9]/g, "-");
    const filename = `Blok-Blok-Studio-${safeTitle}-${safeName}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Agreement PDF error:", error);
    return NextResponse.json({ success: false, error: "Failed to generate PDF" }, { status: 500 });
  }
}
