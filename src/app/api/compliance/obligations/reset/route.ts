import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { OBLIGATION_SEEDS, PROFILE_SEEDS } from "@/lib/tax/obligations-source";

// POST /api/compliance/obligations/reset — restore every catalog entry to the
// shipped copy in obligations-source.ts (same as the seed script with --reset).
export async function POST() {
  try {
    const session = await getSession();
    if (session?.role !== "OWNER") {
      return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
    }

    const profileIds = new Map<string, string>();
    for (const p of PROFILE_SEEDS) {
      const existing = await prisma.taxProfile.findFirst({ where: { label: p.label } });
      if (existing) {
        profileIds.set(p.key, existing.id);
      } else {
        const created = await prisma.taxProfile.create({
          data: { country: p.country, label: p.label, entityType: p.entityType, flags: p.flags as object },
        });
        profileIds.set(p.key, created.id);
      }
    }

    for (const o of OBLIGATION_SEEDS) {
      const data = {
        country: o.country,
        appliesTo: o.appliesTo,
        profileId: o.profileKey ? profileIds.get(o.profileKey) ?? null : null,
        name: o.name,
        formName: o.formName ?? null,
        description: o.description,
        frequency: o.frequency,
        dueRules: o.dueRules as object[],
        earliestOpen: (o.earliestOpen as object | undefined) ?? undefined,
        sourceUrls: o.sourceUrls,
        verifyWithAdvisor: o.verifyWithAdvisor ?? false,
        enabled: o.enabled ?? true,
      };
      await prisma.taxObligation.upsert({
        where: { key: o.key },
        create: { key: o.key, ...data },
        update: data,
      });
    }

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "tax_catalog_reset",
        details: `Reset the tax obligation catalog to source (${OBLIGATION_SEEDS.length} entries)`,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to reset catalog" }, { status: 500 });
  }
}
