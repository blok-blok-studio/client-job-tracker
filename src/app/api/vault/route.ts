import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { credentialSchema } from "@/lib/validations";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const credentials = await prisma.credential.findMany({
    select: {
      id: true,
      clientId: true,
      client: { select: { id: true, name: true } },
      platform: true,
      label: true,
      url: true,
      notes: true,
      lastRotated: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ client: { name: "asc" } }, { platform: "asc" }],
  });

  // OAuth-stored credentials use the `url` field for token expiry (ISO timestamp).
  // Manually-entered credentials either have a real URL or null. Use this to flag them.
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const masked = credentials.map((c) => {
    const isOAuth = !!c.url && isoPattern.test(c.url);
    return {
      ...c,
      username: "••••••••",
      password: "••••••••",
      notes: c.notes ? "[encrypted]" : null,
      isOAuth,
      tokenExpiresAt: isOAuth ? c.url : null,
      url: isOAuth ? null : c.url,
    };
  });

  return NextResponse.json({ success: true, data: masked });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = credentialSchema.parse(body);

    // Encrypt sensitive fields
    const encryptedPassword = encrypt(parsed.password);
    const encryptedUsername = encrypt(parsed.username);
    const encryptedNotes = parsed.notes ? encrypt(parsed.notes) : null;

    const credential = await prisma.credential.create({
      data: {
        clientId: parsed.clientId,
        platform: parsed.platform,
        label: parsed.label || null,
        username: encryptedUsername.encrypted,
        password: encryptedPassword.encrypted,
        notes: encryptedNotes?.encrypted || null,
        url: parsed.url || null,
        iv: JSON.stringify({
          username: encryptedUsername.iv,
          password: encryptedPassword.iv,
          notes: encryptedNotes?.iv || null,
        }),
      },
    });

    return NextResponse.json({ success: true, data: { id: credential.id } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to create credential" }, { status: 500 });
  }
}
