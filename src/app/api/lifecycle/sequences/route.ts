import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureSeeded, reschedulePendingForStep } from "@/lib/lifecycle/engine";
import {
  SEQUENCE_SOURCE_BY_KEY,
  CANCEL_CONDITIONS,
  stepSource,
} from "@/lib/lifecycle/sequences-source";

// GET /api/lifecycle/sequences — configs with steps, timings, cancel conditions
export async function GET() {
  await ensureSeeded();
  const configs = (await prisma.sequenceConfig.findMany({
    orderBy: { key: "asc" },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  })) as unknown as Array<
    import("@prisma/client").SequenceConfig & {
      steps: import("@prisma/client").SequenceStepConfig[];
    }
  >;
  return NextResponse.json({
    success: true,
    data: configs.map((c) => {
      const source = SEQUENCE_SOURCE_BY_KEY[c.key];
      return {
        key: c.key,
        name: c.name,
        enabled: c.enabled,
        trigger: source?.trigger || "",
        anchorDescription: source?.anchorDescription || "",
        audience: source?.audience || "client",
        recurring: !!source?.recurring,
        updatedBy: c.updatedBy,
        updatedAt: c.updatedAt,
        steps: c.steps.map((s) => {
          const src = stepSource(c.key, s.key);
          return {
            key: s.key,
            label: s.label,
            kind: s.kind,
            templateKey: s.templateKey,
            offsetMinutes: s.offsetMinutes,
            defaultOffsetMinutes: src?.offsetMinutes ?? s.offsetMinutes,
            offsetBounds: src?.offsetBounds ?? [0, 0],
            editable: !!src && src.offsetBounds[0] !== src.offsetBounds[1],
            cancelCondition: src?.cancelCondition
              ? { key: src.cancelCondition, ...CANCEL_CONDITIONS[src.cancelCondition] }
              : null,
          };
        }),
      };
    }),
  });
}

const putSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean().optional(),
  stepKey: z.string().optional(),
  offsetMinutes: z.number().int().optional(),
});

// PUT /api/lifecycle/sequences — toggle a sequence (owner only) or edit a step timing
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const { key, enabled, stepKey, offsetMinutes } = parsed.data;
  const config = await prisma.sequenceConfig.findUnique({ where: { key } });
  if (!config) {
    return NextResponse.json({ success: false, error: "Sequence not found" }, { status: 404 });
  }

  // Enable/disable a whole sequence — owner only
  if (enabled !== undefined) {
    if (session.role !== "OWNER") {
      return NextResponse.json(
        { success: false, error: "Only the owner can enable or disable sequences" },
        { status: 403 }
      );
    }
    await prisma.sequenceConfig.update({
      where: { key },
      data: { enabled, updatedBy: session.name },
    });
    await prisma.activityLog.create({
      data: {
        actor: session.name,
        action: "lifecycle_sequence_toggled",
        details: JSON.stringify({ sequence: key, oldValue: config.enabled, newValue: enabled }),
      },
    });
  }

  // Edit a step's timing offset — moderators allowed, bounds enforced
  if (stepKey !== undefined && offsetMinutes !== undefined) {
    const src = stepSource(key, stepKey);
    const stepConfig = await prisma.sequenceStepConfig.findUnique({ where: { key: stepKey } });
    if (!src || !stepConfig) {
      return NextResponse.json({ success: false, error: "Step not found" }, { status: 404 });
    }
    const [min, max] = src.offsetBounds;
    if (min === max) {
      return NextResponse.json(
        { success: false, error: "This step's timing is fixed" },
        { status: 400 }
      );
    }
    if (offsetMinutes < min || offsetMinutes > max) {
      const fmt = (m: number) => (Math.abs(m) >= 1440 ? `${m / 1440} days` : `${m / 60} hours`);
      return NextResponse.json(
        { success: false, error: `Timing must be between ${fmt(min)} and ${fmt(max)} from the anchor` },
        { status: 400 }
      );
    }
    await prisma.sequenceStepConfig.update({
      where: { key: stepKey },
      data: { offsetMinutes, updatedBy: session.name },
    });
    // Reschedule already-pending instances from their anchor
    const rescheduled = await reschedulePendingForStep(stepKey, offsetMinutes);
    await prisma.activityLog.create({
      data: {
        actor: session.name,
        action: "lifecycle_timing_edited",
        details: JSON.stringify({
          sequence: key,
          step: stepKey,
          oldValue: stepConfig.offsetMinutes,
          newValue: offsetMinutes,
          rescheduledPendingSteps: rescheduled,
        }),
      },
    });
    return NextResponse.json({ success: true, data: { rescheduled } });
  }

  return NextResponse.json({ success: true });
}
