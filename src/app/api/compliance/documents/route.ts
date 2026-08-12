import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const createSchema = z
  .object({
    contractorId: z.string().max(64).optional(),
    clientId: z.string().max(64).optional(),
    type: z.string().min(1).max(60),
    direction: z.enum(["INBOUND", "OUTBOUND"]),
    note: z.string().max(2000).optional().or(z.literal("")),
    validUntil: z.string().optional().or(z.literal("")),
  })
  .refine((d) => !!d.contractorId !== !!d.clientId, {
    message: "Exactly one of contractorId or clientId is required",
  });

// POST /api/compliance/documents — manually add a tracked tax document
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const doc = await prisma.taxDocument.create({
      data: {
        contractorId: d.contractorId || null,
        clientId: d.clientId || null,
        type: d.type.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
        direction: d.direction,
        note: d.note || null,
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
      },
      include: {
        contractor: { select: { id: true, name: true, country: true } },
        client: { select: { id: true, name: true, country: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "tax_document_added",
        details: `Added tax document ${doc.type} for ${doc.contractor?.name || doc.client?.name || "unknown"}`,
      },
    });

    return NextResponse.json({ success: true, data: doc });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add document" }, { status: 500 });
  }
}
