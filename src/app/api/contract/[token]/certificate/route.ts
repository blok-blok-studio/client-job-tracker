import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET — Return audit certificate for a signed contract
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const contract: {
      id: string;
      status: string;
      createdAt: Date;
      contractBody: string;
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
      client: { name: string; company: string | null };
      auditLogs: {
        event: string;
        actor: string;
        ipAddress: string | null;
        userAgent: string | null;
        metadata: string | null;
        createdAt: Date;
      }[];
    } | null = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: { select: { name: true, company: true } },
        auditLogs: { orderBy: { createdAt: "asc" } },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Contract not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        contractId: contract.id,
        clientName: contract.client.name,
        company: contract.client.company,
        status: contract.status,
        createdAt: contract.createdAt,

        // Document integrity
        documentHash: contract.documentHash,
        signedDocumentHash: contract.signedDocumentHash,

        // Provider signature
        provider: {
          signedName: contract.providerSignedName,
          signedAt: contract.providerSignedAt,
          ipAddress: contract.providerIpAddress,
          userAgent: contract.providerUserAgent,
        },

        // Client signature
        client: {
          signedName: contract.signedName,
          signedAt: contract.signedAt,
          ipAddress: contract.ipAddress,
          userAgent: contract.userAgent,
        },

        // Full audit timeline
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
    console.error("Certificate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate certificate" },
      { status: 500 }
    );
  }
}
