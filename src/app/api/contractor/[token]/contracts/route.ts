import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/contractor/[token]/contracts — the agreements this contractor can see
// from their portal. Drafts are excluded (not released yet); signed ones stay
// listed forever so they always have their copy.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const contractor = await prisma.contractor.findUnique({
    where: { uploadToken: token },
    select: { id: true, isActive: true },
  });
  if (!contractor || !contractor.isActive) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const contracts = await prisma.contractorContract.findMany({
    where: { contractorId: contractor.id, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      kind: true,
      title: true,
      status: true,
      signedName: true,
      signedAt: true,
      expiresAt: true,
      createdAt: true,
      providerSignedName: true,
    },
  });

  return NextResponse.json({ success: true, data: { contracts } });
}
