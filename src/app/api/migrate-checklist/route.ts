import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * One-time migration: update existing clients' checklist labels
 * from the old format to the new pipeline order.
 *
 * Hit GET /api/migrate-checklist to run.
 */

const LABEL_MAP: Record<string, string> = {
  "Payment method confirmed": "Payment confirmed",
  "Onboarding call completed": "Onboarding completed",
  "Credentials received": "__REMOVE__",
};

const NEW_PIPELINE_ORDER = [
  "Discovery call completed",
  "Payment confirmed",
  "Onboarding completed",
  "Contract signed",
  "Content calendar created",
  "First deliverable sent",
];

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      select: { id: true, name: true },
    });

    let updated = 0;
    let added = 0;
    let removed = 0;
    const details: string[] = [];

    for (const client of clients) {
      const items = await prisma.checklistItem.findMany({
        where: { clientId: client.id },
        orderBy: { sortOrder: "asc" },
      });

      // 1) Rename old labels or remove deprecated ones
      for (const item of items) {
        const newLabel = LABEL_MAP[item.label];
        if (newLabel && newLabel !== "__REMOVE__") {
          await prisma.checklistItem.update({
            where: { id: item.id },
            data: { label: newLabel },
          });
          updated++;
          details.push(`${client.name}: renamed "${item.label}" → "${newLabel}"`);
        } else if (newLabel === "__REMOVE__") {
          await prisma.checklistItem.delete({ where: { id: item.id } });
          removed++;
          details.push(`${client.name}: removed "${item.label}"`);
        }
      }

      // 2) Add missing pipeline steps
      const currentLabels = new Set(
        (
          await prisma.checklistItem.findMany({
            where: { clientId: client.id },
            select: { label: true },
          })
        ).map((i) => i.label)
      );

      for (const label of NEW_PIPELINE_ORDER) {
        if (!currentLabels.has(label)) {
          await prisma.checklistItem.create({
            data: {
              clientId: client.id,
              label,
              sortOrder: NEW_PIPELINE_ORDER.indexOf(label),
              checked: false,
            },
          });
          added++;
          details.push(`${client.name}: added missing "${label}"`);
        }
      }

      // 3) Fix sort order to match new pipeline
      const finalItems = await prisma.checklistItem.findMany({
        where: { clientId: client.id },
      });

      for (const item of finalItems) {
        const newOrder = NEW_PIPELINE_ORDER.indexOf(item.label);
        if (newOrder !== -1 && item.sortOrder !== newOrder) {
          await prisma.checklistItem.update({
            where: { id: item.id },
            data: { sortOrder: newOrder },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration complete: ${updated} renamed, ${added} added, ${removed} removed across ${clients.length} clients`,
      details,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
