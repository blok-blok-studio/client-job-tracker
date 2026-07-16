import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import Stripe from "stripe";
import { onPaymentConfirmed } from "@/lib/pipeline";
import {
  sendPaymentReceivedEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from "@/lib/email";
import { after } from "next/server";
import { notifySlack } from "@/lib/slack";

// Recalculate a client's monthly retainer from their LIVE active Stripe
// subscriptions (yearly plans normalized to /12). Returns the new value.
async function recalcRetainer(stripeCustomerId: string): Promise<number | null> {
  const client = await prisma.client.findUnique({ where: { stripeCustomerId } });
  if (!client) return null;

  let monthly = 0;
  const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "active", limit: 100 });
  for (const sub of subs.data) {
    for (const item of sub.items.data) {
      const price = item.price;
      if (!price?.unit_amount || !price.recurring) continue;
      const amt = (price.unit_amount / 100) * (item.quantity || 1);
      monthly += price.recurring.interval === "year" ? amt / 12
        : price.recurring.interval === "week" ? amt * 4.33
        : amt; // month
    }
  }
  monthly = Math.round(monthly * 100) / 100;

  if (Number(client.monthlyRetainer || 0) !== monthly) {
    await prisma.client.update({ where: { id: client.id }, data: { monthlyRetainer: monthly } });
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "stripe",
        action: "retainer_updated",
        details: `Monthly retainer recalculated from active subscriptions: $${monthly}/mo`,
      },
    }).catch(() => {});
  }
  return monthly;
}

// Resolve (or create) a command-center client for a Stripe customer object.
async function upsertClientFromStripeCustomer(customer: Stripe.Customer) {
  let client = await prisma.client.findUnique({ where: { stripeCustomerId: customer.id } });
  if (!client && customer.email) {
    client = await prisma.client.findFirst({
      where: { email: { equals: customer.email, mode: "insensitive" } },
    });
    if (client && !client.stripeCustomerId) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: { stripeCustomerId: customer.id, phone: client.phone || customer.phone || null },
      });
    }
  }
  if (!client && (customer.email || customer.name)) {
    client = await prisma.client.create({
      data: {
        name: customer.name || customer.email || "Stripe customer",
        email: customer.email?.toLowerCase() || null,
        phone: customer.phone || null,
        stripeCustomerId: customer.id,
        source: "Stripe",
        type: "ACTIVE",
      },
    });
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "stripe",
        action: "created_client",
        details: "Client created automatically from Stripe",
      },
    });
  }
  return client;
}

// Allow up to 60s for pipeline processing after payment
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Look up by session ID first (Checkout Sessions), then by payment link ID (legacy)
        let record = await prisma.paymentLink.findFirst({
          where: { stripeSessionId: session.id },
        });

        if (!record) {
          const paymentLinkId = session.payment_link as string | null;
          if (paymentLinkId) {
            record = await prisma.paymentLink.findUnique({
              where: { stripePaymentLink: paymentLinkId },
            });
          }
        }

        if (!record) break;

        const isSubscription = session.mode === "subscription";

        await prisma.paymentLink.update({
          where: { id: record.id },
          data: {
            status: isSubscription ? "ACTIVE" : "PAID",
            paidAt: new Date(),
            stripeSessionId: session.id,
            stripeSubscriptionId: (session.subscription as string) || null,
          },
        });

        // Link Stripe customer to our client if not already linked
        const stripeCustomer = session.customer as string | null;
        if (stripeCustomer) {
          await prisma.client.updateMany({
            where: { id: record.clientId, stripeCustomerId: null },
            data: { stripeCustomerId: stripeCustomer },
          });
        }

        // Note: checklist update is handled by onPaymentConfirmed in pipeline.ts
        const amountFormatted = (record.amount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: record.currency.toUpperCase(),
        });

        await prisma.activityLog.create({
          data: {
            clientId: record.clientId,
            actor: "stripe",
            action: isSubscription ? "subscription_started" : "payment_received",
            details: isSubscription
              ? `Subscription started: ${amountFormatted}/${record.interval} for ${record.description}`
              : `Payment of ${amountFormatted} received for ${record.description}`,
          },
        });

        // Retrieve Stripe invoice URL (for one-time payments with invoice_creation enabled)
        let stripeInvoiceId: string | null = null;
        let stripeInvoiceUrl: string | null = null;

        if (session.invoice) {
          const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice.id;
          try {
            const stripeInvoice = await stripe.invoices.retrieve(invoiceId);
            stripeInvoiceId = stripeInvoice.id;
            stripeInvoiceUrl = stripeInvoice.hosted_invoice_url ?? null;
          } catch (err) {
            console.error("[Webhook] Failed to retrieve Stripe invoice:", err);
          }
        }

        // Auto-generate invoice record
        await prisma.invoice.create({
          data: {
            clientId: record.clientId,
            amount: record.amount / 100,
            currency: record.currency.toUpperCase(),
            status: "PAID",
            country: record.country || "US",
            region: ["DE","AT","NL","BE","FR","ES","IT","IE","PT","FI","GR","LU"].includes(record.country || "") ? "EU" : "US",
            paidAt: new Date(),
            notes: record.description,
            stripeInvoiceId,
            stripeInvoiceUrl,
          },
        });

        // Send payment received email with invoice download link
        if (record.clientId) {
          const paidClient = await prisma.client.findUnique({
            where: { id: record.clientId },
            select: { email: true, name: true },
          });
          if (paidClient?.email) {
            const amtStr = (record.amount / 100).toLocaleString("en-US", {
              style: "currency",
              currency: record.currency.toUpperCase(),
            });
            await sendPaymentReceivedEmail({
              to: paidClient.email,
              clientName: paidClient.name,
              amount: amtStr,
              description: record.description,
              currency: record.currency,
              paidAt: new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
              invoiceUrl: stripeInvoiceUrl,
            }).catch((err) => console.error("[Email] Payment received email error:", err));
          }
        }

        // Trigger automated pipeline: send contract signing link + onboarding
        // MUST be awaited — Vercel serverless kills the process after response is sent,
        // so fire-and-forget promises may never complete
        await onPaymentConfirmed(record.clientId);

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        // Churn: recalc the client's retainer and raise the alarm in Slack
        {
          const custId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
          if (custId) {
            const newRetainer = await recalcRetainer(custId).catch(() => null);
            const churnClient = await prisma.client.findUnique({ where: { stripeCustomerId: custId }, select: { name: true } });
            const lostItem = subscription.items?.data?.[0];
            const lost = lostItem?.price?.unit_amount
              ? ((lostItem.price.unit_amount / 100) * (lostItem.quantity || 1)).toLocaleString("en-US", { style: "currency", currency: (lostItem.price.currency || "usd").toUpperCase() })
              : "a subscription";
            after(() =>
              notifySlack(
                `:rotating_light: *Subscription canceled* — ${lost}/${lostItem?.price?.recurring?.interval || "mo"} from *${churnClient?.name || "Unknown client"}*${newRetainer != null ? ` · retainer now $${newRetainer}/mo` : ""}`
              ).catch(() => {})
            );
          }
        }

        await prisma.paymentLink.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "CANCELLED" },
        });

        const cancelledRecord = await prisma.paymentLink.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (cancelledRecord) {
          await prisma.activityLog.create({
            data: {
              clientId: cancelledRecord.clientId,
              actor: "stripe",
              action: "subscription_cancelled",
              details: `Subscription cancelled: ${cancelledRecord.description}`,
            },
          });

          const cancelClient = await prisma.client.findUnique({
            where: { id: cancelledRecord.clientId },
            select: { name: true },
          });
          if (cancelClient) {
            sendSubscriptionCancelledEmail({
              clientName: cancelClient.name,
              description: cancelledRecord.description,
            }).catch((err) => console.error("[Email] Subscription cancelled email error:", err));
          }
        }

        break;
      }

      case "invoice.paid": {
        const paidInvoice = event.data.object as Stripe.Invoice;
        if (!paidInvoice.id) break;

        // Mark our record paid, or create one so Stripe-side invoices
        // still land in the command center
        const existing = await prisma.invoice.findUnique({
          where: { stripeInvoiceId: paidInvoice.id },
        });
        const paidAt = paidInvoice.status_transitions?.paid_at
          ? new Date(paidInvoice.status_transitions.paid_at * 1000)
          : new Date();

        let invClientId: string | null = existing?.clientId || null;
        if (existing) {
          await prisma.invoice.update({
            where: { id: existing.id },
            data: { status: "PAID", paidAt, stripeInvoiceUrl: paidInvoice.hosted_invoice_url || existing.stripeInvoiceUrl },
          });
        } else {
          const custId = typeof paidInvoice.customer === "string" ? paidInvoice.customer : paidInvoice.customer?.id;
          if (custId) {
            const customer = await stripe.customers.retrieve(custId).catch(() => null);
            const client = customer && !("deleted" in customer && customer.deleted)
              ? await upsertClientFromStripeCustomer(customer as Stripe.Customer)
              : null;
            if (client) {
              invClientId = client.id;
              await prisma.invoice.create({
                data: {
                  clientId: client.id,
                  amount: (paidInvoice.amount_paid || 0) / 100,
                  currency: (paidInvoice.currency || "usd").toUpperCase(),
                  status: "PAID",
                  paidAt,
                  notes: paidInvoice.description || (paidInvoice.number ? `Stripe invoice ${paidInvoice.number}` : "Stripe payment"),
                  stripeInvoiceId: paidInvoice.id,
                  stripeInvoiceUrl: paidInvoice.hosted_invoice_url || null,
                },
              });
            }
          }
        }

        if (invClientId) {
          const payer = await prisma.client.findUnique({ where: { id: invClientId }, select: { name: true } });
          const amt = ((paidInvoice.amount_paid || 0) / 100).toLocaleString("en-US", {
            style: "currency",
            currency: (paidInvoice.currency || "usd").toUpperCase(),
          });
          await prisma.activityLog.create({
            data: {
              clientId: invClientId,
              actor: "stripe",
              action: "invoice_paid",
              details: `Invoice paid: ${amt}${paidInvoice.number ? ` (${paidInvoice.number})` : ""}`,
            },
          }).catch(() => {});
          after(() =>
            notifySlack(`:moneybag: Payment received — *${amt}* from *${payer?.name || "Unknown client"}*`).catch(() => {})
          );
        }

        break;
      }

      case "customer.created":
      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        const client = await upsertClientFromStripeCustomer(customer);
        // On update: fill gaps only — never overwrite curated data
        if (client && event.type === "customer.updated") {
          await prisma.client.update({
            where: { id: client.id },
            data: {
              email: client.email || customer.email?.toLowerCase() || null,
              phone: client.phone || customer.phone || null,
            },
          }).catch(() => {});
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const sub = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = (typeof sub === "string" ? sub : sub?.id) ?? null;

        if (!subscriptionId) break;

        const failedRecord = await prisma.paymentLink.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });

        if (failedRecord) {
          await prisma.activityLog.create({
            data: {
              clientId: failedRecord.clientId,
              actor: "stripe",
              action: "payment_failed",
              details: `Subscription payment failed for ${failedRecord.description}`,
            },
          });

          const failedClient = await prisma.client.findUnique({
            where: { id: failedRecord.clientId },
            select: { name: true },
          });
          if (failedClient) {
            const amtStr = (failedRecord.amount / 100).toLocaleString("en-US", {
              style: "currency",
              currency: failedRecord.currency.toUpperCase(),
            });
            sendPaymentFailedEmail({
              clientName: failedClient.name,
              description: failedRecord.description,
              amount: amtStr,
            }).catch((err) => console.error("[Email] Payment failed email error:", err));
          }
        }

        break;
      }

      case "checkout.session.expired": {
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        await prisma.paymentLink.updateMany({
          where: { stripeSessionId: expiredSession.id, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const custId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        if (custId) {
          const newRetainer = await recalcRetainer(custId).catch(() => null);
          const client = await prisma.client.findUnique({ where: { stripeCustomerId: custId }, select: { name: true } });
          if (newRetainer != null) {
            after(() =>
              notifySlack(`:chart_with_upwards_trend: *New subscription* for *${client?.name || "Unknown client"}* · retainer now $${newRetainer}/mo`).catch(() => {})
            );
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        {
          const subscription = event.data.object as Stripe.Subscription;
          const custId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
          if (custId) await recalcRetainer(custId).catch(() => {});
        }
        const subscription = event.data.object as Stripe.Subscription;

        const subRecord = await prisma.paymentLink.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (!subRecord) break;

        const item = subscription.items.data[0];
        if (item && item.price.id !== subRecord.stripePriceId) {
          const newAmount = item.price.unit_amount ?? subRecord.amount;
          const oldAmount = subRecord.amount;

          await prisma.paymentLink.update({
            where: { id: subRecord.id },
            data: {
              amount: newAmount,
              stripePriceId: item.price.id,
            },
          });

          const symbol = subRecord.currency === "eur" ? "€" : "$";
          await prisma.activityLog.create({
            data: {
              clientId: subRecord.clientId,
              actor: "stripe",
              action: "subscription_price_changed",
              details: `Subscription price updated: ${symbol}${(oldAmount / 100).toFixed(2)} → ${symbol}${(newAmount / 100).toFixed(2)}/${subRecord.interval} for ${subRecord.description}`,
            },
          });
        }

        break;
      }

      case "payment_link.updated": {
        const link = event.data.object as Stripe.PaymentLink;
        if (!link.active) {
          await prisma.paymentLink.updateMany({
            where: { stripePaymentLink: link.id, status: "PENDING" },
            data: { status: "EXPIRED" },
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
