// Seed / re-sync the tax compliance catalog from src/lib/tax/obligations-source.ts.
// Idempotent: profiles are matched by label, obligations upserted by key. Existing
// obligation rows keep any in-app edits to enabled/description etc. unless --reset
// is passed, which restores every seeded field to the shipped copy.
//
// Run: npx tsx scripts/seed-tax-catalog.ts [--reset]

import prisma from "../src/lib/prisma";
import { OBLIGATION_SEEDS, PROFILE_SEEDS } from "../src/lib/tax/obligations-source";

async function main() {
  const reset = process.argv.includes("--reset");

  const profileIds = new Map<string, string>();
  for (const p of PROFILE_SEEDS) {
    const existing = await prisma.taxProfile.findFirst({ where: { label: p.label } });
    if (existing) {
      profileIds.set(p.key, existing.id);
    } else {
      const created = await prisma.taxProfile.create({
        data: {
          country: p.country,
          label: p.label,
          entityType: p.entityType,
          flags: p.flags as object,
        },
      });
      profileIds.set(p.key, created.id);
      console.log(`+ profile ${p.label}`);
    }
  }

  let created = 0;
  let updated = 0;
  let kept = 0;
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
    const existing = await prisma.taxObligation.findUnique({ where: { key: o.key } });
    if (!existing) {
      await prisma.taxObligation.create({ data: { key: o.key, ...data } });
      created++;
      console.log(`+ obligation ${o.key}`);
    } else if (reset) {
      await prisma.taxObligation.update({ where: { key: o.key }, data });
      updated++;
      console.log(`~ reset ${o.key}`);
    } else {
      kept++;
    }
  }

  // On --reset, also remove catalog rows whose key no longer exists in source
  // (entries merged or retired during research updates)
  let pruned = 0;
  if (reset) {
    const sourceKeys = OBLIGATION_SEEDS.map((o) => o.key);
    const orphans = await prisma.taxObligation.findMany({
      where: { key: { notIn: sourceKeys } },
      select: { id: true, key: true },
    });
    for (const o of orphans) {
      await prisma.taxObligation.delete({ where: { id: o.id } });
      pruned++;
      console.log(`- pruned ${o.key}`);
    }
  }

  console.log(
    `Done: ${created} created, ${updated} reset, ${kept} kept as-is, ${pruned} pruned (${OBLIGATION_SEEDS.length} in source).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
