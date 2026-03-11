import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const credential = await prisma.credential.findUnique({ where: { id } });
  if (!credential) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    const ivData = JSON.parse(credential.iv);

    const username = decrypt(credential.username, ivData.username);
    const password = decrypt(credential.password, ivData.password);
    const notes = credential.notes && ivData.notes
      ? decrypt(credential.notes, ivData.notes)
      : null;

    return NextResponse.json({
      success: true,
      data: { username, password, notes },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Decryption failed" }, { status: 500 });
  }
}
