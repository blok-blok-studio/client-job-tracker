import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureSeeded, buildRenderContext } from "@/lib/lifecycle/engine";
import {
  renderTokens,
  unknownTokens,
  manualTokens,
  sampleRenderContext,
  TOKEN_REGISTRY,
} from "@/lib/lifecycle/tokens";
import { getTierConstants } from "@/lib/lifecycle/tiers";
import { getSetting } from "@/lib/lifecycle/settings";
import { TEMPLATE_SOURCE_BY_KEY } from "@/lib/lifecycle/templates-source";
import { deliverTestEmail, renderEmailHtml } from "@/lib/lifecycle/deliver";

async function sampleCtx() {
  return sampleRenderContext(await getTierConstants(), {
    bookingLink: (await getSetting<string>("booking_link", "")) || "https://cal.com/blokblok/kickoff",
    assetChecklistLink: await getSetting<string>("asset_checklist_link", ""),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app",
  });
}

// GET /api/lifecycle/templates/[key] — template + full version history + token reference
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  await ensureSeeded();
  const template = await prisma.emailTemplate.findUnique({
    where: { key },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }
  const ctx = await sampleCtx();
  return NextResponse.json({
    success: true,
    data: {
      ...template,
      original: TEMPLATE_SOURCE_BY_KEY[key] || null,
      preview: {
        subject: renderTokens(template.subject, ctx).text,
        body: renderTokens(template.body, ctx).text,
      },
      tokens: Object.entries(TOKEN_REGISTRY).map(([name, def]) => ({
        name,
        description: def.description,
        manual: !!def.manual,
      })),
    },
  });
}

const putSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});

/** Validation shared by save + the UI's live checks. */
function validateTemplate(kind: string, subject: string, body: string) {
  const text = `${subject}\n${body}`;
  const unknown = unknownTokens(text);
  const errors: string[] = [];
  if (unknown.length > 0) {
    errors.push(
      `Unknown merge fields (not in the data model): ${unknown.map((t) => `{{${t}}}`).join(", ")}`
    );
  }
  if (kind === "SEQUENCE_EMAIL") {
    const manual = manualTokens(text);
    if (manual.length > 0) {
      errors.push(
        `This template sends automatically, but these fields need a human to fill them: ${manual
          .map((t) => `{{${t}}}`)
          .join(", ")}. Auto-send would go out with raw tokens, so saving is blocked.`
      );
    }
  }
  return errors;
}

// PUT /api/lifecycle/templates/[key] — save edits (token-validated, versioned, audited)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const template = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  const errors = validateTemplate(template.kind, parsed.data.subject, parsed.data.body);
  if (errors.length > 0) {
    return NextResponse.json({ success: false, error: errors.join(" ") }, { status: 400 });
  }

  // Snapshot the current copy for one-click revert
  const version = await prisma.emailTemplateVersion.create({
    data: {
      templateId: template.id,
      subject: template.subject,
      body: template.body,
      editedBy: session.name,
    },
  });
  const updated = await prisma.emailTemplate.update({
    where: { key },
    data: { subject: parsed.data.subject, body: parsed.data.body, updatedBy: session.name },
  });
  await prisma.activityLog.create({
    data: {
      actor: session.name,
      action: "lifecycle_template_edited",
      details: JSON.stringify({
        template: key,
        oldSubject: template.subject,
        newSubject: parsed.data.subject,
        previousVersionId: version.id,
        bodyChanged: template.body !== parsed.data.body,
      }),
    },
  });
  return NextResponse.json({ success: true, data: updated });
}

const actionSchema = z.object({
  action: z.enum(["preview", "test-send", "revert", "reset", "validate"]),
  subject: z.string().max(300).optional(),
  body: z.string().max(20000).optional(),
  versionId: z.string().optional(),
  clientId: z.string().optional(), // preview against a real client instead of the sample
});

// POST /api/lifecycle/templates/[key] — preview / validate / test-send / revert / reset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const template = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }
  const subject = parsed.data.subject ?? template.subject;
  const body = parsed.data.body ?? template.body;

  switch (parsed.data.action) {
    case "validate": {
      const errors = validateTemplate(template.kind, subject, body);
      return NextResponse.json({ success: true, data: { errors } });
    }

    case "preview": {
      let ctx;
      if (parsed.data.clientId) {
        const client = await prisma.client.findUnique({
          where: { id: parsed.data.clientId },
          include: { services: true },
        });
        if (!client) {
          return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
        }
        ctx = await buildRenderContext({ client });
      } else {
        ctx = await sampleCtx();
      }
      const s = renderTokens(subject, ctx);
      const b = renderTokens(body, ctx);
      return NextResponse.json({
        success: true,
        data: {
          subject: s.text,
          body: b.text,
          html: renderEmailHtml(b.text),
          missing: [...new Set([...s.missing, ...b.missing])],
        },
      });
    }

    case "test-send": {
      // Test sends go ONLY to the logged-in user's own address
      const ctx = await sampleCtx();
      const s = renderTokens(subject, ctx);
      const b = renderTokens(body, ctx);
      await deliverTestEmail({ to: session.email, subject: s.text, bodyText: b.text });
      await prisma.activityLog.create({
        data: {
          actor: session.name,
          action: "lifecycle_template_test_send",
          details: JSON.stringify({ template: key, to: session.email, subject: s.text }),
        },
      });
      return NextResponse.json({ success: true, data: { to: session.email } });
    }

    case "revert": {
      if (!parsed.data.versionId) {
        return NextResponse.json({ success: false, error: "versionId required" }, { status: 400 });
      }
      const version = await prisma.emailTemplateVersion.findUnique({
        where: { id: parsed.data.versionId },
      });
      if (!version || version.templateId !== template.id) {
        return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
      }
      await prisma.emailTemplateVersion.create({
        data: {
          templateId: template.id,
          subject: template.subject,
          body: template.body,
          editedBy: session.name,
        },
      });
      const reverted = await prisma.emailTemplate.update({
        where: { key },
        data: { subject: version.subject, body: version.body, updatedBy: session.name },
      });
      await prisma.activityLog.create({
        data: {
          actor: session.name,
          action: "lifecycle_template_reverted",
          details: JSON.stringify({ template: key, toVersionId: version.id }),
        },
      });
      return NextResponse.json({ success: true, data: reverted });
    }

    case "reset": {
      const original = TEMPLATE_SOURCE_BY_KEY[key];
      if (!original) {
        return NextResponse.json(
          { success: false, error: "No shipped original for this template" },
          { status: 400 }
        );
      }
      await prisma.emailTemplateVersion.create({
        data: {
          templateId: template.id,
          subject: template.subject,
          body: template.body,
          editedBy: session.name,
        },
      });
      const reset = await prisma.emailTemplate.update({
        where: { key },
        data: { subject: original.subject, body: original.body, updatedBy: session.name },
      });
      await prisma.activityLog.create({
        data: {
          actor: session.name,
          action: "lifecycle_template_reset",
          details: JSON.stringify({ template: key }),
        },
      });
      return NextResponse.json({ success: true, data: reset });
    }
  }
}
