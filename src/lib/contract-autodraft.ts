import prisma from "@/lib/prisma";
import { CLIENT_PARTY_SELECT, missingPartyDetails, normalizeCountry } from "@/lib/client-party";
import { createClientContract, ContractCreateError } from "@/lib/contract-create";
import { notifySlack } from "@/lib/slack";
import { notifyUser } from "@/lib/notifications";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Draft the client's contract from the deal terms the owner wrote on the
 * client page (Client.contractBrief). Runs when onboarding completes, or when
 * the owner taps "Draft contract now". Always a DRAFT: nothing is sent to the
 * client. The owner reviews it on the client page and sends it himself.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export type AutoDraftResult =
  | { status: "drafted"; contractId: string; aiError: string | null }
  | { status: "skipped"; reason: string };

async function pingOwner(clientId: string, title: string, body: string) {
  const link = `/clients/${clientId}`;
  await notifySlack(`:memo: ${title}. ${body} ${APP_URL}${link}`).catch(() => {});
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) {
    await notifyUser({ userId: o.id, type: "onboarding_completed", title, body, link, clientId }).catch(() => {});
  }
  const chat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (chat) {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await sendTelegramMessage(chat, `<b>${esc(title)}</b>\n${esc(body)}\n\n${APP_URL}${link}`).catch(() => {});
  }
}

export async function autoDraftContract(
  clientId: string,
  opts: { trigger: "onboarding" | "manual"; actor?: string; notify?: boolean } = { trigger: "onboarding" }
): Promise<AutoDraftResult> {
  const notify = opts.notify !== false;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { ...CLIENT_PARTY_SELECT, contractBrief: true, automationsPaused: true },
  });
  if (!client) return { status: "skipped", reason: "Client not found" };
  const name = client.company || client.name;

  if (opts.trigger === "onboarding" && client.automationsPaused) {
    return { status: "skipped", reason: "Automations are paused for this client" };
  }

  // One service agreement at a time: never draft over one in progress or signed
  const existing = await prisma.contractSignature.findFirst({
    where: { clientId, kind: "SERVICE_AGREEMENT", status: { in: ["DRAFT", "PENDING", "SIGNED"] } },
    select: { status: true },
  });
  if (existing) {
    return { status: "skipped", reason: `A service agreement already exists (${existing.status.toLowerCase()})` };
  }

  const missing = missingPartyDetails(client);
  if (missing.length > 0) {
    // The onboarding ping already lists these; only speak up for a manual tap
    return { status: "skipped", reason: `Client details missing: ${missing.join(", ")}` };
  }

  const brief = client.contractBrief?.trim();
  if (!brief) {
    // The onboarding ping already tells the owner to add deal terms
    return { status: "skipped", reason: "No deal terms on file" };
  }

  try {
    const result = await createClientContract({
      clientId,
      packages: [],
      addons: [],
      customItems: [],
      customPrompt: brief,
      providerSignedName: "Chase Haynes",
      providerSignatureData: null,
      country: normalizeCountry(client.companyCountry) || "US",
      skipPayment: false,
      draft: true,
      createdBy: opts.trigger === "onboarding" ? "Automatic draft after onboarding" : `Draft from deal terms (${opts.actor || "owner"})`,
      actor: opts.trigger === "onboarding" ? "agent" : opts.actor || "chase",
      ipAddress: null,
      userAgent: null,
    });
    if (notify) {
      await pingOwner(
        clientId,
        `Contract draft ready for ${name}`,
        result.aiError
          ? `Drafted from the standard template because AI drafting failed (${result.aiError}). Review it under Contracts before sending. Nothing was sent to the client.`
          : "Drafted from your deal terms. Review it under Contracts and send it when it looks right. Nothing was sent to the client."
      );
    }
    return { status: "drafted", contractId: result.id, aiError: result.aiError };
  } catch (err) {
    const why = err instanceof ContractCreateError || err instanceof Error ? err.message : "Unknown error";
    console.error("[AutoDraft] failed:", err);
    await prisma.activityLog.create({
      data: { clientId, actor: "agent", action: "contract_autodraft_failed", details: `Automatic contract draft failed: ${why}` },
    }).catch(() => {});
    if (notify) await pingOwner(clientId, `Contract draft for ${name} failed`, why);
    return { status: "skipped", reason: why };
  }
}
