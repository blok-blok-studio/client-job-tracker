import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET — Fetch client name + company so the form can greet them
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const client = await prisma.client.findUnique({
    where: { onboardToken: token },
    select: { id: true, name: true, company: true, type: true },
  });

  if (!client) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired onboarding link" },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    { success: true, data: { name: client.name, company: client.company } },
    { headers: CORS_HEADERS }
  );
}

// POST — Submit onboarding data from the client-facing form
const onboardSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        isPrimary: z.boolean().optional(),
      })
    )
    .optional(),
  credentials: z
    .array(
      z.object({
        platform: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        url: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  timezone: z.string().optional(),
  telegramChatId: z.string().optional(),
  notes: z.string().optional(),
  brandGuidelines: z.string().optional(),
  socialLinks: z
    .array(z.object({ platform: z.string(), url: z.string() }))
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
      { status: 404, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await request.json();
    const parsed = onboardSchema.parse(body);

    // Update client with onboarding info
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

    // Create contacts
    if (parsed.contacts && parsed.contacts.length > 0) {
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

    // Create credentials (encrypted at rest via vault)
    if (parsed.credentials && parsed.credentials.length > 0) {
      const crypto = await import("crypto");
      const key = process.env.VAULT_KEY;
      if (key) {
        for (const cred of parsed.credentials) {
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv(
            "aes-256-cbc",
            Buffer.from(key, "hex"),
            iv
          );
          let encrypted = cipher.update(cred.password, "utf8", "hex");
          encrypted += cipher.final("hex");

          await prisma.credential.create({
            data: {
              clientId: client.id,
              platform: cred.platform,
              username: cred.username,
              password: encrypted,
              iv: iv.toString("hex"),
              url: cred.url || null,
              notes: cred.notes || null,
            },
          });
        }
      }
    }

    // Mark relevant checklist items as done
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
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to process onboarding" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
