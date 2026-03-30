import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const credential = await prisma.credential.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });

  if (!credential) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  // Strip all encrypted fields — never expose encrypted blobs or IVs
  return NextResponse.json({
    success: true,
    data: {
      id: credential.id,
      clientId: credential.clientId,
      client: credential.client,
      platform: credential.platform,
      label: credential.label,
      url: credential.url,
      lastRotated: credential.lastRotated,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      username: "••••••••",
      password: "••••••••",
      notes: credential.notes ? "[encrypted]" : null,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.platform) data.platform = body.platform;
    if (body.label !== undefined) data.label = body.label || null;
    if (body.url !== undefined) data.url = body.url || null;

    // Get existing IV data
    const existing = await prisma.credential.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    let ivData: Record<string, string | null>;
    try {
      ivData = JSON.parse(existing.iv);
    } catch {
      return NextResponse.json({ success: false, error: "Credential data corrupted" }, { status: 500 });
    }

    if (body.username) {
      const enc = encrypt(body.username);
      data.username = enc.encrypted;
      ivData.username = enc.iv;
    }

    if (body.password) {
      const enc = encrypt(body.password);
      data.password = enc.encrypted;
      ivData.password = enc.iv;
      data.lastRotated = new Date();
    }

    if (body.notes !== undefined) {
      if (body.notes) {
        const enc = encrypt(body.notes);
        data.notes = enc.encrypted;
        ivData.notes = enc.iv;
      } else {
        data.notes = null;
        ivData.notes = null;
      }
    }

    data.iv = JSON.stringify(ivData);

    await prisma.credential.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const existing = await prisma.credential.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await prisma.credential.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
