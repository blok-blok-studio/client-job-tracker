import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

// Same answer whether or not the email has an account, so this can't be used
// to find out who has a login. The email itself sends after the response
// (next/server after()), which also keeps the timing identical.
const GENERIC_RESPONSE = {
  success: true,
  message: "If that email has a login, a reset link is on its way.",
};

export async function POST(request: NextRequest) {
  const meta = requestMeta(request);
  const ip = meta.ipAddress || "unknown";

  const rl = rateLimit(ip, { max: 5, windowMs: 15 * 60 * 1000, prefix: "forgot-password" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many reset requests. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  // Also cap per address so one inbox can't be flooded from rotating IPs
  const perEmail = rateLimit(email, { max: 3, windowMs: 60 * 60 * 1000, prefix: "forgot-password-email" });
  if (!perEmail.allowed) return NextResponse.json(GENERIC_RESPONSE);

  after(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      await prisma.activityLog
        .create({ data: { actor: email, action: "password_reset_requested", details: "Password reset asked for an email with no active login", ...meta } })
        .catch(() => {});
      return;
    }

    const token = createPasswordResetToken(user);
    // Token rides in the URL fragment so it never reaches server or proxy logs
    const resetUrl = `${APP_URL}/reset-password#${token}`;

    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      await prisma.activityLog
        .create({ data: { actor: user.name, action: "password_reset_requested", details: `Password reset link emailed to ${user.name}`, ...meta } })
        .catch(() => {});
    } catch (err) {
      console.error("[forgot-password] email failed:", err);
      await prisma.activityLog
        .create({ data: { actor: user.name, action: "password_reset_email_failed", details: `Password reset email to ${user.name} failed to send`, ...meta } })
        .catch(() => {});
    }
  });

  return NextResponse.json(GENERIC_RESPONSE);
}
