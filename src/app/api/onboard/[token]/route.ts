import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { randomBytes } from "crypto";
import { z } from "zod";
import { onOnboardingCompleted } from "@/lib/pipeline";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

function getTaxIdType(country: string, taxId: string): string | null {
  // EU VAT
  const euCountries = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
  if (euCountries.includes(country)) return "eu_vat";

  // US EIN
  if (country === "US") return "us_ein";

  // UK VAT
  if (country === "GB") return "gb_vat";

  // Canada
  if (country === "CA") {
    if (taxId.length === 15) return "ca_bn"; // Business Number
    return "ca_gst_hst"; // GST/HST
  }

  // Australia
  if (country === "AU") return "au_abn";

  // Switzerland
  if (country === "CH") return "ch_vat";

  // Brazil
  if (country === "BR") return "br_cnpj";

  // India
  if (country === "IN") return "in_gst";

  // Japan
  if (country === "JP") return "jp_cn";

  // South Korea
  if (country === "KR") return "kr_brn";

  // Mexico
  if (country === "MX") return "mx_rfc";

  // New Zealand
  if (country === "NZ") return "nz_gst";

  // Singapore
  if (country === "SG") return "sg_gst";

  // South Africa
  if (country === "ZA") return "za_vat";

  // Norway
  if (country === "NO") return "no_vat";

  // Israel
  if (country === "IL") return "il_vat";

  // Turkey
  if (country === "TR") return "tr_tin";

  // UAE
  if (country === "AE") return "ae_trn";

  // Saudi Arabia
  if (country === "SA") return "sa_vat";

  return null; // Unknown — skip tax ID creation
}

const ALLOWED_ORIGINS = [
  "https://blokblokstudio.com",
  "https://www.blokblokstudio.com",
  "https://blokblokstudio-clients.vercel.app",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3001"] : []),
];

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

// GET — Fetch client name + company so the form can greet them
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate limit onboard token lookups — 20/min per IP
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 20, prefix: "onboard-get" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders(request) }
    );
  }

  try {
    const { token } = await params;

    const client = await prisma.client.findUnique({
      where: { onboardToken: token },
      select: { id: true, name: true, company: true, type: true },
    });

    if (!client) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired onboarding link" },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    // Build Telegram deep link if bot username is configured
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || null;
    const telegramLink = botUsername
      ? `https://t.me/${botUsername}?start=${token}`
      : null;

    return NextResponse.json(
      {
        success: true,
        data: {
          name: client.name,
          company: client.company,
          telegramLink,
        },
      },
      { headers: corsHeaders(request) }
    );
  } catch (error) {
    console.error("Onboard GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch onboarding data" },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

// POST — Submit onboarding data from the client-facing form
const onboardSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        role: z.string().max(100).optional(),
        email: z.string().email().max(254),
        phone: z.string().min(1).max(30),
        isPrimary: z.boolean().optional(),
      })
    )
    .max(20)
    .optional(),
  credentials: z
    .array(
      z.object({
        platform: z.string().min(1).max(100),
        username: z.string().min(1).max(200),
        password: z.string().min(1).max(500),
        url: z.string().max(500).optional(),
        notes: z.string().max(1000).optional(),
      })
    )
    .max(50)
    .optional(),
  timezone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  companyWebsite: z.string().max(500).optional(),
  companyAddress: z.string().max(500).optional(),
  companyCity: z.string().max(100).optional(),
  companyState: z.string().max(100).optional(),
  companyZip: z.string().max(20).optional(),
  companyCountry: z.string().max(2).optional(),
  taxId: z.string().max(50).optional(),
  source: z.string().max(200).optional(),
  industry: z.string().max(200).optional(),
  telegramChatId: z.string().max(30).optional(),
  contractStart: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }).optional(),
  contractEnd: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }).optional(),
  monthlyRetainer: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
  brandGuidelines: z.string().max(10000).optional(),
  socialLinks: z
    .array(z.object({ platform: z.string().max(50), url: z.string().max(500) }))
    .max(20)
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate limit onboard submissions — 5/min per IP
  const postIp = getClientIp(request);
  const postRl = rateLimit(postIp, { max: 5, prefix: "onboard-post" });
  if (!postRl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders(request) }
    );
  }

  const { token } = await params;

  const client = await prisma.client.findUnique({
    where: { onboardToken: token },
    select: { id: true, name: true },
  });

  if (!client) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired onboarding link" },
      { status: 404, headers: corsHeaders(request) }
    );
  }

  let step = "parsing";
  try {
    const body = await request.json();
    const parsed = onboardSchema.parse(body);

    // Invalidate the token FIRST to prevent duplicate submissions on crash/timeout
    step = "invalidating token";
    const tokenClaimed = await prisma.client.updateMany({
      where: { id: client.id, onboardToken: token },
      data: { onboardToken: null },
    });
    if (tokenClaimed.count === 0) {
      return NextResponse.json(
        { success: false, error: "This onboarding link has already been used" },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    // Update client with onboarding info
    step = "updating client";
    const updates: Record<string, unknown> = {};
    if (parsed.timezone) updates.timezone = parsed.timezone;
    if (parsed.company) updates.company = parsed.company;
    if (parsed.source) updates.source = parsed.source;
    if (parsed.industry) updates.industry = parsed.industry;
    if (parsed.companyAddress) updates.companyAddress = parsed.companyAddress;
    if (parsed.companyCity) updates.companyCity = parsed.companyCity;
    if (parsed.companyState) updates.companyState = parsed.companyState;
    if (parsed.companyZip) updates.companyZip = parsed.companyZip;
    if (parsed.companyCountry) updates.companyCountry = parsed.companyCountry;
    if (parsed.taxId) updates.taxId = parsed.taxId;
    if (parsed.telegramChatId) updates.telegramChatId = parsed.telegramChatId;
    if (parsed.contractStart) updates.contractStart = new Date(parsed.contractStart);
    if (parsed.contractEnd) updates.contractEnd = new Date(parsed.contractEnd);
    if (parsed.monthlyRetainer !== undefined) updates.monthlyRetainer = parsed.monthlyRetainer;
    if (parsed.notes) updates.notes = parsed.notes;
    if (parsed.brandGuidelines) {
      updates.notes = parsed.notes
        ? `${parsed.notes}\n\nBrand Guidelines:\n${parsed.brandGuidelines}`
        : `Brand Guidelines:\n${parsed.brandGuidelines}`;
    }
    if (parsed.companyWebsite) {
      const current = (updates.notes as string) || parsed.notes || "";
      updates.notes = current
        ? `${current}\n\nCompany Website: ${parsed.companyWebsite}`
        : `Company Website: ${parsed.companyWebsite}`;
    }

    await prisma.client.update({
      where: { id: client.id },
      data: updates,
    });

    // Sync address and tax info to Stripe customer
    step = "syncing to Stripe";
    const updatedClient = await prisma.client.findUnique({
      where: { id: client.id },
      select: { stripeCustomerId: true, name: true, email: true, company: true },
    });

    if (updatedClient?.stripeCustomerId) {
      try {
        const { stripe } = await import("@/lib/stripe");

        // Update customer address
        const stripeUpdate: Record<string, unknown> = {};
        if (parsed.company) stripeUpdate.name = parsed.company;

        const address: Record<string, string> = {};
        if (parsed.companyAddress) address.line1 = parsed.companyAddress;
        if (parsed.companyCity) address.city = parsed.companyCity;
        if (parsed.companyState) address.state = parsed.companyState;
        if (parsed.companyZip) address.postal_code = parsed.companyZip;
        if (parsed.companyCountry) address.country = parsed.companyCountry;

        if (Object.keys(address).length > 0) {
          stripeUpdate.address = address;
        }

        if (Object.keys(stripeUpdate).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await stripe.customers.update(updatedClient.stripeCustomerId, stripeUpdate as any);
        }

        // Add tax ID if provided
        if (parsed.taxId && parsed.companyCountry) {
          // Map country to Stripe tax ID type
          const taxType = getTaxIdType(parsed.companyCountry, parsed.taxId);
          if (taxType) {
            await stripe.customers.createTaxId(updatedClient.stripeCustomerId, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: taxType as any,
              value: parsed.taxId,
            });
          }
        }
      } catch (stripeError) {
        // Don't fail onboarding if Stripe sync fails — log and continue
        console.error("[Stripe] Failed to sync customer data:", stripeError);
      }
    }

    // Create contacts and populate client email/phone from primary contact
    if (parsed.contacts && parsed.contacts.length > 0) {
      step = "creating contacts";
      const primaryContact = parsed.contacts.find((c) => c.isPrimary) || parsed.contacts[0];
      if (primaryContact) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            email: primaryContact.email || undefined,
            phone: primaryContact.phone || undefined,
          },
        });
      }
      await prisma.contact.createMany({
        data: parsed.contacts.map((c) => ({
          clientId: client.id,
          name: c.name,
          role: c.role || null,
          email: c.email || null,
          phone: c.phone || null,
          isPrimary: c.isPrimary ?? false,
        })),
      });
    }

    // Create credentials (encrypted with AES-256-GCM)
    if (parsed.credentials && parsed.credentials.length > 0) {
      step = "encrypting credentials";
      for (const cred of parsed.credentials) {
        const { encrypted, iv } = encrypt(cred.password);
        step = "saving credentials";
        await prisma.credential.create({
          data: {
            clientId: client.id,
            platform: cred.platform,
            username: cred.username,
            password: encrypted,
            iv,
            url: cred.url || null,
            notes: cred.notes || null,
          },
        });
      }
    }

    // Create social links
    if (parsed.socialLinks && parsed.socialLinks.length > 0) {
      step = "creating social links";
      const validLinks = parsed.socialLinks.filter((s) => s.platform && s.url);
      if (validLinks.length > 0) {
        await prisma.socialLink.createMany({
          data: validLinks.map((s) => ({
            clientId: client.id,
            platform: s.platform,
            url: s.url,
          })),
        });
      }
    }

    // Log the activity
    step = "logging activity";
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "client",
        action: "onboarding_completed",
        details: `${client.name} completed the onboarding form`,
      },
    });

    // Generate upload token so the client can upload files immediately
    let uploadToken = await prisma.client.findUnique({
      where: { id: client.id },
      select: { uploadToken: true },
    }).then((c) => c?.uploadToken);

    if (!uploadToken) {
      uploadToken = randomBytes(24).toString("hex");
      await prisma.client.update({
        where: { id: client.id },
        data: { uploadToken },
      });
    }
    const uploadUrl = `${APP_URL}/upload/${uploadToken}`;

    // Trigger automated pipeline: send contract
    // MUST be awaited — serverless runtimes kill the process after response,
    // so fire-and-forget promises may never complete
    await onOnboardingCompleted(client.id);

    return NextResponse.json(
      { success: true, message: "Onboarding complete", uploadUrl },
      { headers: corsHeaders(request) }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }
    console.error(`Onboard POST error at step "${step}":`, error);
    return NextResponse.json(
      { success: false, error: "Failed to complete onboarding" },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
