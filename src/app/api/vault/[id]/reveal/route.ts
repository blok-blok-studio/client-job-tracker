import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 30, windowMs: 60 * 1000, prefix: "vault-reveal" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many reveal attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { id } = await params;

  const credential = await prisma.credential.findUnique({ where: { id } });
  if (!credential) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    // Two storage formats exist:
    //  - new: iv = JSON {username, password, notes} with all three fields encrypted
    //  - legacy (onboarding flow): iv = plain base64 string, only password encrypted; username/notes stored plaintext
    let username: string;
    let password_decrypted: string;
    let notes: string | null;

    let ivData: Record<string, string | null> | null = null;
    try {
      const parsed = JSON.parse(credential.iv);
      if (parsed && typeof parsed === "object" && parsed.username && parsed.password) {
        ivData = parsed;
      }
    } catch {
      // legacy format — single IV string, not JSON
    }

    if (ivData) {
      username = decrypt(credential.username, ivData.username!);
      password_decrypted = decrypt(credential.password, ivData.password!);
      notes = credential.notes && ivData.notes
        ? decrypt(credential.notes, ivData.notes)
        : null;
    } else {
      username = credential.username;
      password_decrypted = decrypt(credential.password, credential.iv);
      notes = credential.notes;
    }

    // Audit log — track every credential reveal
    await prisma.activityLog.create({
      data: {
        clientId: credential.clientId,
        actor: "chase",
        action: "credential_revealed",
        details: `Revealed ${credential.platform} credential (${credential.label || "unlabeled"})`,
      },
    }).catch(() => {}); // Don't block reveal if logging fails

    const response = NextResponse.json({
      success: true,
      data: { username, password: password_decrypted, notes },
    });
    // Prevent caching of decrypted credentials
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  } catch {
    return NextResponse.json({ success: false, error: "Decryption failed" }, { status: 500 });
  }
}
