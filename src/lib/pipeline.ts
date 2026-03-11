import prisma from "@/lib/prisma";
import { sendOnboardingLinkEmail, sendContractEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { randomBytes } from "crypto";

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

    // Check if onboarding is already done
    const onboardingItems = await prisma.checklistItem.findMany({
      where: {
        clientId,
        label: { contains: "Onboarding", mode: "insensitive" },
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
          contractBody: getDefaultContractBody(client.name),
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

    // Auto-check onboarding checklist item
    await prisma.checklistItem.updateMany({
      where: {
        clientId,
        label: { contains: "Onboarding", mode: "insensitive" },
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

function getDefaultContractBody(clientName: string): string {
  return JSON.stringify({
    packages: ["social-media-management"],
    addons: [],
    customItems: [],
    clientName,
    generatedAt: new Date().toISOString(),
  });
}
