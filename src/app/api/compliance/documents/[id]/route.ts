import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const patchSchema = z.object({
  status: z.enum(["REQUESTED", "RECEIVED", "SENT", "EXPIRED", "NA"]).optional(),
  note: z.string().max(2000).nullable().optional().or(z.literal("")),
  validUntil: z.string().nullable().optional().or(z.literal("")),
});

// PATCH /api/compliance/documents/[id] — update status/notes. There is no DELETE:
// received documents are records; use status NA to retire a requirement.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await prisma.taxDocument.findUnique({
      where: { id },
      include: {
        contractor: { select: { name: true } },
        client: { select: { name: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const statusChanged = d.status !== undefined && d.status !== existing.status;

    const doc = await prisma.taxDocument.update({
      where: { id },
      data: {
        ...(d.status !== undefined && {
          status: d.status,
          // receivedAt stamps the first time a doc lands (received or sent out)
          ...(statusChanged && (d.status === "RECEIVED" || d.status === "SENT") && !existing.receivedAt
            ? { receivedAt: new Date() }
            : {}),
        }),
        ...(d.note !== undefined && { note: d.note || null }),
        ...(d.validUntil !== undefined && { validUntil: d.validUntil ? new Date(d.validUntil) : null }),
      },
      include: {
        contractor: { select: { id: true, name: true, country: true } },
        client: { select: { id: true, name: true, country: true } },
      },
    });

    if (statusChanged) {
      await prisma.activityLog.create({
        data: {
          actor: session?.name || "team",
          action: "tax_document_updated",
          details: `${existing.type} for ${existing.contractor?.name || existing.client?.name || "unknown"} → ${d.status}`,
        },
      });
    }

    return NextResponse.json({ success: true, data: doc });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update document" }, { status: 500 });
  }
}
