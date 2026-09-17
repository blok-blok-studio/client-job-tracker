import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { renderContractPdf } from "@/lib/contract-pdf";

// GET — Download signed contract as PDF
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const contract = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: { select: { name: true, company: true } },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Contract not found" },
        { status: 404 }
      );
    }

    const clientLabel = contract.client.company || contract.client.name;

    const pdfBytes = await renderContractPdf({
      documentLabel: contract.title || "Service Agreement",
      counterpartyLabel: clientLabel,
      counterpartyRole: "Client",
      contractBody: contract.contractBody,
      providerSignedName: contract.providerSignedName,
      providerSignatureData: contract.providerSignatureData,
      providerSignedAt: contract.providerSignedAt,
      signedName: contract.signedName,
      signatureData: contract.signatureData,
      signedAt: contract.signedAt,
      documentHash: contract.documentHash,
      signedDocumentHash: contract.signedDocumentHash,
      providerIpAddress: contract.providerIpAddress,
      signerIpAddress: contract.ipAddress,
    });

    const clientName = contract.client.name.replace(/[^a-zA-Z0-9]/g, "-");
    const docSlug = contract.kind === "NDA" ? "NDA" : contract.kind === "SOCIAL_MEDIA" ? "Social-Media-Agreement" : "Agreement";
    const filename = `Blok-Blok-Studio-${docSlug}-${clientName}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
