import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import { getSession, hashPin } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { encryptField, decryptField } from "@/lib/encryption";
import {
  generateTotpSecret,
  totpAuthUri,
  verifyTotp,
  generateBackupCodes,
} from "@/lib/totp";

// Self-service TOTP management for the signed-in user. Every mutation re-checks
// the account password, so a stolen session alone cannot change 2FA settings.
//
// action "setup"   → mint a pending secret, return the QR to scan (not enabled yet)
// action "enable"  → verify a code against the pending secret, turn 2FA on,
//                    return one-time backup codes
// action "disable" → turn 2FA off and wipe the secret + backup codes

function storeSecret(base32: string): string {
  const enc = encryptField(base32);
  if (!enc) throw new Error("encrypt failed");
  return `${enc.iv}:${enc.encrypted}`;
}
function readSecret(stored: string | null): string {
  if (!stored) return "";
  const [iv, ct] = stored.split(":");
  return decryptField(ct, iv);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action, password, code } = body as { action?: string; password?: string; code?: string };

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Password gate on every change
  if (!password || typeof password !== "string" || !bcrypt.compareSync(password, user.passwordHash)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  const meta = requestMeta(request);

  if (action === "setup") {
    // Fresh pending secret; keep totpEnabled false until the user proves a code
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: storeSecret(secret), totpEnabled: false },
    });
    const uri = totpAuthUri(secret, user.email);
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    // secret returned once so the user can type it in manually if they can't scan
    return NextResponse.json({ success: true, data: { qrDataUrl, secret, uri } });
  }

  if (action === "enable") {
    const secret = readSecret(user.totpSecret);
    if (!secret || secret === "[DECRYPTION_ERROR]") {
      return NextResponse.json({ error: "Start setup again." }, { status: 400 });
    }
    if (!verifyTotp(secret, typeof code === "string" ? code.trim() : "")) {
      return NextResponse.json({ error: "That code didn't match — check your authenticator app." }, { status: 400 });
    }
    const backupCodes = generateBackupCodes(10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        backupCodes: backupCodes.map((c) => hashPin(c)),
        mfaUpdatedAt: new Date(),
      },
    });
    await prisma.activityLog.create({
      data: { actor: user.name, action: "mfa_totp_enabled", details: `${user.name} enabled authenticator 2FA`, ...meta },
    }).catch(() => {});
    // Backup codes shown exactly once, in plaintext, here
    return NextResponse.json({ success: true, data: { backupCodes } });
  }

  if (action === "disable") {
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null, backupCodes: [], mfaUpdatedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: { actor: user.name, action: "mfa_totp_disabled", details: `${user.name} disabled authenticator 2FA`, ...meta },
    }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  if (action === "regenerate-backup") {
    if (!user.totpEnabled) return NextResponse.json({ error: "Enable 2FA first." }, { status: 400 });
    const backupCodes = generateBackupCodes(10);
    await prisma.user.update({
      where: { id: user.id },
      data: { backupCodes: backupCodes.map((c) => hashPin(c)), mfaUpdatedAt: new Date() },
    });
    return NextResponse.json({ success: true, data: { backupCodes } });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
