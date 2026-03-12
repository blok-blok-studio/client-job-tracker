import prisma from "@/lib/prisma";
import { sendOnboardingLinkEmail, sendContractEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { randomBytes } from "crypto";
import { generateContractBody } from "@/lib/contract-templates";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://client-job-tracker.vercel.app";

/**
 * Automated onboarding pipeline:
 * Payment confirmed → send onboarding link
 * Onboarding completed → auto-generate and send contract
 *
 * All steps are fire-and-forget with logging.
 */

export async function onPaymentConfirmed(clientId: string) {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) return;

    // Check if onboarding is already done (handle both old and new labels)
    const onboardingItems = await prisma.checklistItem.findMany({
      where: {
        clientId,
        label: { in: ["Onboarding completed", "Onboarding call completed"] },
      },
      select: { checked: true },
    });

    const alreadyOnboarded = onboardingItems.some((c) => c.checked);
    if (alreadyOnboarded) return;

    // Generate a new onboard token if none exists (it gets cleared after use)
    let onboardToken = client.onboardToken;
    if (!onboardToken) {
      onboardToken = randomBytes(24).toString("hex");
      await prisma.client.update({
        where: { id: clientId },
        data: { onboardToken },
      });
    }

    const onboardUrl = `${APP_URL}/onboard/${onboardToken}`;

    // Send via email if available
    if (client.email) {
      await sendOnboardingLinkEmail({
        to: client.email,
        clientName: client.name,
        onboardUrl,
      });
    }

    // Also send via Telegram if connected
    if (client.telegramChatId) {
      await sendTelegramMessage(
        client.telegramChatId,
        `✅ Payment received! Next step: please complete your onboarding form so we can get started.\n\n${onboardUrl}`
      );
    }

    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_onboard_sent",
        details: `Auto-sent onboarding link to ${client.name}${client.email ? ` (${client.email})` : ""}`,
      },
    });
  } catch (error) {
    console.error("[Pipeline] Failed to send onboarding link:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to send onboarding link: ${error instanceof Error ? error.message : "Unknown error"}`,
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

    // Check if there's already a pending contract
    const existingContracts = await prisma.contractSignature.findMany({
      where: { clientId, status: "PENDING" },
      select: { id: true, token: true },
      take: 1,
    });

    let contractToken: string;
    if (existingContracts.length > 0) {
      contractToken = existingContracts[0].token;
    } else {
      // Auto-generate a contract
      contractToken = randomBytes(24).toString("hex");

      // Use a default contract body — Chase can customize later
      await prisma.contractSignature.create({
        data: {
          clientId,
          token: contractToken,
          contractBody: getDefaultContractBody(client.name, client.company),
        },
      });

      await prisma.activityLog.create({
        data: {
          clientId,
          actor: "agent",
          action: "pipeline_contract_created",
          details: `Auto-generated service agreement for ${client.name}`,
        },
      });
    }

    const contractUrl = `${APP_URL}/contract/${contractToken}`;

    // Send via email
    if (client.email) {
      await sendContractEmail({
        to: client.email,
        clientName: client.name,
        contractUrl,
      });
    }

    // Also send via Telegram
    if (client.telegramChatId) {
      await sendTelegramMessage(
        client.telegramChatId,
        `📋 Onboarding complete! Last step: please review and sign your service agreement.\n\n${contractUrl}`
      );
    }

    // Auto-check onboarding checklist item (handle both old and new labels)
    await prisma.checklistItem.updateMany({
      where: {
        clientId,
        label: { in: ["Onboarding completed", "Onboarding call completed"] },
        checked: false,
      },
      data: { checked: true },
    });

    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_contract_sent",
        details: `Auto-sent contract to ${client.name}${client.email ? ` (${client.email})` : ""}`,
      },
    });
  } catch (error) {
    console.error("[Pipeline] Failed to send contract:", error);
    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "agent",
        action: "pipeline_error",
        details: `Failed to send contract: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

/**
 * Called after contract is signed — auto-creates content calendar task
 * and checks the "Contract signed" checklist item.
 */
export async function onContractSigned(clientId: string) {
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
      dueDate.setDate(dueDate.getDate() + 3); // 3 days from now

      await prisma.task.create({
        data: {
          clientId,
          title: "Create content calendar",
          description: "Auto-generated after contract signed. Set up the content calendar for this client.",
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
          details: "Auto-created content calendar task after contract signed",
        },
      });
    }
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

function getDefaultContractBody(clientName: string, company: string | null): string {
  // Generate a real formatted contract using the template system
  // Default to social media management package if no specific package is known
  return generateContractBody(
    clientName,
    company,
    ["social-starter-mgmt"], // Default starter package — Chase can customize from the portal
    [],
    [],
  );
}
