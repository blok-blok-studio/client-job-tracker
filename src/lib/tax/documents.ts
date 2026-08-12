import prisma from "@/lib/prisma";
import { requiredDocTypes } from "@/lib/tax/obligations-source";

// Ensure the TaxDocument rows a person needs for their country exist (idempotent —
// existing rows of the same type/direction are left untouched). Called whenever a
// contractor or client gets a country assigned or changed.
export async function ensureRequiredDocs(opts: {
  kind: "contractor" | "client";
  id: string;
  country: string | null;
  actor: string;
}): Promise<number> {
  const { kind, id, country, actor } = opts;
  if (!country) return 0;

  const wanted = requiredDocTypes({ kind, country });
  if (wanted.length === 0) return 0;

  const whereOwner = kind === "contractor" ? { contractorId: id } : { clientId: id };
  const existing = await prisma.taxDocument.findMany({
    where: whereOwner,
    select: { type: true, direction: true },
  });
  const have = new Set(existing.map((d) => `${d.type}:${d.direction}`));

  let created = 0;
  for (const w of wanted) {
    if (have.has(`${w.type}:${w.direction}`)) continue;
    await prisma.taxDocument.create({
      data: {
        ...whereOwner,
        type: w.type,
        direction: w.direction,
        note: w.note,
      },
    });
    created++;
  }

  if (created > 0) {
    await prisma.activityLog.create({
      data: {
        actor,
        action: "tax_documents_created",
        details: `Created ${created} required tax document record${created === 1 ? "" : "s"} for ${kind} (${country})`,
      },
    });
  }
  return created;
}
