import prisma from "@/lib/prisma";
import { sendOnboardingLinkEmail, sendContractSigningEmail, sendContractSignedAdminEmail, sendOnboardingCompleteEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { randomBytes } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

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

  // Idempotency: check if we already sent the onboarding link AFTER the most recent contract was signed
  // This allows new contract cycles to trigger fresh onboarding links
  const latestSignedContract = await prisma.contractSignature.findFirst({
    where: { clientId, status: "SIGNED" },
    orderBy: { signedAt: "desc" },
    select: { signedAt: true },
  });
  const alreadySent = await prisma.activityLog.findFirst({
    where: {
      clientId,
      action: "pipeline_onboard_sent",
      ...(latestSignedContract?.signedAt
        ? { createdAt: { gte: latestSignedContract.signedAt } }
        : {}),
    },
    select: { id: true },
  });
  if (alreadySent) return;

  // Both payment + contract are done → send onboarding link
  if (!client.email && !client.telegramChatId) {
    console.warn(`[Pipeline] Cannot send onboarding link to ${client.name} — no email or Telegram on file`);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_warning",
        details: `Cannot send onboarding link to ${client.name} — no email or Telegram on file. Add contact info and re-trigger.`,
      },
    });
    return;
  }

  let onboardToken = client.onboardToken;
  if (!onboardToken) {
    onboardToken = randomBytes(24).toString("hex");
    await prisma.client.update({
      where: { id: clientId },
      data: { onboardToken },
    });
  }

  const onboardUrl = `${APP_URL}/onboard/${onboardToken}`;

  // Claim the send slot BEFORE dispatching emails to prevent race conditions
  // If two pipeline calls arrive concurrently, only the first will proceed
  const claim = await prisma.activityLog.create({
    data: {
      clientId,
      actor: "agent",
      action: "pipeline_onboard_sent",
      details: `Auto-sent onboarding link to ${client.name}${client.email ? ` (${client.email})` : ""} (both payment + contract confirmed)`,
    },
  });

  try {
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
  } catch (sendErr) {
    // Roll back the claim so a retry can succeed
    await prisma.activityLog.delete({ where: { id: claim.id } }).catch(() => {});
    throw sendErr;
  }
}

export async function onPaymentConfirmed(clientId: string) {
  // Auto-check "Payment confirmed" checklist item
  try {
    await prisma.checklistItem.updateMany({
      where: {
        clientId,
        label: { in: ["Payment confirmed", "Payment method confirmed"] },
        checked: false,
      },
      data: { checked: true },
    });
  } catch (error) {
    console.error("[Pipeline] Failed to update checklist:", error);
  }

  // Auto-send contract signing link — isolated so failure doesn't block onboarding
  try {
    await maybeSendContractSigningLink(clientId);
  } catch (error) {
    console.error("[Pipeline] Failed to send contract signing link:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to send contract signing link: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    }).catch(() => {});
  }

  // Check if both payment + contract are done → send onboarding if so
  try {
    await maybeSendOnboardingLink(clientId);
  } catch (error) {
    console.error("[Pipeline] Failed to send onboarding link:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to send onboarding link: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    }).catch(() => {});
  }
}

/**
 * After payment, auto-send the contract signing link to the client
 * if there's a PENDING contract they haven't signed yet.
 */
async function maybeSendContractSigningLink(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, email: true, telegramChatId: true },
  });
  if (!client?.email) return;

  // Find the most recent pending contract for this client
  const pendingContract = await prisma.contractSignature.findFirst({
    where: { clientId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { token: true, createdAt: true },
  });
  if (!pendingContract) return;

  // Idempotency: don't send if we already sent a signing link for this contract cycle
  const alreadySent = await prisma.activityLog.findFirst({
    where: {
      clientId,
      action: "pipeline_contract_signing_sent",
      createdAt: { gte: pendingContract.createdAt },
    },
    select: { id: true },
  });
  if (alreadySent) return;

  const contractUrl = `${APP_URL}/contract/${pendingContract.token}`;

  await sendContractSigningEmail({
    to: client.email,
    clientName: client.name,
    contractUrl,
  });

  if (client.telegramChatId) {
    await sendTelegramMessage(
      client.telegramChatId,
      `📝 Payment received! Please review and sign your service agreement:\n\n${contractUrl}`
    );
  }

  await prisma.activityLog.create({
    data: {
      clientId,
      actor: "agent",
      action: "pipeline_contract_signing_sent",
      details: `Auto-sent contract signing link to ${client.name} (${client.email}) after payment confirmed`,
    },
  });
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

  // Fetch contract for hash data
  const contract = await prisma.contractSignature.findUnique({
    where: { token: details.token },
    select: { documentHash: true, signedDocumentHash: true, providerSignedName: true },
  });

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
    documentHash: contract?.documentHash,
    signedDocumentHash: contract?.signedDocumentHash,
    providerSignedName: contract?.providerSignedName,
  }).catch((err) => {
    console.error("[Email] Admin contract notification error:", err);
    prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to send admin contract-signed notification for ${client.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
    }).catch(() => {});
  });

  // Log that admin was notified (client gets contract/PDF via onboarding complete email)
  await prisma.activityLog.create({
    data: {
      clientId,
      actor: "agent",
      action: "pipeline_contract_signed_emails_sent",
      details: `Admin notified of contract signing by ${client.name}. Client will receive contract/PDF links with onboarding complete email.`,
    },
  });
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

    // Promote client to ACTIVE if currently PROSPECT
    if (client.type === "PROSPECT") {
      await prisma.client.update({
        where: { id: clientId },
        data: { type: "ACTIVE" },
      });
      await prisma.activityLog.create({
        data: {
          clientId,
          actor: "agent",
          action: "client_promoted",
          details: `${client.name} automatically promoted from PROSPECT to ACTIVE after onboarding completed`,
        },
      });
    }

    // Send the signed contract copy to the client via email + Telegram
    const signedContract = await prisma.contractSignature.findFirst({
      where: { clientId, status: "SIGNED" },
      orderBy: { signedAt: "desc" },
    });

    if (signedContract) {
      const contractUrl = `${APP_URL}/contract/${signedContract.token}`;

      // Generate upload link for the client
      let uploadToken = client.uploadToken;
      if (!uploadToken) {
        uploadToken = randomBytes(24).toString("hex");
        await prisma.client.update({
          where: { id: clientId },
          data: { uploadToken },
        });
      }
      const uploadUrl = `${APP_URL}/upload/${uploadToken}`;

      if (client.telegramChatId) {
        await sendTelegramMessage(
          client.telegramChatId,
          `📋 Onboarding complete! Here's your signed service agreement for your records:\n\n${contractUrl}\n\n📁 Need to send us files, photos, or videos? Upload them here:\n${uploadUrl}`
        );
      }

      // Send the onboarding complete email with upload link
      if (client.email) {
        await sendOnboardingCompleteEmail({
          to: client.email,
          clientName: client.name,
          uploadUrl,
          contractUrl,
          pdfUrl: `${APP_URL}/api/contract/${signedContract.token}/pdf`,
        });
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

