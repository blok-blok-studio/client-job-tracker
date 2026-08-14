import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET — signature certificate for a contractor agreement: hashes, both
// signatures, and the full audit timeline.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Prisma's include-type inference is unreliable in this repo — spell the
    // shape out and cast, the same way the client-contract certificate does.
    const contract: {
      id: string;
      title: string;
      kind: string;
      status: string;
      country: string | null;
      createdAt: Date;
      documentHash: string | null;
      signedDocumentHash: string | null;
      providerSignedName: string | null;
      providerSignedAt: Date | null;
      providerIpAddress: string | null;
      providerUserAgent: string | null;
      signedName: string | null;
      signedAt: Date | null;
      ipAddress: string | null;
      userAgent: string | null;
      contractor: { name: string; company: string | null; country: string | null };
      auditLogs: {
        event: string;
        actor: string;
        ipAddress: string | null;
        userAgent: string | null;
        metadata: string | null;
        createdAt: Date;
      }[];
    } | null = (await prisma.contractorContract.findUnique({
      where: { token },
      include: {
        contractor: { select: { name: true, company: true, country: true } },
        auditLogs: { orderBy: { createdAt: "asc" } },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;

    if (!contract || contract.status === "DRAFT") {
      return NextResponse.json({ success: false, error: "Agreement not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        contractId: contract.id,
        title: contract.title,
        kind: contract.kind,
        contractorName: contract.contractor.name,
        company: contract.contractor.company,
        country: contract.country || contract.contractor.country,
        status: contract.status,
        createdAt: contract.createdAt,

        documentHash: contract.documentHash,
        signedDocumentHash: contract.signedDocumentHash,

        provider: {
          signedName: contract.providerSignedName,
          signedAt: contract.providerSignedAt,
          ipAddress: contract.providerIpAddress,
          userAgent: contract.providerUserAgent,
        },

        contractor: {
          signedName: contract.signedName,
          signedAt: contract.signedAt,
          ipAddress: contract.ipAddress,
          userAgent: contract.userAgent,
        },

        auditTrail: contract.auditLogs.map((log) => ({
          event: log.event,
          actor: log.actor,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          metadata: log.metadata ? JSON.parse(log.metadata) : null,
          timestamp: log.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Agreement certificate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build the certificate" },
      { status: 500 }
    );
  }
}
