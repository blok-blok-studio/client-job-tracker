import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import Stripe from "stripe";

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
        const paymentLinkId = session.payment_link as string | null;

        if (!paymentLinkId) break;

        // Find our payment link record
        const record = await prisma.paymentLink.findUnique({
          where: { stripePaymentLink: paymentLinkId },
        });

        if (!record) break;

        // Mark as paid
        await prisma.paymentLink.update({
          where: { id: record.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            stripeSessionId: session.id,
          },
        });

        // Auto-check "Payment received" on client checklist
        await prisma.checklistItem.updateMany({
          where: {
            clientId: record.clientId,
            label: { contains: "Payment", mode: "insensitive" },
            checked: false,
          },
          data: { checked: true },
        });

        // Log activity
        const amountFormatted = (record.amount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });

        await prisma.activityLog.create({
          data: {
            clientId: record.clientId,
            actor: "stripe",
            action: "payment_received",
            details: `Payment of ${amountFormatted} received for ${record.description}`,
          },
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
