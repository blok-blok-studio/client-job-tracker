import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { sendPaymentLinkEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://client-job-tracker.vercel.app";

const CURRENCY_CONFIG: Record<string, { symbol: string; payment_methods: string[] }> = {
  usd: { symbol: "$", payment_methods: ["card", "us_bank_account"] },
  eur: { symbol: "€", payment_methods: ["card", "sepa_debit", "bancontact", "ideal"] },
};

const createSchema = z.object({
  amount: z.number().min(1, "Amount must be at least 1"),
  description: z.string().min(1).max(500),
  currency: z.enum(["usd", "eur"]).default("usd"),
  recurring: z.boolean().default(false),
  interval: z.enum(["month", "year"]).optional(),
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
    const amountInCents = Math.round(parsed.amount * 100);
    const isRecurring = parsed.recurring && parsed.interval;
    const currency = parsed.currency;
    const currencyConfig = CURRENCY_CONFIG[currency];

    // Get or create Stripe Customer for this client
    let stripeCustomerId = client.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: client.name,
        email: client.email || undefined,
        metadata: { clientId: client.id },
      });
      stripeCustomerId = customer.id;
      await prisma.client.update({
        where: { id: client.id },
        data: { stripeCustomerId: customer.id },
      });
    }

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
      currency,
      ...(isRecurring
        ? { recurring: { interval: parsed.interval! } }
        : {}),
    });

    const firstName = client.name.split(" ")[0];

    // Create a Checkout Session (not a Payment Link) so we can:
    // 1. Link to existing Stripe Customer (no more "Guest")
    // 2. Auto-generate Stripe invoice for one-time payments
    // 3. Use the customer's invoice template (DE/US with Steuernummer)
    const sessionParams: Record<string, unknown> = {
      customer: stripeCustomerId,
      line_items: [{ price: price.id, quantity: 1 }],
      payment_method_types: currencyConfig.payment_methods,
      mode: isRecurring ? "subscription" : "payment",
      success_url: `${APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&name=${encodeURIComponent(firstName)}`,
      cancel_url: `${APP_URL}/payment/cancelled`,
      metadata: {
        clientId: client.id,
        clientName: client.name,
        recurring: isRecurring ? "true" : "false",
      },
      customer_update: {
        name: "auto",
        address: "auto",
      },
    };

    // For one-time payments, auto-generate a Stripe invoice
    if (!isRecurring) {
      sessionParams.invoice_creation = {
        enabled: true,
        invoice_data: {
          description: parsed.description,
          metadata: {
            clientId: client.id,
            clientName: client.name,
          },
        },
      };
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    const checkoutUrl = session.url!;

    // Save to our database
    const record = await prisma.paymentLink.create({
      data: {
        clientId: client.id,
        stripePaymentLink: session.id, // Store session ID instead of payment link ID
        stripeUrl: checkoutUrl,
        amount: amountInCents,
        currency,
        description: parsed.description,
        recurring: !!isRecurring,
        interval: isRecurring ? parsed.interval : null,
        stripePriceId: price.id,
        stripeProductId: product.id,
        stripeSessionId: session.id,
      },
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
        paymentUrl: checkoutUrl,
        recurring: !!isRecurring,
        interval: isRecurring ? parsed.interval : null,
      }).catch((err) => console.error("[Email] Payment link email error:", err));
    }

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        url: checkoutUrl,
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
