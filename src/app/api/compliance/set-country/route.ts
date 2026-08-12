import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureRequiredDocs } from "@/lib/tax/documents";

const schema = z.object({
  kind: z.enum(["contractor", "client"]),
  id: z.string().max(64),
  country: z.string().length(2).nullable(),
  additionalCountries: z.array(z.string().length(2)).max(10).optional(),
});

// POST /api/compliance/set-country — assign a person's tax country and create
// the document requirements that follow from it.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const actor = session?.name || "team";
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;
    const country = d.country ? d.country.toUpperCase() : null;
    const additional = (d.additionalCountries || []).map((c) => c.toUpperCase());

    if (d.kind === "contractor") {
      const existing = await prisma.contractor.findUnique({ where: { id: d.id }, select: { id: true, name: true } });
      if (!existing) return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
      await prisma.contractor.update({
        where: { id: d.id },
        data: { country, additionalCountries: additional },
      });
    } else {
      const existing = await prisma.client.findUnique({ where: { id: d.id }, select: { id: true, name: true } });
      if (!existing) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
      await prisma.client.update({
        where: { id: d.id },
        data: { country, additionalCountries: additional },
      });
    }

    // Create required document records for the primary + any additional countries
    let docsCreated = 0;
    for (const c of [country, ...additional].filter(Boolean) as string[]) {
      docsCreated += await ensureRequiredDocs({ kind: d.kind, id: d.id, country: c, actor });
    }

    return NextResponse.json({ success: true, data: { docsCreated } });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to set country" }, { status: 500 });
  }
}
