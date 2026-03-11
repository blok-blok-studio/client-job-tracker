import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { credentialSchema } from "@/lib/validations";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const credentials = await prisma.credential.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ client: { name: "asc" } }, { platform: "asc" }],
  });

  // Mask passwords in list view
  const masked = credentials.map((c) => ({
    ...c,
    password: "••••••••",
    notes: c.notes ? "[encrypted]" : null,
  }));

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
