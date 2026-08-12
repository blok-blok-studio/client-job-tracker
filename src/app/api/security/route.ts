import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/security — the signed-in user's own second-factor status
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { totpEnabled: true, pinHash: true, backupCodes: true, mfaUpdatedAt: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    success: true,
    data: {
      totpEnabled: user.totpEnabled,
      pinSet: !!user.pinHash,
      backupCodesRemaining: user.backupCodes.length,
      mfaUpdatedAt: user.mfaUpdatedAt,
    },
  });
}
