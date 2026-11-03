import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { SERVICE_PACKAGES, ADDON_PACKAGES } from "@/lib/contract-templates";
import { getCurrencyForCountry } from "@/lib/stripe";
import { sendContractSigningEmail, sendOnboardingLinkEmail } from "@/lib/email";
import { onPaymentConfirmed } from "@/lib/pipeline";

export interface ContractGenParams {
  packages: string[];
  addons: string[];
  customItems: Array<{ name: string; price: number; recurring?: boolean }>;
  packageCustomizations?: Record<string, { priceOverride?: number; excludedDeliverables?: number[] }>;
  country: string;
  paymentSchedule?: Array<{ label: string; percent: number }>;
  skipPayment: boolean;
  exchangeRate?: number;
  /** Fees were read from a prompt contract in this currency: amounts are final, no conversion */
  billingCurrency?: string;
}

export interface ContractSendResult {
  paymentLinks: Array<{ milestone: string; url: string; amount: number }>;
  paymentLinkError: string | null;
}

/**
 * Read the generation params persisted on a contract's `selectedPackages` JSON blob.
 * Tolerates legacy contracts that only stored packages/addons/customItems.
 */
export function readGenParams(selectedPackages: unknown): ContractGenParams {
  const sp = (selectedPackages || {}) as Record<string, unknown>;
  return {
    packages: Array.isArray(sp.packages) ? (sp.packages as string[]) : [],
    addons: Array.isArray(sp.addons) ? (sp.addons as string[]) : [],
    customItems: Array.isArray(sp.customItems)
      ? (sp.customItems as ContractGenParams["customItems"])
      : [],
    packageCustomizations:
      sp.packageCustomizations && typeof sp.packageCustomizations === "object"
        ? (sp.packageCustomizations as ContractGenParams["packageCustomizations"])
        : {},
    country: typeof sp.country === "string" ? sp.country : "US",
    paymentSchedule: Array.isArray(sp.paymentSchedule)
      ? (sp.paymentSchedule as ContractGenParams["paymentSchedule"])
      : undefined,
    skipPayment: sp.skipPayment === true,
    exchangeRate: typeof sp.exchangeRate === "number" ? sp.exchangeRate : undefined,
    billingCurrency: typeof sp.billingCurrency === "string" && /^[A-Z]{3}$/.test(sp.billingCurrency) ? sp.billingCurrency : undefined,
  };
}

async function billingCountry(clientId: string): Promise<string | null> {
  const [{ detectCountry }, { CLIENT_BILLING_SELECT }] = await Promise.all([import("@/lib/invoicing/country-detect"), import("@/lib/invoicing/service")]);
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: CLIENT_BILLING_SELECT });
  return c ? detectCountry(c)?.country ?? null : null;
}

/**
 * Send a contract to the client: create Stripe payment links, email the deposit/payment link,
 * and send the contract-signing + onboarding emails. Transitions a DRAFT contract to PENDING.
 *
 * Idempotency-lite: callers should only invoke this for DRAFT (or freshly created) contracts.
 * The payment-link math is identical to the original inline implementation in the contract POST route.
 */
export async function sendContract(
  contractId: string,
  sender?: { ipAddress: string | null; userAgent: string | null; sentBy?: string | null }
): Promise<ContractSendResult> {
  const contract = await prisma.contractSignature.findUnique({
    where: { id: contractId },
    include: {
      client: { select: { id: true, name: true, email: true, company: true, stripeCustomerId: true } },
    },
  });

  if (!contract) throw new Error("Contract not found");
  const client = contract.client;
  // Standard documents (NDA, Social Media agreement) are signature-only: no
  // payment links and no onboarding email ride along with them.
  const isStandardDoc = contract.kind !== "SERVICE_AGREEMENT";

  const params = readGenParams(contract.selectedPackages);
  const { exchangeRate } = params;

  let signingEmailId: string | null = null;
  let signingEmailDelivered = false;

  const paymentLinksCreated: ContractSendResult["paymentLinks"] = [];
  let paymentLinkError: string | null = null;

  const schedule =
    params.paymentSchedule && params.paymentSchedule.length > 0
      ? params.paymentSchedule
      : [{ label: "deposit" as const, percent: 100 }];

  if (!params.skipPayment && !isStandardDoc) {
    try {
      const convertAmount = (usd: number) =>
        !params.billingCurrency && exchangeRate ? Math.round(usd * exchangeRate * 100) / 100 : usd;
      const allItems = [
        ...SERVICE_PACKAGES.filter((p) => params.packages.includes(p.id)),
        ...ADDON_PACKAGES.filter((a) => params.addons.includes(a.id)),
      ];
      const getPrice = (item: { id: string; price: number }) =>
        convertAmount(params.packageCustomizations?.[item.id]?.priceOverride ?? item.price);
      const oneTimeTotal =
        allItems.filter((i) => !i.recurring).reduce((s, i) => s + getPrice(i), 0) +
        params.customItems.filter((i) => !i.recurring).reduce((s, i) => s + convertAmount(i.price), 0);

      const recurringItems = [
        ...allItems.filter((i) => i.recurring).map((i) => ({ name: i.name || i.id, price: getPrice(i) })),
        ...params.customItems.filter((i) => i.recurring).map((i) => ({ name: i.name, price: convertAmount(i.price) })),
      ];
      const recurringTotal = recurringItems.reduce((s, i) => s + i.price, 0);

      if (oneTimeTotal === 0 && recurringTotal === 0) {
        // $0 contract — skip payment, auto-confirm and send contract signing link directly
        await onPaymentConfirmed(client.id);
      } else if (oneTimeTotal > 0 || recurringTotal > 0) {
        // Bank transfer: draft invoices + paused plans now, issued when the client signs
        const { prepareContractBilling } = await import("@/lib/invoicing/contract-billing");
        const prepared = await prepareContractBilling(
          {
            contractId: contract.id,
            clientId: client.id,
            clientName: client.name,
            // Prompt contracts: the client's own country picks the invoice template
            country: params.billingCurrency ? (await billingCountry(client.id)) || params.country : params.country,
            currency: params.billingCurrency || getCurrencyForCountry(params.country).toUpperCase(),
            milestones: schedule.map((m) => ({
              label: m.label,
              title: m.label === "deposit" ? "Deposit" : m.label === "milestone" ? "Milestone" : "Completion",
              percent: m.percent,
              amount: Math.round(((oneTimeTotal * m.percent) / 100) * 100) / 100,
            })),
            recurring: recurringItems,
          },
          sender?.sentBy || "contract"
        );
        paymentLinksCreated.push(...prepared);
      }
    } catch (err) {
      console.error("[Contract] Failed to prepare invoices:", err);
      paymentLinkError = err instanceof Error ? err.message : "Failed to prepare invoices";
      await prisma.activityLog.create({
        data: {
          clientId: client.id,
          actor: "agent",
          action: "pipeline_error",
          details: `Contract created but invoices failed: ${paymentLinkError}`,
        },
      });
    }
  }

  // Send contract signing + onboarding emails in parallel
  if (client.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";
    const contractUrl = `${appUrl}/c/${contract.token}`;

    const emailTasks: Promise<void>[] = [];

    emailTasks.push(
      sendContractSigningEmail({
        to: client.email,
        clientName: client.name,
        contractUrl,
        documentTitle: isStandardDoc ? contract.title : undefined,
      })
        .then(async (sent) => {
          signingEmailId = sent?.id || null;
          signingEmailDelivered = !!sent;
          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              actor: "agent",
              action: "pipeline_contract_signing_sent",
              details: `Contract signing link sent to ${client.name} (${client.email})`,
            },
          });
        })
        .catch(async (emailErr) => {
          console.error("[Email] Contract signing email error:", emailErr);
          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              actor: "agent",
              action: "pipeline_error",
              details: `Failed to send contract signing email: ${emailErr instanceof Error ? emailErr.message : "Unknown error"}`,
            },
          });
        })
    );

    if (!isStandardDoc) emailTasks.push(
      (async () => {
        let onboardToken = (await prisma.client.findUnique({ where: { id: client.id }, select: { onboardToken: true } }))?.onboardToken;
        if (!onboardToken) {
          onboardToken = randomBytes(16).toString("base64url");
          await prisma.client.update({ where: { id: client.id }, data: { onboardToken } });
        }

        const onboardUrl = `${appUrl}/o/${onboardToken}`;

        await sendOnboardingLinkEmail({ to: client.email!, clientName: client.name, onboardUrl });
        await prisma.activityLog.create({
          data: {
            clientId: client.id,
            actor: "agent",
            action: "pipeline_onboard_sent",
            details: `Onboarding link sent to ${client.name} (${client.email})`,
          },
        });
      })().catch(async (emailErr) => {
        console.error("[Email] Onboarding email error:", emailErr);
        await prisma.activityLog.create({
          data: {
            clientId: client.id,
            actor: "agent",
            action: "pipeline_error",
            details: `Failed to send onboarding email: ${emailErr instanceof Error ? emailErr.message : "Unknown error"}`,
          },
        });
      })
    );

    await Promise.allSettled(emailTasks);
  }

  // Evidence trail: who released the document, when, from where, and to which
  // address the signing link went. Written even when no email could be sent
  // (the link was then shared by hand).
  await prisma.contractAuditLog
    .create({
      data: {
        contractId: contract.id,
        event: "sent",
        actor: "provider",
        ipAddress: sender?.ipAddress || null,
        userAgent: sender?.userAgent || null,
        metadata: JSON.stringify({
          sentBy: sender?.sentBy || null,
          sentTo: client.email || null,
          emailDelivered: signingEmailDelivered,
          emailId: signingEmailId,
          documentHash: contract.documentHash,
        }),
      },
    })
    .catch((err) => console.error("[Contract] sent audit entry failed:", err));

  // Move a draft into the active signing state once it has been sent
  if (contract.status === "DRAFT") {
    await prisma.contractSignature.update({
      where: { id: contract.id },
      data: { status: "PENDING" },
    });
  }

  return { paymentLinks: paymentLinksCreated, paymentLinkError };
}
