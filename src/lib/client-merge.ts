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

// Plain clientId moves, no unique rule involved. Built as one batch so Accelerate runs it
// as a single atomic request (its interactive transactions are capped at 15 seconds).
const simpleMoves = (f: string, t: string) => [
  prisma.clientService.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contact.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.credential.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.task.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.notification.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.clientFile.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.meeting.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.timeEntry.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.checklistItem.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.invoice.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.studioInvoice.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.recurringPlan.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.quote.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.stripePayment.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.activityLog.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.supportTicket.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.socialLink.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contractSignature.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.paymentLink.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contentPost.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contentApproval.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.mediaRendition.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.clientMedia.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.deliverable.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.trendingSound.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contentSnippet.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.automationFlow.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contractorHoursEntry.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.contractorWorkFile.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.taxDocument.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.commission.updateMany({ where: { clientId: f }, data: { clientId: t } }),
  prisma.client.updateMany({ where: { referrerId: f }, data: { referrerId: t } }),
];

export interface MergeResult { moved: number; keptOnDuplicate: number; filled: string[] }

export async function mergeClients(keepId: string, fromId: string, actor: string): Promise<MergeResult> {
  if (keepId === fromId) throw new Error("Pick a different client to merge in");
  const [keep, from] = await Promise.all([prisma.client.findUnique({ where: { id: keepId } }), prisma.client.findUnique({ where: { id: fromId } })]);
  if (!keep || !from) throw new Error("Client not found");
  if (from.type === "ARCHIVED" && from.notes?.startsWith("Merged into")) throw new Error("That client was already merged");

  // Unique-keyed rows: move only those that do not clash with the kept client
  const [reports, keepReports, slots, keepSlots, assigns, keepAssigns, steps, keepSteps] = await Promise.all([
    prisma.clientReport.findMany({ where: { clientId: fromId }, select: { id: true, month: true } }),
    prisma.clientReport.findMany({ where: { clientId: keepId }, select: { month: true } }),
    prisma.postingSlot.findMany({ where: { clientId: fromId }, select: { id: true, weekday: true, time: true } }),
    prisma.postingSlot.findMany({ where: { clientId: keepId }, select: { weekday: true, time: true } }),
    prisma.contractorClientAssignment.findMany({ where: { clientId: fromId }, select: { id: true, contractorId: true } }),
    prisma.contractorClientAssignment.findMany({ where: { clientId: keepId }, select: { contractorId: true } }),
    prisma.scheduledStep.findMany({ where: { clientId: fromId }, select: { id: true, contractorId: true, stepKey: true, occurrence: true } }),
    prisma.scheduledStep.findMany({ where: { clientId: keepId }, select: { contractorId: true, stepKey: true, occurrence: true } }),
  ]);
  const has = (list: unknown[], key: string) => list.some((x) => JSON.stringify(x) === key);
  const moveReports = reports.filter((r) => !has(keepReports, JSON.stringify({ month: r.month }))).map((r) => r.id);
  const moveSlots = slots.filter((r) => !has(keepSlots, JSON.stringify({ weekday: r.weekday, time: r.time }))).map((r) => r.id);
  const moveAssigns = assigns.filter((r) => !has(keepAssigns, JSON.stringify({ contractorId: r.contractorId }))).map((r) => r.id);
  const moveSteps = steps.filter((r) => !has(keepSteps, JSON.stringify({ contractorId: r.contractorId, stepKey: r.stepKey, occurrence: r.occurrence }))).map((r) => r.id);
  const keptOnDuplicate = reports.length + slots.length + assigns.length + steps.length - moveReports.length - moveSlots.length - moveAssigns.length - moveSteps.length;

  // Fill blanks on the kept client; unique values are cleared on the duplicate first
  const filled: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const k of FILL) if (!keep[k] && from[k]) { patch[k] = from[k]; filled.push(k); }
  const clearOnFrom: Record<string, null> = {};
  for (const k of UNIQUE_FILL) if (!keep[k] && from[k]) { patch[k] = from[k]; clearOnFrom[k] = null; filled.push(k); }

  const stamp = new Date().toISOString().slice(0, 10);
  const moves = [
    ...simpleMoves(fromId, keepId),
    prisma.clientReport.updateMany({ where: { id: { in: moveReports } }, data: { clientId: keepId } }),
    prisma.postingSlot.updateMany({ where: { id: { in: moveSlots } }, data: { clientId: keepId } }),
    prisma.contractorClientAssignment.updateMany({ where: { id: { in: moveAssigns } }, data: { clientId: keepId } }),
    prisma.scheduledStep.updateMany({ where: { id: { in: moveSteps } }, data: { clientId: keepId } }),
  ];
  const results = await prisma.$transaction([
    ...moves,
    prisma.client.update({ where: { id: fromId }, data: { ...clearOnFrom, type: "ARCHIVED", notes: `Merged into ${keep.company || keep.name} (${keepId}) on ${stamp}.${from.notes ? `\n\n${from.notes}` : ""}` } }),
    prisma.client.update({ where: { id: keepId }, data: patch }),
  ]);
  const moved = (results.slice(0, moves.length) as Array<{ count: number }>).reduce((n, r) => n + r.count, 0);
  await prisma.activityLog.create({
    data: { clientId: keepId, actor, action: "client_merged", details: `Merged ${from.company || from.name} into this client: ${moved} records moved${filled.length ? `, filled ${filled.join(", ")}` : ""}${keptOnDuplicate ? `, ${keptOnDuplicate} clashing record(s) left on the archived duplicate` : ""}` },
  });
  return { moved, keptOnDuplicate, filled };
}
