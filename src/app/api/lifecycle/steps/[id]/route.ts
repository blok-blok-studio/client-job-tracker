import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildRenderContext } from "@/lib/lifecycle/engine";
import { renderTokens, unknownTokens } from "@/lib/lifecycle/tokens";
import { deliverLifecycleEmail, isDryRunAddress } from "@/lib/lifecycle/deliver";

const postSchema = z.object({
  action: z.enum(["skip", "send-draft"]),
  reason: z.string().max(500).optional(),
  subject: z.string().max(300).optional(),
  body: z.string().max(20000).optional(),
});

// POST /api/lifecycle/steps/[id] — skip a pending step, or send a filled draft (one click, human decision)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  const step = await prisma.scheduledStep.findUnique({
    where: { id },
    include: { client: { include: { services: true } }, contractor: true },
  });
  if (!step) {
    return NextResponse.json({ success: false, error: "Step not found" }, { status: 404 });
  }

  if (parsed.data.action === "skip") {
    if (step.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Only pending steps can be skipped" },
        { status: 400 }
      );
    }
    await prisma.scheduledStep.update({
      where: { id },
      data: {
        status: "SKIPPED",
        cancelReason: parsed.data.reason
          ? `Skipped by ${session.name}: ${parsed.data.reason}`
          : `Skipped by ${session.name}`,
        processedAt: new Date(),
      },
    });
    await prisma.activityLog.create({
      data: {
        clientId: step.clientId,
        actor: session.name,
        action: "lifecycle_step_skipped",
        details: JSON.stringify({ step: step.stepKey, reason: parsed.data.reason || null }),
      },
    });
    return NextResponse.json({ success: true });
  }

  // --- send-draft: a human filled the draft, one click sends it ---
  if (step.kind !== "DRAFT") {
    return NextResponse.json(
      { success: false, error: "Only draft steps can be sent this way" },
      { status: 400 }
    );
  }
  const subject = parsed.data.subject ?? step.renderedSubject ?? "";
  const body = parsed.data.body ?? step.renderedBody ?? "";
  if (!subject || !body) {
    return NextResponse.json({ success: false, error: "Subject and body required" }, { status: 400 });
  }
  if (unknownTokens(`${subject}\n${body}`).length > 0) {
    return NextResponse.json(
      { success: false, error: "Unknown merge fields in the draft" },
      { status: 400 }
    );
  }

  // G is a broadcast: every past/current client + every partner with an email.
  // Everything else goes to the step's own client.
  const isBroadcast = step.sequenceKey === "G";
  const recipients = isBroadcast
    ? await prisma.client.findMany({
        where: {
          email: { not: null },
          type: { not: "ARCHIVED" },
          OR: [{ role: "CLIENT" }, { role: "PARTNER" }],
          automationsPaused: false,
        },
        include: { services: true },
      })
    : step.client
      ? [step.client]
      : [];
  if (recipients.length === 0) {
    return NextResponse.json({ success: false, error: "No recipients with an email" }, { status: 400 });
  }

  let delivered = 0;
  let dryRuns = 0;
  const stillMissing = new Set<string>();
  for (const recipient of recipients) {
    const ctx = await buildRenderContext({ client: recipient });
    const s = renderTokens(subject, ctx);
    const b = renderTokens(body, ctx);
    const missing = [...s.missing, ...b.missing];
    if (missing.length > 0) {
      // Never send raw tokens — a filled draft must resolve completely per recipient
      missing.forEach((m) => stillMissing.add(m));
      continue;
    }
    const result = await deliverLifecycleEmail({
      to: recipient.email!,
      subject: s.text,
      bodyText: b.text,
      forceDry: isDryRunAddress(recipient.email),
    });
    if (result.delivered) delivered++;
    else dryRuns++;
  }

  if (delivered === 0 && dryRuns === 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Draft still has unfilled fields: ${[...stillMissing].map((t) => `{{${t}}}`).join(", ")}`,
      },
      { status: 400 }
    );
  }

  await prisma.scheduledStep.update({
    where: { id },
    data: {
      status: "SENT",
      dryRun: delivered === 0,
      renderedSubject: subject,
      renderedBody: body,
      processedAt: new Date(),
      meta: { sentBy: session.name, delivered, dryRuns, broadcast: isBroadcast },
    },
  });
  // Close the linked kanban task if there is one
  if (step.taskId) {
    await prisma.task
      .update({ where: { id: step.taskId }, data: { status: "DONE", completedAt: new Date() } })
      .catch(() => {});
  }
  await prisma.activityLog.create({
    data: {
      clientId: step.clientId,
      actor: session.name,
      action: "lifecycle_draft_sent",
      details: JSON.stringify({
        step: step.stepKey,
        subject,
        delivered,
        dryRuns,
        broadcast: isBroadcast,
      }),
    },
  });
  return NextResponse.json({
    success: true,
    data: {
      delivered,
      dryRuns,
      note:
        delivered === 0
          ? "Live emails are off (or dry-run recipients) — recorded as dry run, nothing was sent"
          : undefined,
    },
  });
}
