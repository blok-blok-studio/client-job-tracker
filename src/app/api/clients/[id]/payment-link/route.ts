import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const createSchema = z.object({
  amount: z.number().min(1, "Amount must be at least $1"),
  description: z.string().min(1).max(500),
  recurring: z.boolean().default(false),
  interval: z.enum(["month", "year"]).optional(),
});

// POST — Create a Stripe payment link for a client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, company: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);
    const amountInCents = Math.round(parsed.amount * 100);
    const isRecurring = parsed.recurring && parsed.interval;

    // Create a Stripe product on the fly
    const product = await stripe.products.create({
      name: parsed.description,
      metadata: {
        clientId: client.id,
        clientName: client.name,
      },
    });

    // Create price (one-time or recurring)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountInCents,
      currency: "usd",
      ...(isRecurring
        ? { recurring: { interval: parsed.interval! } }
        : {}),
    });

    // Create the payment link with card/bank payment methods
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      payment_method_types: ["card", "us_bank_account"],
      metadata: {
        clientId: client.id,
        clientName: client.name,
        recurring: isRecurring ? "true" : "false",
      },
      after_completion: {
        type: "hosted_confirmation",
        hosted_confirmation: {
          custom_message: isRecurring
            ? `Thank you, ${client.name.split(" ")[0]}! Your subscription is now active. You'll be billed ${parsed.interval === "year" ? "annually" : "monthly"}.`
            : `Thank you for your payment, ${client.name.split(" ")[0]}! We'll be in touch shortly to get started.`,
        },
      },
    });

    // Save to our database
    const record = await prisma.paymentLink.create({
      data: {
        clientId: client.id,
        stripePaymentLink: paymentLink.id,
        stripeUrl: paymentLink.url,
        amount: amountInCents,
        currency: "usd",
        description: parsed.description,
        recurring: !!isRecurring,
        interval: isRecurring ? parsed.interval : null,
        stripePriceId: price.id,
        stripeProductId: product.id,
      },
    });

    // Log activity
    const intervalLabel = isRecurring ? `/${parsed.interval}` : "";
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "payment_link_created",
        details: `${isRecurring ? "Subscription" : "Payment"} link created: $${parsed.amount.toLocaleString()}${intervalLabel} for ${parsed.description}`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        url: paymentLink.url,
        amount: amountInCents,
        description: parsed.description,
        recurring: record.recurring,
        interval: record.interval,
        status: record.status,
        createdAt: record.createdAt,
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
    return NextResponse.json(
      { success: false, error: "Failed to create payment link" },
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
