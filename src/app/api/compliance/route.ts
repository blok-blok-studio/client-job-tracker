import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getSetting } from "@/lib/lifecycle/settings";
import { OBLIGATION_SEEDS } from "@/lib/tax/obligations-source";

// GET /api/compliance — everything the /compliance page needs in one call:
// profiles, the obligation catalog, document matrix, people + their countries,
// the master reminder switch, and any countries with no seeded requirements.
export async function GET() {
  try {
    const session = await getSession();

    const [profiles, obligations, documents, contractors, clients, remindersEnabled] =
      await Promise.all([
        prisma.taxProfile.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.taxObligation.findMany({
          orderBy: [{ country: "asc" }, { name: "asc" }],
          include: { profile: { select: { id: true, label: true } } },
        }),
        prisma.taxDocument.findMany({
          orderBy: { requestedAt: "desc" },
          include: {
            contractor: { select: { id: true, name: true, country: true } },
            client: { select: { id: true, name: true, country: true } },
          },
        }),
        prisma.contractor.findMany({
          where: { isActive: true },
          select: { id: true, name: true, company: true, country: true, additionalCountries: true },
          orderBy: { name: "asc" },
        }),
        prisma.client.findMany({
          where: { type: { in: ["ACTIVE", "PROSPECT"] } },
          select: { id: true, name: true, company: true, country: true, additionalCountries: true },
          orderBy: { name: "asc" },
        }),
        getSetting<boolean>("tax_reminders_enabled", false),
      ]);

    // Countries in use by people but with no seeded catalog entries — research flags
    const seededCountries = new Set(OBLIGATION_SEEDS.map((o) => o.country));
    const inUse = new Set<string>();
    for (const p of [...contractors, ...clients]) {
      if (p.country) inUse.add(p.country);
      for (const c of p.additionalCountries || []) inUse.add(c);
    }
    const unseededCountries = [...inUse].filter((c) => !seededCountries.has(c)).sort();

    return NextResponse.json({
      success: true,
      data: {
        profiles,
        obligations,
        documents,
        contractors,
        clients,
        remindersEnabled,
        unseededCountries,
        isOwner: session?.role === "OWNER",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load compliance data" }, { status: 500 });
  }
}
