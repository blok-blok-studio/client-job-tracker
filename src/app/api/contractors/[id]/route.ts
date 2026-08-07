import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  company: z.string().max(200).nullable().optional().or(z.literal("")),
  phone: z.string().max(50).nullable().optional().or(z.literal("")),
  notes: z.string().max(2000).nullable().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  regenerateToken: z.boolean().optional(),
});

// PATCH /api/contractors/[id] — edit details, pause the link, or rotate the token
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await prisma.contractor.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const contractor = await prisma.contractor.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.email !== undefined && { email: d.email || null }),
        ...(d.company !== undefined && { company: d.company || null }),
        ...(d.phone !== undefined && { phone: d.phone || null }),
        ...(d.notes !== undefined && { notes: d.notes || null }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
        ...(d.regenerateToken && { uploadToken: randomBytes(16).toString("base64url") }),
      },
      include: {
        invoices: {
          orderBy: { submittedAt: "desc" },
          include: {
            notes: { orderBy: { createdAt: "asc" } },
            audits: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    if (d.isActive !== undefined || d.regenerateToken) {
      await prisma.activityLog.create({
        data: {
          actor: session?.name || "team",
          action: "contractor_updated",
          details: d.regenerateToken
            ? `Rotated upload link for ${contractor.name}`
            : `${d.isActive ? "Activated" : "Deactivated"} contractor ${contractor.name}`,
        },
      });
    }

    return NextResponse.json({ success: true, data: contractor });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update contractor" }, { status: 500 });
  }
}

// DELETE /api/contractors/[id] — remove a contractor.
// Blocked while invoices exist: those are legal records — deactivate instead.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    const existing = await prisma.contractor.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { invoices: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    if (existing._count.invoices > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This contractor has invoices on record. Deactivate them instead — invoices are kept as legal records.",
        },
        { status: 400 }
      );
    }

    await prisma.contractor.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "contractor_removed",
        details: `Removed contractor: ${existing.name}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to remove contractor" }, { status: 500 });
  }
}
