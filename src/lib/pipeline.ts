import prisma from "@/lib/prisma";
import { sendOnboardingLinkEmail, sendContractEmail, sendContractSignedClientEmail, sendContractSignedAdminEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { randomBytes } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://client-job-tracker.vercel.app";

/**
 * Flexible onboarding pipeline:
 * - Payment and Contract can happen in ANY order
 * - Once BOTH are done → auto-send onboarding link
 * - After onboarding completed → send signed contract copy to client email + Telegram
 *
 * All steps are fire-and-forget with logging.
 */

/**
 * Helper: check whether both payment and contract are done for a client.
 * If so, auto-send the onboarding link.
 */
async function maybeSendOnboardingLink(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });
  if (!client) return;

  // Check if payment is confirmed
  const paymentItems = await prisma.checklistItem.findMany({
    where: {
      clientId,
      label: { in: ["Payment confirmed", "Payment method confirmed"] },
    },
    select: { checked: true },
  });
  const paymentDone = paymentItems.some((i) => i.checked);

  // Check if contract is signed
  const contractItems = await prisma.checklistItem.findMany({
    where: {
      clientId,
      label: "Contract signed",
    },
    select: { checked: true },
  });
  const contractDone = contractItems.some((i) => i.checked);

  if (!paymentDone || !contractDone) return; // Not both done yet

  // Check if onboarding is already done
  const onboardingItems = await prisma.checklistItem.findMany({
    where: {
      clientId,
      label: { in: ["Onboarding completed", "Onboarding call completed"] },
    },
    select: { checked: true },
  });
  const alreadyOnboarded = onboardingItems.some((i) => i.checked);
  if (alreadyOnboarded) return;

  // Idempotency: check if we already sent the onboarding link (prevents duplicates on webhook retries)
  const alreadySent = await prisma.activityLog.findFirst({
    where: { clientId, action: "pipeline_onboard_sent" },
    select: { id: true },
  });
  if (alreadySent) return;

  // Both payment + contract are done → send onboarding link
  let onboardToken = client.onboardToken;
  if (!onboardToken) {
    onboardToken = randomBytes(24).toString("hex");
    await prisma.client.update({
      where: { id: clientId },
      data: { onboardToken },
    });
  }

  const onboardUrl = `${APP_URL}/onboard/${onboardToken}`;

  if (client.email) {
    await sendOnboardingLinkEmail({
      to: client.email,
      clientName: client.name,
      onboardUrl,
    });
  }

  if (client.telegramChatId) {
    await sendTelegramMessage(
      client.telegramChatId,
      `✅ Payment and contract are all set! Last step: please complete your onboarding form so we can get started.\n\n${onboardUrl}`
    );
  }

  await prisma.activityLog.create({
    data: {
      clientId,
      actor: "agent",
      action: "pipeline_onboard_sent",
      details: `Auto-sent onboarding link to ${client.name}${client.email ? ` (${client.email})` : ""} (both payment + contract confirmed)`,
    },
  });
}

export async function onPaymentConfirmed(clientId: string) {
  try {
    // Auto-check "Payment confirmed" checklist item
    await prisma.checklistItem.updateMany({
      where: {
        clientId,
        label: { in: ["Payment confirmed", "Payment method confirmed"] },
        checked: false,
      },
      data: { checked: true },
    });

    // Check if both payment + contract are done → send onboarding if so
    await maybeSendOnboardingLink(clientId);
  } catch (error) {
    console.error("[Pipeline] Failed to process payment confirmed:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to process payment confirmed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

export async function onContractSigned(
  clientId: string,
  signingDetails?: { signedName: string; ipAddress: string; token: string }
) {
  try {
    // Auto-check "Contract signed" checklist item
    await prisma.checklistItem.updateMany({
      where: {
        clientId,
        label: "Contract signed",
        checked: false,
      },
      data: { checked: true },
    });

    // Send contract-signed emails (to client + Chase)
    if (signingDetails) {
      await sendContractSignedEmails(clientId, signingDetails);
    }

    // Check if both payment + contract are done → send onboarding if so
    await maybeSendOnboardingLink(clientId);
  } catch (error) {
    console.error("[Pipeline] Failed to process contract signed:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to process contract signed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

/**
 * Helper: send contract-signed notification emails.
 * - Client gets a confirmation email with link to their signed contract
 * - Chase gets a notification email with signing details
 * - If client has no email yet, defers client email until onboarding completes
 */
async function sendContractSignedEmails(
  clientId: string,
  details: { signedName: string; ipAddress: string; token: string }
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, email: true, company: true },
  });
  if (!client) return;

  const contractUrl = `${APP_URL}/contract/${details.token}`;
  const signedAt = new Date();

  // Always notify Chase immediately
  sendContractSignedAdminEmail({
    clientName: client.name,
    company: client.company,
    signedName: details.signedName,
    contractUrl,
    signedAt,
    ipAddress: details.ipAddress,
  }).catch((err) => console.error("[Email] Admin contract notification error:", err));

  // Send client confirmation if email exists
  if (client.email) {
    await sendContractSignedClientEmail({
      to: client.email,
      clientName: client.name,
      contractUrl,
      signedAt,
    });

    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_contract_signed_emails_sent",
        details: `Sent contract-signed confirmation to ${client.name} (${client.email}) and admin notification`,
      },
    });
  } else {
    // No client email yet — log that it's deferred until onboarding
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_contract_signed_admin_only",
        details: `Admin notified of contract signing by ${client.name}. Client email deferred — no email on file yet.`,
      },
    });
  }
}

export async function onOnboardingCompleted(clientId: string) {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) return;

    // Auto-check onboarding checklist item
    await prisma.checklistItem.updateMany({
      where: {
        clientId,
        label: { in: ["Onboarding completed", "Onboarding call completed"] },
        checked: false,
      },
      data: { checked: true },
    });

    // Send the signed contract copy to the client via email + Telegram
    const signedContract = await prisma.contractSignature.findFirst({
      where: { clientId, status: "SIGNED" },
      orderBy: { signedAt: "desc" },
    });

    if (signedContract) {
      const contractUrl = `${APP_URL}/contract/${signedContract.token}`;

      // Check if the contract-signed confirmation email was deferred (client had no email at signing time)
      const alreadySentContractConfirmation = await prisma.activityLog.findFirst({
        where: { clientId, action: "pipeline_contract_signed_emails_sent" },
        select: { id: true },
      });

      if (!alreadySentContractConfirmation && client.email) {
        // Client now has an email — send the deferred contract-signed confirmation
        await sendContractSignedClientEmail({
          to: client.email,
          clientName: client.name,
          contractUrl,
          signedAt: signedContract.signedAt || new Date(),
        });

        await prisma.activityLog.create({
          data: {
            clientId,
            actor: "agent",
            action: "pipeline_contract_signed_emails_sent",
            details: `Sent deferred contract-signed confirmation to ${client.name} (${client.email}) after onboarding provided email`,
          },
        });
      }

      if (client.email) {
        await sendContractEmail({
          to: client.email,
          clientName: client.name,
          contractUrl,
        });
      }

      if (client.telegramChatId) {
        await sendTelegramMessage(
          client.telegramChatId,
          `📋 Onboarding complete! Here's your signed service agreement for your records:\n\n${contractUrl}`
        );
      }

      await prisma.activityLog.create({
        data: {
          clientId,
          actor: "agent",
          action: "pipeline_contract_copy_sent",
          details: `Sent signed contract copy to ${client.name} after onboarding completed`,
        },
      });
    }

    // Auto-create "Content calendar" task if one doesn't already exist
    const existingCalendarTask = await prisma.task.findFirst({
      where: {
        clientId,
        title: { contains: "content calendar", mode: "insensitive" },
        status: { notIn: ["DONE"] },
      },
    });

    if (!existingCalendarTask) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);

      await prisma.task.create({
        data: {
          clientId,
          title: "Create content calendar",
          description: "Auto-generated after onboarding completed. Set up the content calendar for this client.",
          priority: "HIGH",
          category: "CONTENT_CREATION",
          status: "TODO",
          assignedTo: "chase",
          dueDate,
        },
      });

      await prisma.activityLog.create({
        data: {
          clientId,
          actor: "agent",
          action: "pipeline_task_created",
          details: "Auto-created content calendar task after onboarding completed",
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_onboarding_processed",
        details: `Processed onboarding completion for ${client.name}`,
      },
    });
  } catch (error) {
    console.error("[Pipeline] Failed to process onboarding completed:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to process onboarding completed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

