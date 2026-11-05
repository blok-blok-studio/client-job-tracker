import prisma from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { notifyUser } from "@/lib/notifications";
import { sendTelegramMessage } from "@/lib/telegram";
import { deliverLifecycleEmail, isDryRunAddress } from "./deliver";

/**
 * Approval mode: a due client email is rendered, held as AWAITING_APPROVAL,
 * and only sent when the owner taps send (Telegram button or the timeline).
 * The owner approves the exact text that was rendered; nothing is re-rendered.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ping the owner with the full email and Send / Skip buttons. Never contacts the client. */
export async function requestApproval(stepId: string): Promise<void> {
  const step = await prisma.scheduledStep.findUnique({
    where: { id: stepId },
    include: { client: { select: { id: true, name: true, email: true } } },
  });
  if (!step || !step.client) return;
  const { client } = step;
  const link = `/clients/${client.id}`;
  await notifySlack(
    `:inbox_tray: Waiting for your OK: *${step.renderedSubject}* to *${client.name}* (${client.email}). Send or skip it from Telegram or ${APP_URL}${link}`
  ).catch(() => {});
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) {
    await notifyUser({
      userId: o.id,
      type: "lifecycle_rehearsal",
      title: `Approve email to ${client.name}`,
      body: `${step.renderedSubject}. Not sent until you tap send.`,
      link,
      clientId: client.id,
    }).catch(() => {});
  }
  const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (adminChat) {
    const body = (step.renderedBody || "").slice(0, 3000);
    await sendTelegramMessage(
      adminChat,
      [
        `<b>Approve this email?</b>`,
        `To: ${esc(client.name)} (${esc(client.email || "")})`,
        `Subject: ${esc(step.renderedSubject || "")}`,
        "",
        esc(body),
      ].join("\n"),
      "HTML",
      {
        inline_keyboard: [[
          { text: "Send to client", callback_data: `lc:send:${step.id}` },
          { text: "Skip", callback_data: `lc:skip:${step.id}` },
        ]],
      }
    ).catch(() => {});
  }
}

export type ApprovalResult = { ok: true; message: string } | { ok: false; error: string };

/** Owner tapped send: deliver the exact rendered email once. */
export async function approveStep(stepId: string, actor: string): Promise<ApprovalResult> {
  // Claim first so a double tap (Telegram + timeline) can never send twice.
  // SENT is never picked up by the cron; a failed send puts it back.
  const claim = await prisma.scheduledStep.updateMany({
    where: { id: stepId, status: "AWAITING_APPROVAL" },
    data: { status: "SENT", dryRun: true },
  });
  if (claim.count === 0) return { ok: false, error: "Already handled, or not waiting for approval" };

  const step = await prisma.scheduledStep.findUnique({
    where: { id: stepId },
    include: { client: { select: { id: true, name: true, email: true } } },
  });
  const restore = () =>
    prisma.scheduledStep.update({ where: { id: stepId }, data: { status: "AWAITING_APPROVAL", dryRun: false } });
  if (!step?.client?.email || !step.renderedSubject || !step.renderedBody) {
    if (step) await restore();
    return { ok: false, error: "Nothing to send (no email address or no rendered text)" };
  }
  try {
    const result = await deliverLifecycleEmail({
      to: step.client.email,
      subject: step.renderedSubject,
      bodyText: step.renderedBody,
      forceDry: isDryRunAddress(step.client.email),
      approved: true,
    });
    if (!result.delivered) {
      // Keep it waiting so it can be sent once the problem is fixed
      await restore();
      return { ok: false, error: `Not sent: ${result.reason}` };
    }
    await prisma.scheduledStep.update({
      where: { id: stepId },
      data: { status: "SENT", dryRun: false, processedAt: new Date(), meta: { approvedBy: actor } },
    });
    await prisma.activityLog.create({
      data: {
        clientId: step.client.id,
        actor,
        action: "lifecycle_email_sent",
        details: `Approved and sent "${step.renderedSubject}" (${step.stepKey}) to ${step.client.email}`,
      },
    });
    return { ok: true, message: `Sent to ${step.client.name}` };
  } catch (err) {
    await restore();
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

/** Owner tapped skip: the email is never sent. */
export async function skipAwaitingStep(stepId: string, actor: string): Promise<ApprovalResult> {
  const res = await prisma.scheduledStep.updateMany({
    where: { id: stepId, status: "AWAITING_APPROVAL" },
    data: { status: "SKIPPED", cancelReason: `Skipped by ${actor}`, processedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, error: "Already handled, or not waiting for approval" };
  const step = await prisma.scheduledStep.findUnique({ where: { id: stepId }, select: { clientId: true, stepKey: true } });
  await prisma.activityLog.create({
    data: { clientId: step?.clientId || null, actor, action: "lifecycle_step_skipped", details: JSON.stringify({ step: step?.stepKey, via: "approval" }) },
  });
  return { ok: true, message: "Skipped, nothing was sent" };
}
