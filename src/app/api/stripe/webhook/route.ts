import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import Stripe from "stripe";
import { onPaymentConfirmed } from "@/lib/pipeline";

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

        // Trigger automated pipeline: send onboarding link
        onPaymentConfirmed(record.clientId).catch((err) =>
          console.error("[Pipeline] onPaymentConfirmed error:", err)
        );

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
