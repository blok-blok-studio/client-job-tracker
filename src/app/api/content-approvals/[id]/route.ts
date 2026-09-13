import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// DELETE — revoke an approval link. Its posts go back to "no approval requested".
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const approval = await prisma.contentApproval.findUnique({
    where: { id },
    select: { id: true, clientId: true, title: true },
  });
  if (!approval) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const [cleared] = await prisma.$transaction([
    prisma.contentPost.updateMany({
      where: { approvalId: id },
      data: { approvalId: null, approvalStatus: null, approvalNote: null },
    }),
    prisma.contentApproval.delete({ where: { id } }),
  ]);

  await prisma.activityLog
    .create({
      data: {
        clientId: approval.clientId,
        actor: session.name,
        action: "content_approval_revoked",
        details: `Revoked client approval link${approval.title ? ` "${approval.title}"` : ""} (${cleared.count} post${cleared.count === 1 ? "" : "s"})`,
      },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
