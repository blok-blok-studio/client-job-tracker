import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCheckoutSession, CURRENCY_CONFIG } from "@/lib/stripe";
import { z } from "zod";
import { sendPaymentLinkEmail } from "@/lib/email";

// Allow up to 60s for Stripe API calls + email sending
export const maxDuration = 60;

const createSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  description: z.string().min(1).max(500),
  currency: z.enum(["usd", "eur"]).default("usd"),
  country: z.string().length(2).default("US"),
  recurring: z.boolean().default(false),
  interval: z.enum(["month", "year"]).optional(),
  milestone: z.string().optional(),
});

// POST — Create a Stripe Checkout Session for a client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, company: true, stripeCustomerId: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);
    const isRecurring = parsed.recurring && parsed.interval;
    const currency = parsed.currency;
    const currencyConfig = CURRENCY_CONFIG[currency];

    const result = await createCheckoutSession({
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      stripeCustomerId: client.stripeCustomerId,
      amount: parsed.amount,
      description: parsed.description,
      currency,
      country: parsed.country,
      recurring: parsed.recurring,
      interval: parsed.interval,
      milestone: parsed.milestone,
    });

    // Log activity
    const intervalLabel = isRecurring ? `/${parsed.interval}` : "";
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "payment_link_created",
        details: `${isRecurring ? "Subscription" : "Payment"} link created: ${currencyConfig.symbol}${parsed.amount.toLocaleString()}${intervalLabel} for ${parsed.description}`,
      },
    });

    // Auto-send payment link via email if client has email
    if (client.email) {
      const amountFormatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(parsed.amount);

      sendPaymentLinkEmail({
        to: client.email,
        clientName: client.name,
        amount: amountFormatted,
        description: parsed.description,
        paymentUrl: result.url,
        recurring: !!isRecurring,
        interval: isRecurring ? parsed.interval : null,
      }).catch((err) => console.error("[Email] Payment link email error:", err));
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.paymentLinkId,
        url: result.url,
        amount: Math.round(parsed.amount * 100),
        description: parsed.description,
        recurring: !!isRecurring,
        interval: isRecurring ? parsed.interval : null,
        status: "PENDING",
        createdAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Payment link creation error:", error);
    const message = error instanceof Error ? error.message : "Failed to create payment link";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// GET — List all payment links for a client
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const links = await prisma.paymentLink.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        stripeUrl: true,
        amount: true,
        currency: true,
        description: true,
        recurring: true,
        interval: true,
        status: true,
        paidAt: true,
        milestone: true,
        contractId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: links });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch payment links" },
      { status: 500 }
    );
  }
}
