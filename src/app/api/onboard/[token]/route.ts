import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { randomBytes } from "crypto";
import { z } from "zod";
import { onOnboardingCompleted } from "@/lib/pipeline";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeCountry, STATE_REQUIRED_COUNTRIES } from "@/lib/client-party";

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
  "https://app.blokblokstudio.com",
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
      select: {
        id: true, name: true, company: true, type: true, uploadToken: true, email: true, phone: true,
        companyAddress: true, companyCity: true, companyState: true, companyZip: true, companyCountry: true,
        taxId: true, noTaxId: true, websiteUrl: true, industry: true, source: true,
      },
    });

    if (!client || client.type === "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired onboarding link" },
        { status: !client ? 404 : 410, headers: corsHeaders(request) }
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
          id: client.id,
          name: client.name,
          company: client.company,
          // Whatever we already know, so the client only checks and completes it
          prefill: {
            email: client.email,
            phone: client.phone,
            companyAddress: client.companyAddress,
            companyCity: client.companyCity,
            companyState: client.companyState,
            companyZip: client.companyZip,
            companyCountry: normalizeCountry(client.companyCountry),
            taxId: client.taxId,
            noTaxId: client.noTaxId,
            websiteUrl: client.websiteUrl,
            industry: client.industry,
            source: client.source,
          },
          telegramLink,
          uploadUrl: client.uploadToken ? `${APP_URL}/u/${client.uploadToken}` : null,
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
const req = (label: string, max: number) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

// Every business detail is required: the contract is drafted from them.
// Logins, social links, brand notes and comments stay optional.
const onboardSchema = z
  .object({
    contacts: z
      .array(
        z.object({
          name: req("Contact name", 200),
          role: req("Contact role", 100),
          email: z.string().trim().email("Enter a valid contact email").max(254),
          phone: req("Contact phone", 30),
          isPrimary: z.boolean().optional(),
        })
      )
      .min(1, "Add at least one contact")
      .max(20),
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
    timezone: req("Timezone", 50),
    company: req("Legal / company name", 200),
    companyWebsite: z.string().trim().max(500).optional(),
    noWebsite: z.boolean().optional().default(false),
    companyAddress: req("Street address", 500),
    companyCity: req("City", 100),
    companyState: z.string().trim().max(100).optional(),
    companyZip: req("Postal code", 20),
    companyCountry: req("Country", 2),
    taxId: z.string().trim().max(50).optional(),
    noTaxId: z.boolean().optional().default(false),
    source: req("How you heard about us", 200),
    industry: req("Industry", 200),
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
  })
  .superRefine((d, ctx) => {
    const country = normalizeCountry(d.companyCountry);
    if (country && STATE_REQUIRED_COUNTRIES.includes(country) && !d.companyState?.trim()) {
      ctx.addIssue({ code: "custom", path: ["companyState"], message: "State / region is required" });
    }
    if (!d.taxId?.trim() && !d.noTaxId) {
      ctx.addIssue({ code: "custom", path: ["taxId"], message: "Enter your VAT / tax ID, or tick that you don't have one" });
    }
    if (!d.companyWebsite?.trim() && !d.noWebsite) {
      ctx.addIssue({ code: "custom", path: ["companyWebsite"], message: "Enter your website, or tick that you don't have one yet" });
    }
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
    if (parsed.companyCountry) updates.companyCountry = normalizeCountry(parsed.companyCountry);
    if (parsed.taxId?.trim()) {
      updates.taxId = parsed.taxId.trim();
      updates.noTaxId = false;
    } else if (parsed.noTaxId) {
      updates.noTaxId = true;
    }
    if (parsed.companyWebsite?.trim()) updates.websiteUrl = parsed.companyWebsite.trim();
    updates.onboardedAt = new Date();
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
        if (parsed.companyCountry) address.country = normalizeCountry(parsed.companyCountry) || parsed.companyCountry;

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
          const taxType = getTaxIdType(normalizeCountry(parsed.companyCountry) || parsed.companyCountry, parsed.taxId);
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

    // Create credentials (encrypted with AES-256-GCM, JSON-IV format matching /api/vault)
    if (parsed.credentials && parsed.credentials.length > 0) {
      step = "encrypting credentials";
      for (const cred of parsed.credentials) {
        const encryptedUsername = encrypt(cred.username);
        const encryptedPassword = encrypt(cred.password);
        const encryptedNotes = cred.notes ? encrypt(cred.notes) : null;
        step = "saving credentials";
        await prisma.credential.create({
          data: {
            clientId: client.id,
            platform: cred.platform,
            username: encryptedUsername.encrypted,
            password: encryptedPassword.encrypted,
            notes: encryptedNotes?.encrypted || null,
            url: cred.url || null,
            iv: JSON.stringify({
              username: encryptedUsername.iv,
              password: encryptedPassword.iv,
              notes: encryptedNotes?.iv || null,
            }),
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
      uploadToken = randomBytes(16).toString("base64url");
      await prisma.client.update({
        where: { id: client.id },
        data: { uploadToken },
      });
    }
    const uploadUrl = `${APP_URL}/u/${uploadToken}`;

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
        { success: false, error: error.issues[0]?.message || "Some details are missing", details: error.issues },
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
