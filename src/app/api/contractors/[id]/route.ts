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
  // Lifecycle fields (sequence I keys off agreementSignedAt)
  agreementSignedAt: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date").nullable().optional(),
  trialScore: z.number().int().min(0).max(100).nullable().optional(),
  weeklyReviewDay: z.number().int().min(0).max(6).nullable().optional(),
  automationsPaused: z.boolean().optional(),
  // Full replacement of the contractor's client assignments (hours-log access)
  clientIds: z.array(z.string().max(64)).max(200).optional(),
  country: z.string().length(2).nullable().optional().or(z.literal("")),
  additionalCountries: z.array(z.string().length(2)).max(10).optional(),
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

    const existing = await prisma.contractor.findUnique({ where: { id }, select: { id: true, name: true, agreementSignedAt: true } });
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
        ...(d.agreementSignedAt !== undefined && {
          agreementSignedAt: d.agreementSignedAt ? new Date(d.agreementSignedAt) : null,
        }),
        ...(d.trialScore !== undefined && { trialScore: d.trialScore }),
        ...(d.weeklyReviewDay !== undefined && { weeklyReviewDay: d.weeklyReviewDay }),
        ...(d.automationsPaused !== undefined && { automationsPaused: d.automationsPaused }),
        ...(d.country !== undefined && { country: d.country ? d.country.toUpperCase() : null }),
        ...(d.additionalCountries !== undefined && {
          additionalCountries: d.additionalCountries.map((c) => c.toUpperCase()),
        }),
        ...(d.clientIds !== undefined && {
          clientAssignments: {
            deleteMany: {},
            create: d.clientIds.map((clientId) => ({
              clientId,
              createdBy: session?.name || "team",
            })),
          },
        }),
      },
      include: {
        invoices: {
          orderBy: { submittedAt: "desc" },
          include: {
            notes: { orderBy: { createdAt: "asc" } },
            audits: { orderBy: { createdAt: "asc" } },
          },
        },
        hoursEntries: {
          orderBy: { startAt: "desc" },
          take: 500,
          include: {
            notes: { orderBy: { createdAt: "asc" } },
            audits: { orderBy: { createdAt: "asc" } },
            correctedBy: { select: { id: true } },
          },
        },
        clientAssignments: {
          include: { client: { select: { id: true, name: true } } },
        },
      },
    });

    // Country assigned/changed → create the tax documents that country requires
    if (d.country) {
      const { ensureRequiredDocs } = await import("@/lib/tax/documents");
      await ensureRequiredDocs({
        kind: "contractor",
        id,
        country: d.country.toUpperCase(),
        actor: session?.name || "team",
      }).catch(() => {});
    }

    // Lifecycle: agreement signed → schedule the contractor onboarding cadence (I)
    if (d.agreementSignedAt !== undefined) {
      const { onContractorChanged } = await import("@/lib/lifecycle/engine");
      await onContractorChanged(id, existing.agreementSignedAt, session?.name || "team").catch(
        (err) => console.error("[Lifecycle] onContractorChanged failed:", err)
      );
    }

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

    if (d.clientIds !== undefined) {
      await prisma.activityLog.create({
        data: {
          actor: session?.name || "team",
          action: "contractor_assignments_updated",
          details: `Updated client assignments for ${contractor.name} (${d.clientIds.length} client${d.clientIds.length === 1 ? "" : "s"})`,
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
      select: {
        id: true,
        name: true,
        _count: { select: { invoices: true, hoursEntries: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    if (existing._count.invoices > 0 || existing._count.hoursEntries > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This contractor has invoices or logged hours on record. Deactivate them instead — those are kept as legal records.",
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
