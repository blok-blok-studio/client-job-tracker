import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { SERVICE_PACKAGES, ADDON_PACKAGES } from "@/lib/contract-templates";
import { createCheckoutSession, getCurrencyForCountry, CURRENCY_CONFIG } from "@/lib/stripe";
import { sendPaymentLinkEmail, sendContractSigningEmail, sendOnboardingLinkEmail } from "@/lib/email";
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
  };
}

/**
 * Send a contract to the client: create Stripe payment links, email the deposit/payment link,
 * and send the contract-signing + onboarding emails. Transitions a DRAFT contract to PENDING.
 *
 * Idempotency-lite: callers should only invoke this for DRAFT (or freshly created) contracts.
 * The payment-link math is identical to the original inline implementation in the contract POST route.
 */
export async function sendContract(contractId: string): Promise<ContractSendResult> {
  const contract = await prisma.contractSignature.findUnique({
    where: { id: contractId },
    include: {
      client: { select: { id: true, name: true, email: true, company: true, stripeCustomerId: true } },
    },
  });

  if (!contract) throw new Error("Contract not found");
  const client = contract.client;

  const params = readGenParams(contract.selectedPackages);
  const { exchangeRate } = params;

  const paymentLinksCreated: ContractSendResult["paymentLinks"] = [];
  let paymentLinkError: string | null = null;

  const schedule =
    params.paymentSchedule && params.paymentSchedule.length > 0
      ? params.paymentSchedule
      : [{ label: "deposit" as const, percent: 100 }];

  if (!params.skipPayment) {
    try {
      const convertAmount = (usd: number) =>
        exchangeRate ? Math.round(usd * exchangeRate * 100) / 100 : usd;
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
        const currency = getCurrencyForCountry(params.country);
        const currencyConfig = CURRENCY_CONFIG[currency];
        let latestStripeCustomerId = client.stripeCustomerId;

        for (const milestone of schedule) {
          const milestoneAmount = Math.round(((oneTimeTotal * milestone.percent) / 100) * 100) / 100;
          if (milestoneAmount <= 0) continue;

          const milestoneLabel =
            milestone.label === "deposit" ? "Deposit" : milestone.label === "milestone" ? "Milestone" : "Completion";
          const description = `${milestoneLabel} (${milestone.percent}%) — ${client.name}`;

          const result = await createCheckoutSession({
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            stripeCustomerId: latestStripeCustomerId,
            amount: milestoneAmount,
            description,
            currency,
            country: params.country,
            contractId: contract.id,
            milestone: milestone.label,
          });

          latestStripeCustomerId = result.stripeCustomerId;

          paymentLinksCreated.push({ milestone: milestone.label, url: result.url, amount: milestoneAmount });

          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              actor: "chase",
              action: "payment_link_created",
              details: `${milestoneLabel} payment link created: ${currencyConfig.symbol}${milestoneAmount.toLocaleString()} (${milestone.percent}%) for contract`,
            },
          });
        }

        // Recurring subscription checkout sessions
        for (const item of recurringItems) {
          if (item.price <= 0) continue;

          const result = await createCheckoutSession({
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            stripeCustomerId: latestStripeCustomerId,
            amount: item.price,
            description: `${item.name} (monthly) — ${client.name}`,
            currency,
            country: params.country,
            contractId: contract.id,
            recurring: true,
            interval: "month",
          });

          latestStripeCustomerId = result.stripeCustomerId;

          paymentLinksCreated.push({ milestone: "subscription", url: result.url, amount: item.price });

          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              actor: "chase",
              action: "payment_link_created",
              details: `Subscription link created: ${currencyConfig.symbol}${item.price.toLocaleString()}/mo for ${item.name}`,
            },
          });
        }

        // Auto-send first payment link via email (deposit or full payment)
        const firstLink = paymentLinksCreated[0];
        if (firstLink && client.email) {
          const amountFormatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency.toUpperCase(),
          }).format(firstLink.amount);

          const isFullPayment = schedule.length === 1 && schedule[0].percent === 100;
          try {
            const emailResult = await sendPaymentLinkEmail({
              to: client.email,
              clientName: client.name,
              amount: amountFormatted,
              description: isFullPayment ? `Payment — ${client.name}` : `Deposit — ${client.name}`,
              paymentUrl: firstLink.url,
              recurring: false,
              interval: null,
            });
            if (emailResult) {
              await prisma.activityLog.create({
                data: {
                  clientId: client.id,
                  actor: "agent",
                  action: "payment_email_sent",
                  details: `Payment link email sent to ${client.email} for ${amountFormatted}`,
                },
              });
            } else {
              console.warn("[Email] Payment link email returned null (RESEND_API_KEY missing?)");
              await prisma.activityLog.create({
                data: {
                  clientId: client.id,
                  actor: "agent",
                  action: "pipeline_error",
                  details: `Payment link email skipped — email service not configured`,
                },
              });
            }
          } catch (emailErr) {
            console.error("[Email] Payment link email error:", emailErr);
            await prisma.activityLog.create({
              data: {
                clientId: client.id,
                actor: "agent",
                action: "pipeline_error",
                details: `Payment link email failed: ${emailErr instanceof Error ? emailErr.message : "Unknown error"}`,
              },
            });
          }
        }
      }
    } catch (err) {
      console.error("[Contract] Failed to create payment links:", err);
      paymentLinkError = err instanceof Error ? err.message : "Failed to create payment links";
      await prisma.activityLog.create({
        data: {
          clientId: client.id,
          actor: "agent",
          action: "pipeline_error",
          details: `Contract created but payment links failed: ${paymentLinkError}`,
        },
      });
    }
  }

  // Send contract signing + onboarding emails in parallel
  if (client.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";
    const contractUrl = `${appUrl}/contract/${contract.token}`;

    const emailTasks: Promise<void>[] = [];

    emailTasks.push(
      sendContractSigningEmail({ to: client.email, clientName: client.name, contractUrl })
        .then(async () => {
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

    emailTasks.push(
      (async () => {
        let onboardToken = (await prisma.client.findUnique({ where: { id: client.id }, select: { onboardToken: true } }))?.onboardToken;
        if (!onboardToken) {
          onboardToken = randomBytes(24).toString("hex");
          await prisma.client.update({ where: { id: client.id }, data: { onboardToken } });
        }

        const onboardUrl = `${appUrl}/onboard/${onboardToken}`;

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

  // Move a draft into the active signing state once it has been sent
  if (contract.status === "DRAFT") {
    await prisma.contractSignature.update({
      where: { id: contract.id },
      data: { status: "PENDING" },
    });
  }

  return { paymentLinks: paymentLinksCreated, paymentLinkError };
}
