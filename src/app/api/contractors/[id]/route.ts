import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/contractors/[id] — everything the profile page shows
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contractor = await prisma.contractor.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { submittedAt: "desc" }, take: 25 },
        hoursEntries: {
          orderBy: { startAt: "desc" },
          take: 300,
          include: { correctedBy: { select: { id: true } } },
        },
        clientAssignments: { include: { client: { select: { id: true, name: true } } } },
        taxDocuments: { orderBy: { requestedAt: "asc" } },
        contracts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            token: true,
            kind: true,
            title: true,
            status: true,
            signedAt: true,
            signedName: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: contractor });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load contractor" }, { status: 500 });
  }
}

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
  // Profile fields — none of this is legally load-bearing, it's who they are
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  role: z.string().max(100).nullable().optional().or(z.literal("")),
  skills: z.array(z.string().min(1).max(40)).max(20).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #f97316")
    .nullable()
    .optional()
    .or(z.literal("")),
  emoji: z.string().max(8).nullable().optional().or(z.literal("")),
  bio: z.string().max(2000).nullable().optional().or(z.literal("")),
  funFact: z.string().max(300).nullable().optional().or(z.literal("")),
  location: z.string().max(200).nullable().optional().or(z.literal("")),
  timezone: z.string().max(100).nullable().optional().or(z.literal("")),
  startedAt: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Invalid date")
    .nullable()
    .optional()
    .or(z.literal("")),
  links: z.record(z.string().max(30), z.string().max(300)).optional(),
  /** Email them their portal link (use after adding, or after rotating the link) */
  sendPortalEmail: z.boolean().optional(),
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
        ...(d.avatarUrl !== undefined && {
          avatarUrl: d.avatarUrl || null,
          avatarUpdatedAt: d.avatarUrl ? new Date() : null,
        }),
        ...(d.role !== undefined && { role: d.role || null }),
        ...(d.skills !== undefined && { skills: d.skills }),
        ...(d.accentColor !== undefined && { accentColor: d.accentColor || null }),
        ...(d.emoji !== undefined && { emoji: d.emoji || null }),
        ...(d.bio !== undefined && { bio: d.bio || null }),
        ...(d.funFact !== undefined && { funFact: d.funFact || null }),
        ...(d.location !== undefined && { location: d.location || null }),
        ...(d.timezone !== undefined && { timezone: d.timezone || null }),
        ...(d.startedAt !== undefined && { startedAt: d.startedAt ? new Date(d.startedAt) : null }),
        ...(d.links !== undefined && { links: d.links }),
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

    // Send (or re-send) their portal link. Always uses the token as it stands
    // after this update, so rotating the link and emailing it is one action.
    let emailError: string | null = null;
    let emailed = false;
    if (d.sendPortalEmail) {
      if (!contractor.email) {
        emailError = "No email address on file for this contractor.";
      } else {
        try {
          const { sendContractorPortalEmail } = await import("@/lib/email");
          const { contractorPortalUrl, requiredDocLabels } = await import("@/lib/contractor-onboarding");
          const sent = await sendContractorPortalEmail({
            to: contractor.email,
            contractorName: contractor.name,
            portalUrl: contractorPortalUrl(contractor.uploadToken),
            requiredDocs: await requiredDocLabels(contractor.id),
            resend: true,
          });
          if (!sent) throw new Error("Email isn't configured on the server (RESEND_API_KEY) — share the link manually.");
          emailed = true;
          await prisma.activityLog.create({
            data: {
              actor: session?.name || "team",
              action: "contractor_portal_link_sent",
              details: `Emailed the portal link to ${contractor.name} (${contractor.email})`,
            },
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Failed to send the email";
          console.error("[Contractors] Portal email failed:", emailError);
        }
      }
    }

    return NextResponse.json({ success: true, data: contractor, emailed, emailError });
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
    // Agreements that ever left draft are legal records too — a signed contract
    // must not disappear because someone tidied up the contractor list.
    const releasedContracts = await prisma.contractorContract.count({
      where: { contractorId: id, status: { not: "DRAFT" } },
    });
    if (existing._count.invoices > 0 || existing._count.hoursEntries > 0 || releasedContracts > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This contractor has invoices, logged hours, or agreements on record. Deactivate them instead — those are kept as legal records.",
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
