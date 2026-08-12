import { NextRequest, NextResponse } from "next/server";
import {
  verifyMfaToken,
  createSessionToken,
  getSessionCookieConfig,
  checkRateLimit,
  verifyPin,
} from "@/lib/auth";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { verifyTotp } from "@/lib/totp";
import { decryptField } from "@/lib/encryption";
import bcrypt from "bcryptjs";

// Second step of login: exchange a valid mfaToken (proving the password step
// passed) plus a TOTP code and/or PIN for a real session. Rate-limited by IP on
// the same brute-force budget as the password step.
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";

  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil((rl.retryAfter || 900) / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 900) } }
    );
  }

  try {
    const { mfaToken, code, pin } = await request.json();
    const userId = typeof mfaToken === "string" ? verifyMfaToken(mfaToken) : null;
    if (!userId) {
      return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });
    }

    const meta = requestMeta(request);
    const fail = async (msg: string) => {
      await prisma.activityLog.create({
        data: { actor: user.name, action: "login_mfa_failed", details: "Failed second-factor attempt", ...meta },
      }).catch(() => {});
      return NextResponse.json({ error: msg }, { status: 401 });
    };

    // Verify EVERY factor the user has configured (both, if both are set).
    let usedBackupCode = false;

    if (user.totpEnabled) {
      const providedCode = typeof code === "string" ? code.trim() : "";
      const secret = user.totpSecret ? decryptField(user.totpSecret.split(":")[1], user.totpSecret.split(":")[0]) : "";
      const totpOk = !!secret && secret !== "[DECRYPTION_ERROR]" && verifyTotp(secret, providedCode);

      // Fall back to a one-time backup code if the authenticator code fails
      let backupOk = false;
      if (!totpOk && /^[a-f0-9]{5}-[a-f0-9]{5}$/i.test(providedCode)) {
        const idx = user.backupCodes.findIndex((h) => bcrypt.compareSync(providedCode.toLowerCase(), h));
        if (idx !== -1) {
          backupOk = true;
          usedBackupCode = true;
          const remaining = [...user.backupCodes];
          remaining.splice(idx, 1);
          await prisma.user.update({ where: { id: user.id }, data: { backupCodes: remaining } });
        }
      }
      if (!totpOk && !backupOk) return fail("Incorrect authentication code.");
    }

    if (user.pinHash) {
      const providedPin = typeof pin === "string" ? pin.trim() : "";
      if (!providedPin || !verifyPin(providedPin, user.pinHash)) return fail("Incorrect PIN.");
    }

    // All configured factors passed — issue the session.
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    await prisma.activityLog.create({
      data: {
        actor: user.name,
        action: "login",
        details: `${user.name} signed in (2FA${usedBackupCode ? ", backup code" : ""})`,
        ...meta,
      },
    }).catch(() => {});

    const token = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    const response = NextResponse.json({
      success: true,
      user: { name: user.name, email: user.email, role: user.role },
      backupCodeUsed: usedBackupCode,
    });
    response.cookies.set(getSessionCookieConfig(token));
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
