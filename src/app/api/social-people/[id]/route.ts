import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// DELETE /api/social-people/[id] — forget a saved person. Posts that already
// tag them are untouched.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { count } = await prisma.socialPerson.deleteMany({ where: { id } });
  if (count === 0) {
    return NextResponse.json({ success: false, error: "Person not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
