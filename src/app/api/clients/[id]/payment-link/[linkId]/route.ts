import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendPaymentLinkEmail } from "@/lib/email";
import { z } from "zod";

const updateSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  prorate: z.boolean().default(true),
});

// PATCH — Update subscription price (upgrade/downgrade)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;

  try {
    const link = await prisma.paymentLink.findFirst({
      where: { id: linkId, clientId: id },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    if (!link.recurring || link.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Can only update active subscriptions" },
        { status: 400 }
      );
    }

    if (!link.stripeSubscriptionId || !link.stripeProductId) {
      return NextResponse.json(
        { success: false, error: "Missing Stripe subscription data" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const newAmountInCents = Math.round(parsed.amount * 100);

    if (newAmountInCents === link.amount) {
      return NextResponse.json(
        { success: false, error: "New amount is the same as the current amount" },
        { status: 400 }
      );
    }

    // Create a new price on the same product
    const newPrice = await stripe.prices.create({
      product: link.stripeProductId,
      unit_amount: newAmountInCents,
      currency: link.currency,
      recurring: { interval: link.interval as "month" | "year" },
    });

    // Retrieve subscription to get the current item ID
    const subscription = await stripe.subscriptions.retrieve(link.stripeSubscriptionId);
    const subscriptionItemId = subscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      return NextResponse.json(
        { success: false, error: "No subscription items found" },
        { status: 400 }
      );
    }

    // Swap the price on the subscription
    await stripe.subscriptions.update(link.stripeSubscriptionId, {
      items: [{
        id: subscriptionItemId,
        price: newPrice.id,
      }],
      proration_behavior: parsed.prorate ? "create_prorations" : "none",
    });

    const oldAmount = link.amount;

    // Update local record
    await prisma.paymentLink.update({
      where: { id: linkId },
      data: {
        amount: newAmountInCents,
        stripePriceId: newPrice.id,
      },
    });

    const symbol = link.currency === "eur" ? "€" : "$";
    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "subscription_updated",
        details: `Subscription ${newAmountInCents > oldAmount ? "upgraded" : "downgraded"}: ${symbol}${(oldAmount / 100).toFixed(2)} → ${symbol}${(newAmountInCents / 100).toFixed(2)}/${link.interval} for ${link.description}${parsed.prorate ? " (prorated)" : ""}`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: link.id,
        amount: newAmountInCents,
        stripePriceId: newPrice.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to update subscription price:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update subscription price" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;

  try {
    // Verify payment link belongs to this client
    const link = await prisma.paymentLink.findFirst({
      where: { id: linkId, clientId: id },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    // Clean up Stripe resources
    try {
      if (link.stripeSessionId && link.status === "PENDING") {
        await stripe.checkout.sessions.expire(link.stripeSessionId);
      }
      if (link.stripePriceId) {
        await stripe.prices.update(link.stripePriceId, { active: false });
      }
      if (link.stripeProductId) {
        await stripe.products.update(link.stripeProductId, { active: false });
      }
    } catch (stripeErr) {
      console.error("Stripe cleanup error (non-fatal):", stripeErr);
    }

    await prisma.paymentLink.delete({ where: { id: linkId } });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "deleted_payment_link",
        details: `Deleted payment link: ${link.description} ($${(link.amount / 100).toFixed(2)})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete payment link:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete payment link" },
      { status: 500 }
    );
  }
}

// POST — Resend payment link email
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;

  try {
    const link = await prisma.paymentLink.findFirst({
      where: { id: linkId, clientId: id, status: "PENDING" },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Payment link not found or already paid" },
        { status: 404 }
      );
    }

    const client = await prisma.client.findUnique({
      where: { id },
      select: { email: true, name: true },
    });

    if (!client?.email) {
      return NextResponse.json(
        { success: false, error: "Client has no email address" },
        { status: 400 }
      );
    }

    const amountFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: link.currency.toUpperCase(),
    }).format(link.amount / 100);

    await sendPaymentLinkEmail({
      to: client.email,
      clientName: client.name,
      amount: amountFormatted,
      description: link.description,
      paymentUrl: link.stripeUrl,
      recurring: link.recurring,
      interval: link.interval,
    });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "payment_link_resent",
        details: `Payment link resent: ${amountFormatted} for ${link.description}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to resend payment link:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resend payment link" },
      { status: 500 }
    );
  }
}
