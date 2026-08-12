import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const maxDuration = 300;

// GET /api/compliance/export — complete legal records bundle as a JSON download:
// every contractor with their invoices, hours entries, notes, and full audit
// trails (IP/user-agent stamps included), all tracked tax documents (metadata,
// not file contents), and the obligation catalog. Built for handing to a
// lawyer, accountant, or auditor. The export itself is activity-logged.
export async function GET() {
  try {
    const session = await getSession();

    const [contractors, taxDocuments, obligations, profiles] = await Promise.all([
      prisma.contractor.findMany({
        orderBy: { name: "asc" },
        include: {
          invoices: {
            orderBy: { submittedAt: "asc" },
            include: {
              notes: { orderBy: { createdAt: "asc" } },
              audits: { orderBy: { createdAt: "asc" } },
            },
          },
          hoursEntries: {
            orderBy: { startAt: "asc" },
            include: {
              notes: { orderBy: { createdAt: "asc" } },
              audits: { orderBy: { createdAt: "asc" } },
            },
          },
          clientAssignments: {
            include: { client: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.taxDocument.findMany({
        orderBy: { requestedAt: "asc" },
        select: {
          id: true,
          contractorId: true,
          clientId: true,
          direction: true,
          type: true,
          status: true,
          filename: true,
          contentType: true,
          size: true,
          encrypted: true,
          validUntil: true,
          requestedAt: true,
          receivedAt: true,
          submitIp: true,
          submitUserAgent: true,
          note: true,
          contractor: { select: { name: true } },
          client: { select: { name: true } },
        },
      }),
      prisma.taxObligation.findMany({ orderBy: [{ country: "asc" }, { key: "asc" }] }),
      prisma.taxProfile.findMany(),
    ]);

    const generatedAt = new Date().toISOString();
    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "legal_records_exported",
        details: `Exported legal records bundle (${contractors.length} contractors, ${taxDocuments.length} tax documents)`,
      },
    });

    const bundle = {
      meta: {
        generatedAt,
        generatedBy: session?.name || "team",
        system: "Blok Blok Command Center — legal records export",
        notes:
          "Contractor invoices and hours entries are append-only records with immutable audit trails (actor, timestamp, IP address, user agent). Corrections never modify originals; they are separate attested entries linked via correctsId. Tax document files are AES-256-GCM encrypted at rest and not included in this bundle; metadata and chain-of-custody stamps are.",
      },
      profiles,
      obligations,
      contractors,
      taxDocuments,
    };

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="blokblok-legal-export-${generatedAt.slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to export records" }, { status: 500 });
  }
}
