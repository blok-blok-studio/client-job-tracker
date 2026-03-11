import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contactSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contacts = await prisma.contact.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, data: contacts });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = contactSchema.parse(body);

    const contact = await prisma.contact.create({
      data: {
        ...parsed,
        clientId: id,
        email: parsed.email || null,
        phone: parsed.phone || null,
        role: parsed.role || null,
        notes: parsed.notes || null,
      },
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to create contact" }, { status: 500 });
  }
}
