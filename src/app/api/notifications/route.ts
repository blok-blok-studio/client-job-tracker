import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/notifications — the signed-in user's inbox (newest first) + unread count
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 30), 100);
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: session.id, readAt: null } }),
  ]);

  return NextResponse.json({ success: true, data: { notifications, unread } });
}

// PATCH /api/notifications — mark read: { ids: [...] } or { all: true }
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const now = new Date();

  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { userId: session.id, readAt: null },
      data: { readAt: now },
    });
    return NextResponse.json({ success: true });
  }

  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "ids or all required" }, { status: 400 });
  }

  // userId in the where keeps one user from marking another's rows
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: session.id },
    data: { readAt: now },
  });
  return NextResponse.json({ success: true });
}
