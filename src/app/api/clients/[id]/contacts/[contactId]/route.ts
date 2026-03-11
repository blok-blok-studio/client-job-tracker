import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contactSchema } from "@/lib/validations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { contactId } = await params;
  try {
    const body = await request.json();
    const parsed = contactSchema.partial().parse(body);
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: parsed,
    });
    return NextResponse.json({ success: true, data: contact });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update contact" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { contactId } = await params;
  await prisma.contact.delete({ where: { id: contactId } });
  return NextResponse.json({ success: true });
}
