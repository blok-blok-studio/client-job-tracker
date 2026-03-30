import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { verifyPassword } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit vault reveals — max 10 per minute
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 10, prefix: "vault-reveal" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many reveal attempts. Try again later." },
      { status: 429 }
    );
  }

  const { id } = await params;

  // Require password re-authentication for credential reveal
  const body = await request.json().catch(() => ({}));
  const password = (body as Record<string, unknown>)?.password;
  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { success: false, error: "Password required to reveal credentials" },
      { status: 401 }
    );
  }
  if (!verifyPassword(password)) {
    return NextResponse.json(
      { success: false, error: "Invalid password" },
      { status: 403 }
    );
  }

  const credential = await prisma.credential.findUnique({ where: { id } });
  if (!credential) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    let ivData: Record<string, string | null>;
    try {
      ivData = JSON.parse(credential.iv);
    } catch {
      return NextResponse.json({ success: false, error: "Credential data corrupted" }, { status: 500 });
    }

    if (!ivData.username || !ivData.password) {
      return NextResponse.json({ success: false, error: "Credential data corrupted" }, { status: 500 });
    }

    const username = decrypt(credential.username, ivData.username);
    const password_decrypted = decrypt(credential.password, ivData.password);
    const notes = credential.notes && ivData.notes
      ? decrypt(credential.notes, ivData.notes)
      : null;

    // Audit log — track every credential reveal
    await prisma.activityLog.create({
      data: {
        clientId: credential.clientId,
        actor: "chase",
        action: "credential_revealed",
        details: `Revealed ${credential.platform} credential (${credential.label || "unlabeled"})`,
      },
    }).catch(() => {}); // Don't block reveal if logging fails

    return NextResponse.json({
      success: true,
      data: { username, password: password_decrypted, notes },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Decryption failed" }, { status: 500 });
  }
}
