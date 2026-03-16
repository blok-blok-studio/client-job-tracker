import Stripe from "stripe";
import prisma from "@/lib/prisma";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Keep named export for backward compat — lazy getter
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// --- Shared constants ---

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export const CURRENCY_CONFIG: Record<string, { symbol: string; payment_methods: string[] }> = {
  usd: { symbol: "$", payment_methods: ["card", "us_bank_account"] },
  eur: { symbol: "€", payment_methods: ["card", "sepa_debit", "bancontact", "ideal"] },
};

const INVOICE_TEMPLATES: Record<string, string> = {
  US: "inrtem_1SWN2gHopSQoCng0Ro3G4UOb",
  DE: "inrtem_1SWN0iHopSQoCng0CphLnCW1",
};

const EU_COUNTRIES = ["DE", "AT", "NL", "BE", "FR", "IT", "ES", "PT", "IE", "FI", "SE", "DK", "PL", "CZ", "GR", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "CY", "MT", "LU"];

export function getInvoiceTemplate(country: string): string {
  if (EU_COUNTRIES.includes(country)) return INVOICE_TEMPLATES.DE;
  return INVOICE_TEMPLATES.US;
}

export function getCurrencyForCountry(country: string): "usd" | "eur" {
  return EU_COUNTRIES.includes(country) ? "eur" : "usd";
}

// --- Shared Checkout Session helper ---

export interface CreateCheckoutParams {
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
  stripeCustomerId?: string | null;
  amount: number;          // dollars (not cents)
  description: string;
  currency: string;
  country: string;
  recurring?: boolean;
  interval?: "month" | "year";
  contractId?: string;
  milestone?: string;      // "deposit" | "milestone" | "completion" | null
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
  priceId: string;
  productId: string;
  stripeCustomerId: string;
  paymentLinkId: string;   // our DB record ID
}

/**
 * Create a Stripe Checkout Session + save PaymentLink record in DB.
 * Used by both the payment-link API route and contract auto-generation.
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
  const s = getStripe();
  const amountInCents = Math.round(params.amount * 100);
  const isRecurring = params.recurring && params.interval;
  const currency = params.currency;
  const invoiceTemplate = getInvoiceTemplate(params.country);

  // Get or create Stripe Customer — never create duplicates
  let stripeCustomerId = params.stripeCustomerId || null;

  // If we don't have a stored Stripe customer, search by email first
  if (!stripeCustomerId && params.clientEmail) {
    const existing = await s.customers.list({ email: params.clientEmail, limit: 1 });
    if (existing.data.length > 0) {
      // Only reuse if no other client in our DB already claims this Stripe customer
      const alreadyClaimed = await prisma.client.findFirst({
        where: {
          stripeCustomerId: existing.data[0].id,
          id: { not: params.clientId },
        },
        select: { id: true },
      });
      if (!alreadyClaimed) {
        stripeCustomerId = existing.data[0].id;
        await prisma.client.update({
          where: { id: params.clientId },
          data: { stripeCustomerId },
        });
      }
    }
  }

  if (!stripeCustomerId) {
    const customer = await s.customers.create({
      name: params.clientName,
      email: params.clientEmail || undefined,
      address: { country: params.country },
      invoice_settings: {
        rendering_options: { template: invoiceTemplate },
      },
      metadata: { clientId: params.clientId },
    });
    stripeCustomerId = customer.id;
    await prisma.client.update({
      where: { id: params.clientId },
      data: { stripeCustomerId: customer.id },
    });
  } else {
    // Update existing customer's default invoice template + country
    await s.customers.update(stripeCustomerId, {
      address: { country: params.country },
      invoice_settings: {
        rendering_options: { template: invoiceTemplate },
      },
    });
  }

  // Create a Stripe product
  const product = await s.products.create({
    name: params.description,
    metadata: {
      clientId: params.clientId,
      clientName: params.clientName,
    },
  });

  // Create price (one-time or recurring)
  const price = await s.prices.create({
    product: product.id,
    unit_amount: amountInCents,
    currency,
    ...(isRecurring
      ? { recurring: { interval: params.interval! } }
      : {}),
  });

  const firstName = params.clientName.split(" ")[0];

  // Build session params
  // Use automatic_payment_methods instead of explicit types — Stripe picks
  // the best methods for the currency/account, avoiding capability errors.
  const sessionParams: Record<string, unknown> = {
    customer: stripeCustomerId,
    line_items: [{ price: price.id, quantity: 1 }],
    mode: isRecurring ? "subscription" : "payment",
    success_url: `${APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&name=${encodeURIComponent(firstName)}`,
    cancel_url: `${APP_URL}/payment/cancelled`,
    metadata: {
      clientId: params.clientId,
      clientName: params.clientName,
      recurring: isRecurring ? "true" : "false",
    },
    billing_address_collection: "auto",
    customer_update: {
      name: "auto",
      address: "auto",
    },
  };

  if (!isRecurring) {
    sessionParams.invoice_creation = {
      enabled: true,
      invoice_data: {
        description: params.description,
        rendering_options: { template: invoiceTemplate },
        metadata: {
          clientId: params.clientId,
          clientName: params.clientName,
        },
      },
    };
  } else {
    sessionParams.subscription_data = {
      invoice_settings: {
        issuer: { type: "self" },
      },
    };
  }

  const session = await s.checkout.sessions.create(
    sessionParams as Parameters<typeof s.checkout.sessions.create>[0]
  );

  const checkoutUrl = session.url!;

  // Save to our database
  const record = await prisma.paymentLink.create({
    data: {
      clientId: params.clientId,
      stripePaymentLink: session.id,
      stripeUrl: checkoutUrl,
      amount: amountInCents,
      currency,
      country: params.country,
      description: params.description,
      recurring: !!isRecurring,
      interval: isRecurring ? params.interval : null,
      stripePriceId: price.id,
      stripeProductId: product.id,
      stripeSessionId: session.id,
      contractId: params.contractId || null,
      milestone: params.milestone || null,
    },
  });

  return {
    sessionId: session.id,
    url: checkoutUrl,
    priceId: price.id,
    productId: product.id,
    stripeCustomerId,
    paymentLinkId: record.id,
  };
}
