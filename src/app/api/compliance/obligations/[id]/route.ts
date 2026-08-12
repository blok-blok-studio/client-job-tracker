import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  formName: z.string().max(200).nullable().optional().or(z.literal("")),
  description: z.string().min(1).max(5000).optional(),
  enabled: z.boolean().optional(),
  verifyWithAdvisor: z.boolean().optional(),
});

// PATCH /api/compliance/obligations/[id] — edit catalog copy or toggle an
// obligation. Due-date rules are edited via reset-to-source or a future editor.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await prisma.taxObligation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Obligation not found" }, { status: 404 });
    }

    const obligation = await prisma.taxObligation.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.formName !== undefined && { formName: d.formName || null }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.enabled !== undefined && { enabled: d.enabled }),
        ...(d.verifyWithAdvisor !== undefined && { verifyWithAdvisor: d.verifyWithAdvisor }),
      },
      include: { profile: { select: { id: true, label: true } } },
    });

    if (d.enabled !== undefined && d.enabled !== existing.enabled) {
      await prisma.activityLog.create({
        data: {
          actor: session?.name || "team",
          action: "tax_obligation_toggled",
          details: `${d.enabled ? "Enabled" : "Disabled"} tax obligation: ${existing.name} (${existing.country})`,
        },
      });
    }

    return NextResponse.json({ success: true, data: obligation });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update obligation" }, { status: 500 });
  }
}
