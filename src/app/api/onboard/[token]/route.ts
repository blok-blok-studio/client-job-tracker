import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

const ALLOWED_ORIGINS = [
  "https://blokblokstudio.com",
  "https://www.blokblokstudio.com",
  "https://client-job-tracker.vercel.app",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3001"] : []),
];

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
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

    return NextResponse.json(
      { success: true, data: { name: client.name, company: client.company } },
      { headers: corsHeaders(request) }
    );
  } catch (error) {
    console.error("Onboard GET error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "Failed to fetch onboarding data", debug: message },
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
  telegramChatId: z.string().max(30).optional(),
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

    // Update client with onboarding info
    step = "updating client";
    const updates: Record<string, unknown> = {};
    if (parsed.timezone) updates.timezone = parsed.timezone;
    if (parsed.telegramChatId) updates.telegramChatId = parsed.telegramChatId;
    if (parsed.notes) updates.notes = parsed.notes;
    if (parsed.brandGuidelines) {
      updates.notes = parsed.notes
        ? `${parsed.notes}\n\nBrand Guidelines:\n${parsed.brandGuidelines}`
        : `Brand Guidelines:\n${parsed.brandGuidelines}`;
    }

    // Invalidate the token after use
    updates.onboardToken = null;

    await prisma.client.update({
      where: { id: client.id },
      data: updates,
    });

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

    // Mark relevant checklist items as done
    step = "updating checklist";
    const checklistLabels = ["Credentials received"];
    if (parsed.contacts && parsed.contacts.length > 0) {
      checklistLabels.push("Onboarding call completed");
    }

    await prisma.checklistItem.updateMany({
      where: {
        clientId: client.id,
        label: { in: checklistLabels },
      },
      data: { checked: true },
    });

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

    return NextResponse.json(
      { success: true, message: "Onboarding complete" },
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed at: ${step}`, debug: message },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
