import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Profile color lives in the DB, not the JWT, so it reflects edits instantly
  const profile = await prisma.user.findUnique({
    where: { id: session.id },
    select: { color: true, allowedPages: true },
  });
  return NextResponse.json({ user: { ...session, color: profile?.color || null, allowedPages: profile?.allowedPages || [] } });
}
