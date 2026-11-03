import prisma from "@/lib/prisma";

/**
 * Merge a duplicate client into the one being kept. Everything attached to the
 * duplicate moves over, blank contact fields on the kept client are filled in,
 * and the duplicate is archived (never deleted) with a note saying where it went.
 * Rows that would break a unique rule (same month report, same posting slot...)
 * stay on the archived duplicate rather than being thrown away.
 */
const FILL = ["email", "phone", "company", "industry", "timezone", "websiteUrl", "companyAddress", "companyCity", "companyState", "companyZip", "companyCountry", "taxId", "country"] as const;
const UNIQUE_FILL = ["stripeCustomerId", "telegramChatId"] as const;

// The transaction client of our extended Prisma instance
type Tx = Parameters<Extract<Parameters<typeof prisma.$transaction>[0], (...args: never[]) => unknown>>[0];
// Plain clientId moves, no unique rule involved
const SIMPLE: Array<(tx: Tx, from: string, to: string) => Promise<{ count: number }>> = [
  (tx, f, t) => tx.clientService.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contact.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.credential.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.task.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.notification.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.clientFile.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.meeting.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.timeEntry.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.checklistItem.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.invoice.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.studioInvoice.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.recurringPlan.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.quote.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.stripePayment.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.activityLog.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.supportTicket.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.socialLink.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contractSignature.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.paymentLink.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contentPost.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contentApproval.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.mediaRendition.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.clientMedia.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.deliverable.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.trendingSound.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contentSnippet.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.automationFlow.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contractorHoursEntry.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.contractorWorkFile.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.taxDocument.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.commission.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  (tx, f, t) => tx.client.updateMany({ where: { referrerId: f }, data: { referrerId: t } }),
];

export interface MergeResult { moved: number; keptOnDuplicate: number; filled: string[] }

export async function mergeClients(keepId: string, fromId: string, actor: string): Promise<MergeResult> {
  if (keepId === fromId) throw new Error("Pick a different client to merge in");
  return prisma.$transaction(async (tx) => {
    const [keep, from] = await Promise.all([tx.client.findUnique({ where: { id: keepId } }), tx.client.findUnique({ where: { id: fromId } })]);
    if (!keep || !from) throw new Error("Client not found");
    if (from.type === "ARCHIVED" && from.notes?.startsWith("Merged into")) throw new Error("That client was already merged");
    let moved = 0;
    let keptOnDuplicate = 0;
    for (const step of SIMPLE) moved += (await step(tx, fromId, keepId)).count;

    // Unique-keyed rows: move only those that do not clash with the kept client
    const reports = await tx.clientReport.findMany({ where: { clientId: fromId }, select: { id: true, month: true } });
    for (const r of reports) {
      if (await tx.clientReport.findFirst({ where: { clientId: keepId, month: r.month }, select: { id: true } })) keptOnDuplicate++;
      else { await tx.clientReport.update({ where: { id: r.id }, data: { clientId: keepId } }); moved++; }
    }
    const slots = await tx.postingSlot.findMany({ where: { clientId: fromId }, select: { id: true, weekday: true, time: true } });
    for (const s of slots) {
      if (await tx.postingSlot.findFirst({ where: { clientId: keepId, weekday: s.weekday, time: s.time }, select: { id: true } })) keptOnDuplicate++;
      else { await tx.postingSlot.update({ where: { id: s.id }, data: { clientId: keepId } }); moved++; }
    }
    const assigns = await tx.contractorClientAssignment.findMany({ where: { clientId: fromId }, select: { id: true, contractorId: true } });
    for (const a of assigns) {
      if (await tx.contractorClientAssignment.findFirst({ where: { clientId: keepId, contractorId: a.contractorId }, select: { id: true } })) keptOnDuplicate++;
      else { await tx.contractorClientAssignment.update({ where: { id: a.id }, data: { clientId: keepId } }); moved++; }
    }
    const steps = await tx.scheduledStep.findMany({ where: { clientId: fromId }, select: { id: true, contractorId: true, stepKey: true, occurrence: true } });
    for (const s of steps) {
      if (await tx.scheduledStep.findFirst({ where: { clientId: keepId, contractorId: s.contractorId, stepKey: s.stepKey, occurrence: s.occurrence }, select: { id: true } })) keptOnDuplicate++;
      else { await tx.scheduledStep.update({ where: { id: s.id }, data: { clientId: keepId } }); moved++; }
    }

    // Fill blanks on the kept client; unique values are cleared on the duplicate first
    const filled: string[] = [];
    const patch: Record<string, unknown> = {};
    for (const k of FILL) if (!keep[k] && from[k]) { patch[k] = from[k]; filled.push(k); }
    const clearOnFrom: Record<string, null> = {};
    for (const k of UNIQUE_FILL) if (!keep[k] && from[k]) { patch[k] = from[k]; clearOnFrom[k] = null; filled.push(k); }

    const stamp = new Date().toISOString().slice(0, 10);
    await tx.client.update({
      where: { id: fromId },
      data: { ...clearOnFrom, type: "ARCHIVED", notes: `Merged into ${keep.company || keep.name} (${keepId}) on ${stamp}.${from.notes ? `\n\n${from.notes}` : ""}` },
    });
    if (Object.keys(patch).length) await tx.client.update({ where: { id: keepId }, data: patch });
    await tx.activityLog.create({
      data: { clientId: keepId, actor, action: "client_merged", details: `Merged ${from.company || from.name} into this client: ${moved} records moved${filled.length ? `, filled ${filled.join(", ")}` : ""}${keptOnDuplicate ? `, ${keptOnDuplicate} clashing record(s) left on the archived duplicate` : ""}` },
    });
    return { moved, keptOnDuplicate, filled };
  }, { timeout: 60_000 });
}
