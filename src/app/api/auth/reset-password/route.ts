import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPasswordResetToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";

// Sets a new password from an emailed reset link. Deliberately does NOT sign
// the user in: they go back to /login, so accounts with 2FA still need their
// authenticator code. Owning the inbox alone is never enough to get in.
export async function POST(request: NextRequest) {
  const meta = requestMeta(request);

  const rl = rateLimit(meta.ipAddress || "unknown", { max: 10, windowMs: 15 * 60 * 1000, prefix: "reset-password" });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const userId = token
    ? await verifyPasswordResetToken(token, async (id) => {
        const u = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true, isActive: true } });
        return u?.isActive ? u.passwordHash : null;
      })
    : null;
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link has expired or was already used. Ask for a new one." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (password.length > 200) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password) },
    select: { name: true },
  });

  await prisma.activityLog
    .create({
      data: {
        actor: user.name,
        action: "account_password_reset",
        details: `${user.name} reset their password from an emailed link${meta.ipAddress ? ` (IP: ${meta.ipAddress})` : ""}`,
        ...meta,
      },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
