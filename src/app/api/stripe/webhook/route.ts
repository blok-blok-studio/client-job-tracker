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

// Allow up to 60s for pipeline processing after payment
export const maxDuration = 60;

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

        // Update our invoice record with the Stripe hosted URL if we have a matching record
        if (paidInvoice.id && paidInvoice.hosted_invoice_url) {
          await prisma.invoice.updateMany({
            where: { stripeInvoiceId: paidInvoice.id },
            data: { stripeInvoiceUrl: paidInvoice.hosted_invoice_url },
          });
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

      case "customer.subscription.updated": {
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
