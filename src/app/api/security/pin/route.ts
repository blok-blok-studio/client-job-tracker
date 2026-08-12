import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getSession, hashPin } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";

// Self-service PIN management. A PIN is an optional extra numeric factor asked
// for at login alongside (or instead of) the authenticator code. Password-gated.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action, password, pin } = body as { action?: string; password?: string; pin?: string };

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!password || typeof password !== "string" || !bcrypt.compareSync(password, user.passwordHash)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  const meta = requestMeta(request);

  if (action === "set") {
    if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4 to 8 digits." }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: hashPin(pin), mfaUpdatedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: { actor: user.name, action: "mfa_pin_set", details: `${user.name} set a login PIN`, ...meta },
    }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  if (action === "clear") {
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: null, mfaUpdatedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: { actor: user.name, action: "mfa_pin_cleared", details: `${user.name} removed their login PIN`, ...meta },
    }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
