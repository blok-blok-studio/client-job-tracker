import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SEQUENCE_SOURCE_BY_KEY, stepSource, CANCEL_CONDITIONS } from "@/lib/lifecycle/sequences-source";

// GET /api/lifecycle/steps?clientId= | ?contractorId= | ?global=1
// A record's full lifecycle timeline: sent, pending, cancelled and why.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("clientId");
  const contractorId = searchParams.get("contractorId");
  const global = searchParams.get("global") === "1";

  if (!clientId && !contractorId && !global) {
    return NextResponse.json(
      { success: false, error: "clientId, contractorId or global required" },
      { status: 400 }
    );
  }

  const steps = await prisma.scheduledStep.findMany({
    where: global
      ? { clientId: null, contractorId: null }
      : clientId
        ? { clientId }
        : { contractorId },
    orderBy: { scheduledFor: "asc" },
  });

  const paused = clientId
    ? (await prisma.client.findUnique({ where: { id: clientId }, select: { automationsPaused: true } }))
        ?.automationsPaused
    : contractorId
      ? (
          await prisma.contractor.findUnique({
            where: { id: contractorId },
            select: { automationsPaused: true },
          })
        )?.automationsPaused
      : false;

  return NextResponse.json({
    success: true,
    data: {
      automationsPaused: !!paused,
      steps: steps.map((s) => {
        const src = stepSource(s.sequenceKey, s.stepKey);
        return {
          id: s.id,
          sequenceKey: s.sequenceKey,
          sequenceName: SEQUENCE_SOURCE_BY_KEY[s.sequenceKey]?.name || s.sequenceKey,
          stepKey: s.stepKey,
          label: src?.label || s.stepKey,
          kind: s.kind,
          status: s.status,
          dryRun: s.dryRun,
          scheduledFor: s.scheduledFor,
          processedAt: s.processedAt,
          cancelReason: s.cancelReason,
          cancelCondition: src?.cancelCondition
            ? CANCEL_CONDITIONS[src.cancelCondition].description
            : null,
          renderedSubject: s.renderedSubject,
          renderedBody: s.renderedBody,
          taskId: s.taskId,
        };
      }),
    },
  });
}
