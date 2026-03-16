import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

const createSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  label: z.string().optional().or(z.literal("")),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  url: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

// GET — list credentials for a specific client (passwords masked)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const credentials = await prisma.credential.findMany({
      where: { clientId: id },
      orderBy: { platform: "asc" },
      select: {
        id: true,
        platform: true,
        label: true,
        username: true,
        url: true,
        lastRotated: true,
        createdAt: true,
      },
    });

    // Username is encrypted — return masked
    const masked = credentials.map((c) => ({
      ...c,
      username: c.username, // Will be decrypted on reveal
      password: "••••••••",
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// POST — create a credential for this client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    // Encrypt sensitive fields
    const encryptedPassword = encrypt(parsed.password);
    const encryptedUsername = encrypt(parsed.username);
    const encryptedNotes = parsed.notes ? encrypt(parsed.notes) : null;

    const credential = await prisma.credential.create({
      data: {
        clientId: id,
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

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "credential_added",
        details: `Added ${parsed.platform} credential`,
      },
    });

    return NextResponse.json({ success: true, data: { id: credential.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Validation failed", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Failed to create credential" }, { status: 500 });
  }
}
