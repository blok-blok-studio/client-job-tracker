import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";

const patchSchema = z.object({
  status: z.enum(["LOGGED", "REVIEWED", "DISPUTED"]).optional(),
  note: z.string().max(5000).optional().or(z.literal("")),
  clientId: z.string().max(64).nullable().optional(),
});

const entryInclude = {
  contractor: { select: { id: true, name: true, company: true } },
  notes: { orderBy: { createdAt: "asc" as const } },
  audits: { orderBy: { createdAt: "asc" as const } },
};

// PATCH /api/contractors/hours/[id] — review/dispute an entry or retag its client.
// Hours entries are append-only legal records: the reported times, description,
// and attestation can never be changed or deleted, only their review status and
// client tag. Every change is stamped into the immutable audit trail.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const actor = session?.name || "team";
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await prisma.contractorHoursEntry.findUnique({
      where: { id },
      include: { contractor: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }

    const statusChanged = d.status !== undefined && d.status !== existing.status;
    if (statusChanged && d.status === "DISPUTED" && !d.note?.trim()) {
      return NextResponse.json(
        { success: false, error: "A note explaining the dispute is required" },
        { status: 400 }
      );
    }

    // Retag target must exist (any client — internal action, not assignment-bound)
    let newClientName: string | null = null;
    const clientChanged = d.clientId !== undefined && (d.clientId || null) !== existing.clientId;
    if (clientChanged && d.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: d.clientId },
        select: { name: true },
      });
      if (!client) {
        return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
      }
      newClientName = client.name;
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const auditEvents: { event: string; metadata: string }[] = [];

    if (statusChanged) {
      const event =
        d.status === "REVIEWED"
          ? "marked_reviewed"
          : d.status === "DISPUTED"
          ? "marked_disputed"
          : "marked_logged";
      auditEvents.push({
        event,
        metadata: JSON.stringify({ from: existing.status, to: d.status }),
      });
    }
    if (clientChanged) {
      auditEvents.push({
        event: "client_reassigned",
        metadata: JSON.stringify({
          from: { clientId: existing.clientId, clientName: existing.clientName },
          to: { clientId: d.clientId || null, clientName: newClientName },
        }),
      });
    }

    const entry = await prisma.contractorHoursEntry.update({
      where: { id },
      data: {
        ...(statusChanged && {
          status: d.status,
          // reviewedAt/reviewedBy stamp the last review decision; cleared when
          // an entry is put back to LOGGED
          ...(d.status !== "LOGGED"
            ? { reviewedAt: new Date(), reviewedBy: actor }
            : { reviewedAt: null, reviewedBy: null }),
        }),
        ...(clientChanged && { clientId: d.clientId || null, clientName: newClientName }),
        ...(d.note?.trim()
          ? { notes: { create: { author: actor, body: d.note.trim() } } }
          : {}),
        audits: {
          create: auditEvents.map((a) => ({ ...a, actor, ipAddress, userAgent })),
        },
      },
      include: entryInclude,
    });

    if (statusChanged) {
      const verb =
        d.status === "REVIEWED" ? "reviewed" : d.status === "DISPUTED" ? "disputed" : "unreviewed";
      await prisma.activityLog.create({
        data: {
          actor,
          action: `contractor_hours_${verb}`,
          details: `${existing.contractor.name} hours on ${existing.workDate} (${existing.startLocal} to ${existing.endLocal}) → ${d.status}`,
          ipAddress,
          userAgent,
        },
      });
      if (d.status === "DISPUTED") {
        notifySlack(
          `:warning: ${actor} disputed *${existing.contractor.name}*'s hours on ${existing.workDate} (${existing.startLocal}–${existing.endLocal})${d.note?.trim() ? `\n> ${d.note.trim().slice(0, 300)}` : ""}`
        ).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, data: entry });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update entry" }, { status: 500 });
  }
}
