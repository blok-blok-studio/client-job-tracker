import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET — All contracts across all clients (historical archive)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const year = searchParams.get("year") || undefined;

    const where: Prisma.ContractSignatureWhereInput = {};
    if (status) where.status = status as Prisma.ContractSignatureWhereInput["status"];
    if (year) {
      const y = Number(year);
      where.createdAt = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }

    const contracts = await prisma.contractSignature.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        status: true,
        signedName: true,
        signedAt: true,
        providerSignedName: true,
        documentHash: true,
        createdAt: true,
        client: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({ success: true, data: contracts });
  } catch (error) {
    console.error("Failed to fetch contracts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}
