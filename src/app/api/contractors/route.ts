import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/contractors — contractors with their invoices for the overview page
export async function GET() {
  try {
    const contractors = await prisma.contractor.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
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

    return NextResponse.json({ success: true, data: contractors });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load contractors" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  country: z.string().length(2).optional().or(z.literal("")),
  /** Email them their portal link on creation (default on when we have an address) */
  sendWelcomeEmail: z.boolean().optional().default(true),
});

// POST /api/contractors — add a contractor and mint their upload link
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const contractor = await prisma.contractor.create({
      data: {
        name: d.name,
        email: d.email || null,
        company: d.company || null,
        phone: d.phone || null,
        notes: d.notes || null,
        country: d.country ? d.country.toUpperCase() : null,
        uploadToken: randomBytes(16).toString("base64url"),
      },
      include: { invoices: true },
    });

    // Onboarding paperwork: the base document set (signed agreement both ways,
    // company info) is created for every contractor; a country adds W-9/W-8BEN
    // and the 1099-copy requirement.
    {
      const { ensureRequiredDocs } = await import("@/lib/tax/documents");
      await ensureRequiredDocs({
        kind: "contractor",
        id: contractor.id,
        country: d.country ? d.country.toUpperCase() : null,
        actor: session?.name || "team",
      }).catch(() => {});
    }

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "contractor_added",
        details: `Added contractor: ${contractor.name}`,
      },
    });

    // Onboarding: send them their portal link straight away. A contractor who
    // never receives the link can't invoice, log hours, or sign anything.
    let emailError: string | null = null;
    let emailed = false;
    if (d.sendWelcomeEmail && contractor.email) {
      try {
        const { sendContractorPortalEmail } = await import("@/lib/email");
        const { contractorPortalUrl, requiredDocLabels } = await import("@/lib/contractor-onboarding");
        const sent = await sendContractorPortalEmail({
          to: contractor.email,
          contractorName: contractor.name,
          portalUrl: contractorPortalUrl(contractor.uploadToken),
          requiredDocs: await requiredDocLabels(contractor.id),
        });
        // The helper no-ops when RESEND_API_KEY is missing — don't claim a send
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
        emailError = err instanceof Error ? err.message : "Failed to send the welcome email";
        console.error("[Contractors] Welcome email failed:", emailError);
      }
    } else if (d.sendWelcomeEmail && !contractor.email) {
      emailError = "No email address on file — share their portal link manually.";
    }

    return NextResponse.json({ success: true, data: contractor, emailed, emailError });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add contractor" }, { status: 500 });
  }
}
