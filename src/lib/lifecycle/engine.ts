import prisma from "@/lib/prisma";
import type { Client, ClientService, Contractor, Prisma, ScheduledStep, StepKind } from "@prisma/client";
import { notifySlack } from "@/lib/slack";
import { getSetting } from "./settings";
import { getTierConstants, computeSupportEnd, computeCareFreeEnd, addDays } from "./tiers";
import { renderTokens, type RenderContext } from "./tokens";
import {
  SEQUENCE_SOURCES,
  SEQUENCE_SOURCE_BY_KEY,
  stepSource,
  type CancelConditionKey,
} from "./sequences-source";
import { TEMPLATE_SOURCES } from "./templates-source";
import { deliverLifecycleEmail, isDryRunAddress } from "./deliver";

/**
 * Lifecycle engine. Field transitions on Client/Contractor materialize
 * ScheduledStep rows; the cron processes due steps, re-checking cancel
 * conditions at send time so a missed hook can never cause a wrong send.
 *
 * Safety layers, in order:
 *  1. Every sequence ships disabled (SequenceConfig.enabled = false).
 *  2. The `lifecycle_live_emails` master switch defaults to OFF — while off,
 *     EMAIL steps are recorded as dry runs, nothing reaches Resend.
 *  3. Records with a @dryrun.local email are permanently dry (used for tests).
 *  4. DRAFT and TASK steps are structurally incapable of emailing a client.
 *  5. Overdue EMAIL steps expire instead of flood-sending when a sequence is
 *     enabled late.
 */

type ClientWithServices = Client & { services?: ClientService[] };

const EMAIL_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // overdue emails expire, never flood

// --- Seeding ---------------------------------------------------------------

/** Idempotent: creates missing templates/sequence configs, never overwrites edits. */
export async function ensureSeeded() {
  for (const t of TEMPLATE_SOURCES) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      create: { key: t.key, name: t.name, subject: t.subject, body: t.body, kind: t.kind },
      update: {},
    });
  }
  for (const seq of SEQUENCE_SOURCES) {
    const config = await prisma.sequenceConfig.upsert({
      where: { key: seq.key },
      create: { key: seq.key, name: seq.name, enabled: false },
      update: {},
    });
    for (const [i, step] of seq.steps.entries()) {
      await prisma.sequenceStepConfig.upsert({
        where: { key: step.key },
        create: {
          sequenceId: config.id,
          key: step.key,
          label: step.label,
          kind: step.kind,
          templateKey: step.templateKey || null,
          offsetMinutes: step.offsetMinutes,
          sortOrder: i,
        },
        update: {},
      });
    }
  }
}

// --- Shared context --------------------------------------------------------

async function lifecycleSettings() {
  return {
    bookingLink: await getSetting<string>("booking_link", ""),
    assetChecklistLink: await getSetting<string>("asset_checklist_link", ""),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app",
  };
}

export async function buildRenderContext(params: {
  client?: ClientWithServices | null;
  contractor?: Contractor | null;
  now?: Date;
  extra?: Record<string, string>;
  settingsOverride?: Partial<Awaited<ReturnType<typeof lifecycleSettings>>>;
}): Promise<RenderContext> {
  return {
    client: params.client || undefined,
    contractor: params.contractor || undefined,
    tierConstants: await getTierConstants(),
    settings: { ...(await lifecycleSettings()), ...(params.settingsOverride || {}) },
    now: params.now || new Date(),
    extra: params.extra,
  };
}

async function audit(params: {
  clientId?: string | null;
  taskId?: string | null;
  actor: string;
  action: string;
  details: string;
}) {
  await prisma.activityLog
    .create({
      data: {
        clientId: params.clientId || null,
        taskId: params.taskId || null,
        actor: params.actor,
        action: params.action,
        details: params.details,
      },
    })
    .catch(() => {});
}

function isForcedDry(client?: ClientWithServices | null, contractor?: Contractor | null): boolean {
  return isDryRunAddress(client?.email) || isDryRunAddress(contractor?.email);
}

// --- Materialization -------------------------------------------------------

async function currentOffsets(): Promise<Record<string, number>> {
  const rows = await prisma.sequenceStepConfig.findMany({
    select: { key: true, offsetMinutes: true },
  });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = r.offsetMinutes;
  // Fall back to shipped defaults for anything not yet seeded
  for (const seq of SEQUENCE_SOURCES) {
    for (const s of seq.steps) if (map[s.key] === undefined) map[s.key] = s.offsetMinutes;
  }
  return map;
}

async function createStep(params: {
  clientId?: string | null;
  contractorId?: string | null;
  sequenceKey: string;
  stepKey: string;
  kind: StepKind;
  anchorAt: Date;
  scheduledFor: Date;
  occurrence?: number;
}): Promise<ScheduledStep | null> {
  // Code-level dedupe (the DB unique constraint can't cover NULL columns):
  // never two live instances of the same step+occurrence for a record.
  const existing = await prisma.scheduledStep.findFirst({
    where: {
      clientId: params.clientId || null,
      contractorId: params.contractorId || null,
      stepKey: params.stepKey,
      occurrence: params.occurrence ?? 0,
      status: { notIn: ["CANCELLED", "SKIPPED", "FAILED"] },
    },
  });
  if (existing) return null;
  return prisma.scheduledStep.create({
    data: {
      clientId: params.clientId || null,
      contractorId: params.contractorId || null,
      sequenceKey: params.sequenceKey,
      stepKey: params.stepKey,
      occurrence: params.occurrence ?? 0,
      kind: params.kind,
      anchorAt: params.anchorAt,
      scheduledFor: params.scheduledFor,
    },
  });
}

/** Materialize every auto step of a sequence for a client from an anchor date. */
export async function materializeClientSequence(
  client: ClientWithServices,
  sequenceKey: string,
  anchor: Date
): Promise<number> {
  const seq = SEQUENCE_SOURCE_BY_KEY[sequenceKey];
  if (!seq || seq.recurring) return 0;
  const offsets = await currentOffsets();
  let created = 0;
  for (const step of seq.steps) {
    if (step.manualTrigger) continue;
    const scheduledFor = new Date(anchor.getTime() + offsets[step.key] * 60 * 1000);
    const row = await createStep({
      clientId: client.id,
      sequenceKey,
      stepKey: step.key,
      kind: step.kind,
      anchorAt: anchor,
      scheduledFor,
    });
    if (row) created++;
  }
  return created;
}

export async function materializeContractorSequence(
  contractor: Contractor,
  anchor: Date
): Promise<number> {
  const seq = SEQUENCE_SOURCE_BY_KEY["I"];
  const offsets = await currentOffsets();
  let created = 0;
  for (const step of seq.steps) {
    if (step.manualTrigger || step.key === "I_weekly") continue; // weekly comes from the cron scanner
    const scheduledFor = new Date(anchor.getTime() + offsets[step.key] * 60 * 1000);
    const row = await createStep({
      contractorId: contractor.id,
      sequenceKey: "I",
      stepKey: step.key,
      kind: step.kind,
      anchorAt: anchor,
      scheduledFor,
    });
    if (row) created++;
  }
  return created;
}

export async function cancelPendingSteps(params: {
  clientId?: string;
  contractorId?: string;
  sequenceKey?: string;
  stepKeys?: string[];
  reason: string;
}): Promise<number> {
  const result = await prisma.scheduledStep.updateMany({
    where: {
      status: "PENDING",
      ...(params.clientId ? { clientId: params.clientId } : {}),
      ...(params.contractorId ? { contractorId: params.contractorId } : {}),
      ...(params.sequenceKey ? { sequenceKey: params.sequenceKey } : {}),
      ...(params.stepKeys ? { stepKey: { in: params.stepKeys } } : {}),
    },
    data: { status: "CANCELLED", cancelReason: params.reason, processedAt: new Date() },
  });
  return result.count;
}

// --- Cancel conditions (re-checked at send time) ---------------------------

function cancelConditionMet(key: CancelConditionKey, client: Client): boolean {
  switch (key) {
    case "kickoff_booked":
      return client.kickoffBookedAt !== null;
    case "assets_received":
      return client.assetsReceivedAt !== null;
    case "care_decided":
      return client.careStatus !== "FREE";
  }
}

// --- Event hooks -----------------------------------------------------------

export interface ClientLifecycleSnapshot {
  contractSignedAt: Date | null;
  kickoffBookedAt: Date | null;
  assetDeadline: Date | null;
  assetsReceivedAt: Date | null;
  launchDate: Date | null;
  finalPaymentAt: Date | null;
  careStatus: Client["careStatus"];
}

export function snapshotClient(c: Client): ClientLifecycleSnapshot {
  return {
    contractSignedAt: c.contractSignedAt,
    kickoffBookedAt: c.kickoffBookedAt,
    assetDeadline: c.assetDeadline,
    assetsReceivedAt: c.assetsReceivedAt,
    launchDate: c.launchDate,
    finalPaymentAt: c.finalPaymentAt,
    careStatus: c.careStatus,
  };
}

const time = (d: Date | null) => (d ? d.getTime() : null);

/**
 * Main client hook — call after any update that may touch lifecycle fields.
 * Detects transitions between `before` and the current DB state, materializes
 * and cancels steps accordingly. Safe to call repeatedly (idempotent creates).
 */
export async function onClientChanged(
  clientId: string,
  before: ClientLifecycleSnapshot,
  actor: string,
  asOf: Date = new Date()
): Promise<void> {
  let client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { services: true },
  });
  if (!client) return;

  // Contract signed → default asset deadline (+10d, editable), sequences A + B
  if (!before.contractSignedAt && client.contractSignedAt) {
    if (!client.assetDeadline) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: { assetDeadline: addDays(client.contractSignedAt, 10) },
        include: { services: true },
      });
      await audit({
        clientId: client.id,
        actor: "system",
        action: "lifecycle_asset_deadline_defaulted",
        details: `Asset deadline defaulted to signing + 10 days`,
      });
    }
    await materializeClientSequence(client, "A", client.contractSignedAt!);
    if (client.assetDeadline) {
      await materializeClientSequence(client, "B", client.assetDeadline);
    }
    await audit({
      clientId: client.id,
      actor,
      action: "lifecycle_sequence_started",
      details: "Contract signed: onboarding (A) and content collection (B) scheduled",
    });
  }

  // Asset deadline moved → re-anchor B
  if (
    before.contractSignedAt &&
    client.assetDeadline &&
    time(before.assetDeadline) !== time(client.assetDeadline)
  ) {
    await cancelPendingSteps({
      clientId: client.id,
      sequenceKey: "B",
      reason: "Asset deadline changed, steps rescheduled from the new date",
    });
    // Re-create under a fresh occurrence so cancelled rows keep their history
    const offsets = await currentOffsets();
    const maxOcc = await prisma.scheduledStep.aggregate({
      where: { clientId: client.id, sequenceKey: "B" },
      _max: { occurrence: true },
    });
    const occ = (maxOcc._max.occurrence ?? 0) + 1;
    for (const step of SEQUENCE_SOURCE_BY_KEY["B"].steps) {
      await createStep({
        clientId: client.id,
        sequenceKey: "B",
        stepKey: step.key,
        kind: step.kind,
        anchorAt: client.assetDeadline,
        scheduledFor: new Date(client.assetDeadline.getTime() + offsets[step.key] * 60 * 1000),
        occurrence: occ,
      });
    }
  }

  // Kickoff booked → cancel the nudge
  if (!before.kickoffBookedAt && client.kickoffBookedAt) {
    const n = await cancelPendingSteps({
      clientId: client.id,
      stepKeys: ["A2"],
      reason: "Kickoff call booked",
    });
    if (n > 0)
      await audit({
        clientId: client.id,
        actor,
        action: "lifecycle_step_cancelled",
        details: "Kickoff booked: A2 nudge cancelled",
      });
  }

  // Assets received → cancel all pending content chasers
  if (!before.assetsReceivedAt && client.assetsReceivedAt) {
    const n = await cancelPendingSteps({
      clientId: client.id,
      sequenceKey: "B",
      reason: "Content received",
    });
    if (n > 0)
      await audit({
        clientId: client.id,
        actor,
        action: "lifecycle_step_cancelled",
        details: `Content received: ${n} pending content chaser(s) cancelled`,
      });
  }

  // Launch date set → computed dates, free Care starts, sequence E
  if (!before.launchDate && client.launchDate) {
    const constants = await getTierConstants();
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        supportEnd: computeSupportEnd(client.launchDate, client.packageTier, constants),
        careFreeEnd: computeCareFreeEnd(client.launchDate),
        ...(client.careStatus === "NONE" ? { careStatus: "FREE" } : {}),
      },
      include: { services: true },
    });
    await materializeClientSequence(client, "E", client.launchDate!);
    await audit({
      clientId: client.id,
      actor,
      action: "lifecycle_launched",
      details: "Launch date set: support and Care periods computed, Care conversion (E) scheduled",
    });
  }

  // Both launch + final payment → close-out
  const bothNow = client.launchDate && client.finalPaymentAt;
  const bothBefore = before.launchDate && before.finalPaymentAt;
  if (bothNow && !bothBefore) {
    await materializeClientSequence(client, "D", asOf);
    await audit({
      clientId: client.id,
      actor,
      action: "lifecycle_sequence_started",
      details: "Launch date and final payment set: close-out (D) triggered",
    });
  }

  // Care status transitions
  if (before.careStatus !== client.careStatus) {
    if (client.careStatus === "PAYING") {
      await cancelPendingSteps({
        clientId: client.id,
        sequenceKey: "E",
        reason: "Care converted to paying",
      });
      await materializeClientSequence(client, "F", asOf);
      await audit({
        clientId: client.id,
        actor,
        action: "lifecycle_care_converted",
        details: "Care is paying: conversion emails cancelled, check-in cadence (F) scheduled",
      });
    } else if (client.careStatus === "DECLINED") {
      await cancelPendingSteps({
        clientId: client.id,
        sequenceKey: "E",
        reason: "Care declined",
      });
      const offsets = await currentOffsets();
      const now = asOf;
      for (const key of ["E_owners_manual", "E_reapproach"]) {
        const step = stepSource("E", key)!;
        await createStep({
          clientId: client.id,
          sequenceKey: "E",
          stepKey: key,
          kind: step.kind,
          anchorAt: now,
          scheduledFor: new Date(now.getTime() + offsets[key] * 60 * 1000),
        });
      }
      await audit({
        clientId: client.id,
        actor,
        action: "lifecycle_care_declined",
        details: "Care declined: Owner's Manual task created, re-approach reminder set for +6 months",
      });
    } else if (before.careStatus === "PAYING") {
      await cancelPendingSteps({
        clientId: client.id,
        sequenceKey: "F",
        reason: "Care is no longer paying",
      });
    }
  }
}

export async function onContractorChanged(
  contractorId: string,
  beforeAgreementSignedAt: Date | null,
  actor: string
): Promise<void> {
  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId } });
  if (!contractor) return;
  if (!beforeAgreementSignedAt && contractor.agreementSignedAt) {
    await materializeContractorSequence(contractor, contractor.agreementSignedAt);
    await audit({
      actor,
      action: "lifecycle_sequence_started",
      details: `Contractor agreement signed: onboarding cadence (I) scheduled for ${contractor.name}`,
    });
  }
}

// --- Processing ------------------------------------------------------------

export interface ProcessOptions {
  asOf?: Date;
  onlyClientId?: string;
  onlyContractorId?: string;
  /** Dry-run records may process even while their sequence is disabled. */
  ignoreEnabledForDryRun?: boolean;
  /** Per-run merge-setting overrides (used by the dry run so placeholder links never touch real settings). */
  settingsOverride?: { bookingLink?: string; assetChecklistLink?: string };
}

export interface ProcessSummary {
  processed: number;
  sent: number;
  dryRun: number;
  tasksCreated: number;
  cancelled: number;
  expired: number;
  failed: number;
}

async function enabledSequences(): Promise<Set<string>> {
  const rows = await prisma.sequenceConfig.findMany({ where: { enabled: true }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

/** Process every due PENDING step as of `asOf`. The cron calls this every 15 minutes. */
export async function processDueSteps(opts: ProcessOptions = {}): Promise<ProcessSummary> {
  await ensureSeeded();
  const asOf = opts.asOf || new Date();
  const summary: ProcessSummary = {
    processed: 0,
    sent: 0,
    dryRun: 0,
    tasksCreated: 0,
    cancelled: 0,
    expired: 0,
    failed: 0,
  };
  const enabled = await enabledSequences();

  const where: Prisma.ScheduledStepWhereInput = {
    status: "PENDING",
    scheduledFor: { lte: asOf },
  };
  if (opts.onlyClientId) where.clientId = opts.onlyClientId;
  if (opts.onlyContractorId) where.contractorId = opts.onlyContractorId;

  const due = (await prisma.scheduledStep.findMany({
    where,
    include: { client: { include: { services: true } }, contractor: true },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  })) as unknown as Array<
    ScheduledStep & { client: ClientWithServices | null; contractor: Contractor | null }
  >;

  for (const step of due) {
    const client = step.client;
    const contractor = step.contractor;
    const forcedDry = isForcedDry(client, contractor);

    // Paused records hold their steps (still visible as pending on the timeline)
    if (client?.automationsPaused || contractor?.automationsPaused) continue;

    // Sequence must be enabled — except dry-run records during isolated tests
    if (!enabled.has(step.sequenceKey) && !(forcedDry && opts.ignoreEnabledForDryRun)) continue;

    summary.processed++;

    // Cancel condition re-check at send time (belt and braces)
    const src = stepSource(step.sequenceKey, step.stepKey);
    if (src?.cancelCondition && client && cancelConditionMet(src.cancelCondition, client)) {
      await prisma.scheduledStep.update({
        where: { id: step.id },
        data: {
          status: "CANCELLED",
          cancelReason: `Condition met before send: ${src.cancelCondition.replace(/_/g, " ")}`,
          processedAt: asOf,
        },
      });
      summary.cancelled++;
      continue;
    }

    // Overdue EMAIL steps expire rather than flood when a sequence is enabled late
    if (step.kind === "EMAIL" && asOf.getTime() - step.scheduledFor.getTime() > EMAIL_EXPIRY_MS) {
      await prisma.scheduledStep.update({
        where: { id: step.id },
        data: {
          status: "CANCELLED",
          cancelReason: "Missed send window (sequence was off or record was paused)",
          processedAt: asOf,
        },
      });
      summary.expired++;
      continue;
    }

    try {
      await executeStep(step, {
        client,
        contractor,
        asOf,
        forcedDry,
        summary,
        settingsOverride: opts.settingsOverride,
      });
    } catch (err) {
      console.error(`[Lifecycle] Step ${step.stepKey} failed:`, err);
      await prisma.scheduledStep.update({
        where: { id: step.id },
        data: {
          status: "FAILED",
          cancelReason: err instanceof Error ? err.message : "Unknown error",
          processedAt: asOf,
        },
      });
      summary.failed++;
    }
  }
  return summary;
}

async function executeStep(
  step: ScheduledStep,
  ctx: {
    client: ClientWithServices | null;
    contractor: Contractor | null;
    asOf: Date;
    forcedDry: boolean;
    summary: ProcessSummary;
    settingsOverride?: { bookingLink?: string; assetChecklistLink?: string };
  }
) {
  const { client, contractor, asOf, forcedDry, summary } = ctx;
  const src = stepSource(step.sequenceKey, step.stepKey);
  const extra: Record<string, string> = {};
  const nMatch = step.stepKey.match(/_(\d+)$/);
  if (nMatch) extra.n = nMatch[1];
  const renderCtx = await buildRenderContext({
    client,
    contractor,
    now: asOf,
    extra,
    settingsOverride: ctx.settingsOverride,
  });

  const template = src?.templateKey
    ? await prisma.emailTemplate.findUnique({ where: { key: src.templateKey } })
    : null;

  if (step.kind === "EMAIL") {
    if (!template) throw new Error(`Template missing for step ${step.stepKey}`);
    if (!client?.email) throw new Error("Client has no email address");
    const subject = renderTokens(template.subject, renderCtx);
    const body = renderTokens(template.body, renderCtx);
    const missing = [...new Set([...subject.missing, ...body.missing])];
    if (missing.length > 0) {
      // NEVER send raw tokens to a client
      throw new Error(`Unresolved merge fields: ${missing.join(", ")}`);
    }
    const result = await deliverLifecycleEmail({
      to: client.email,
      subject: subject.text,
      bodyText: body.text,
      forceDry: forcedDry,
    });
    await prisma.scheduledStep.update({
      where: { id: step.id },
      data: {
        status: "SENT",
        dryRun: result.dryRun,
        renderedSubject: subject.text,
        renderedBody: body.text,
        processedAt: asOf,
        meta: result.reason ? { dryRunReason: result.reason } : undefined,
      },
    });
    if (result.delivered) {
      summary.sent++;
      await audit({
        clientId: client.id,
        actor: "system",
        action: "lifecycle_email_sent",
        details: `Sent "${subject.text}" (${step.stepKey}) to ${client.email}`,
      });
      await notifySlack(
        `:email: Lifecycle email *${subject.text}* sent to *${client.name}* (step ${step.stepKey})`
      ).catch(() => {});
    } else {
      summary.dryRun++;
      await audit({
        clientId: client.id,
        actor: "system",
        action: "lifecycle_email_dry_run",
        details: `Dry run "${subject.text}" (${step.stepKey}) — ${result.reason}`,
      });
    }
    return;
  }

  // DRAFT and TASK steps: internal only, never email anyone.
  // Tasks are team-visible — money tokens are redacted in anything that lands
  // on a kanban card. The step keeps the full rendered draft for sending.
  const title = src?.taskTitle
    ? renderTokens(src.taskTitle, renderCtx, { redactMoney: true }).text
    : template
      ? renderTokens(template.subject, renderCtx, { redactMoney: true }).text
      : src?.label || step.stepKey;

  let description = src?.taskDescription
    ? renderTokens(src.taskDescription, renderCtx, { redactMoney: true }).text
    : "";
  let renderedSubject: string | null = null;
  let renderedBody: string | null = null;
  if (step.kind === "DRAFT" && template) {
    // Pre-fill the draft; manual tokens stay visible for the human to replace
    renderedSubject = renderTokens(template.subject, renderCtx).text;
    renderedBody = renderTokens(template.body, renderCtx).text;
    description = [
      description,
      "",
      "--- Draft (fill and send from the timeline, it never sends itself) ---",
      `Subject: ${renderTokens(template.subject, renderCtx, { redactMoney: true }).text}`,
      "",
      renderTokens(template.body, renderCtx, { redactMoney: true }).text,
    ]
      .join("\n")
      .trim();
  }

  let taskId: string | null = null;
  if (!forcedDry) {
    const task = await prisma.task.create({
      data: {
        clientId: client?.id || null,
        title,
        description: description || null,
        status: "TODO",
        priority: step.kind === "DRAFT" ? "HIGH" : "MEDIUM",
        category: step.sequenceKey === "I" ? "GENERAL" : "CLIENT_COMMS",
        dueDate: step.scheduledFor,
        assignedTo: "chase",
        tags: ["lifecycle", `seq-${step.sequenceKey}`],
      },
    });
    taskId = task.id;
    if (src?.checklist?.length) {
      await prisma.checklistItem.createMany({
        data: src.checklist.map((label, i) => ({ taskId: task.id, label, sortOrder: i })),
      });
    }
    summary.tasksCreated++;
  } else {
    summary.dryRun++;
  }

  await prisma.scheduledStep.update({
    where: { id: step.id },
    data: {
      status: "DONE",
      dryRun: forcedDry,
      renderedSubject,
      renderedBody,
      taskId,
      processedAt: asOf,
    },
  });
  await audit({
    clientId: client?.id || null,
    taskId,
    actor: "system",
    action: forcedDry ? "lifecycle_task_dry_run" : "lifecycle_task_created",
    details: `${step.kind === "DRAFT" ? "Draft" : "Task"} "${title}" (${step.stepKey})${forcedDry ? " — dry run, no task created" : ""}`,
  });
}

// --- Recurring generators (called by the cron) -----------------------------

const dayStamp = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const quarterStamp = (d: Date) => d.getFullYear() * 10 + Math.floor(d.getMonth() / 3) + 1;

/** Friday update drafts (C) — one per active project per Friday. */
export async function generateFridayUpdates(asOf = new Date()): Promise<number> {
  if (asOf.getDay() !== 5) return 0;
  const enabled = await enabledSequences();
  const occurrence = dayStamp(asOf);
  const clients = await prisma.client.findMany({
    where: {
      role: "CLIENT",
      contractSignedAt: { not: null },
      launchDate: null,
      automationsPaused: false,
      type: { not: "ARCHIVED" },
    },
  });
  let created = 0;
  for (const c of clients) {
    if (!enabled.has("C") && !isDryRunAddress(c.email)) continue;
    const row = await createStep({
      clientId: c.id,
      sequenceKey: "C",
      stepKey: "C1",
      kind: "DRAFT",
      anchorAt: asOf,
      scheduledFor: asOf,
      occurrence,
    });
    if (row) created++;
  }
  return created;
}

/** Quarterly recap broadcast draft (G) — one global draft in the first days of each quarter. */
export async function generateQuarterlyRecap(asOf = new Date()): Promise<number> {
  const enabled = await enabledSequences();
  if (!enabled.has("G")) return 0;
  const isQuarterStart = asOf.getMonth() % 3 === 0 && asOf.getDate() <= 3;
  if (!isQuarterStart) return 0;
  const occurrence = quarterStamp(asOf);
  const row = await createStep({
    sequenceKey: "G",
    stepKey: "G1",
    kind: "DRAFT",
    anchorAt: asOf,
    scheduledFor: asOf,
    occurrence,
  });
  return row ? 1 : 0;
}

/** Quarterly partner touch tasks (H). */
export async function generatePartnerTouches(asOf = new Date()): Promise<number> {
  const enabled = await enabledSequences();
  const isQuarterStart = asOf.getMonth() % 3 === 0 && asOf.getDate() <= 3;
  if (!isQuarterStart) return 0;
  const occurrence = quarterStamp(asOf);
  const partners = await prisma.client.findMany({
    where: { role: "PARTNER", automationsPaused: false, type: { not: "ARCHIVED" } },
  });
  let created = 0;
  for (const p of partners) {
    if (!enabled.has("H") && !isDryRunAddress(p.email)) continue;
    const row = await createStep({
      clientId: p.id,
      sequenceKey: "H",
      stepKey: "H_touch",
      kind: "TASK",
      anchorAt: asOf,
      scheduledFor: asOf,
      occurrence,
    });
    if (row) created++;
  }
  return created;
}

/** Keeps quarterly Care check-ins (F) rolling after day 90 while status stays paying. */
export async function generateCareQuarterly(asOf = new Date()): Promise<number> {
  const enabled = await enabledSequences();
  const paying = await prisma.client.findMany({
    where: { careStatus: "PAYING", automationsPaused: false, type: { not: "ARCHIVED" } },
  });
  let created = 0;
  for (const c of paying) {
    if (!enabled.has("F") && !isDryRunAddress(c.email)) continue;
    const last = await prisma.scheduledStep.findFirst({
      where: { clientId: c.id, sequenceKey: "F", status: { in: ["DONE", "PENDING"] } },
      orderBy: { scheduledFor: "desc" },
    });
    if (!last || last.status === "PENDING") continue;
    const nextAt = addDays(last.scheduledFor, 90);
    if (nextAt.getTime() > asOf.getTime() + 7 * 24 * 60 * 60 * 1000) continue;
    const row = await createStep({
      clientId: c.id,
      sequenceKey: "F",
      stepKey: "F_quarterly",
      kind: "TASK",
      anchorAt: last.scheduledFor,
      scheduledFor: nextAt,
      occurrence: last.stepKey === "F_quarterly" ? last.occurrence + 1 : 1,
    });
    if (row) created++;
  }
  return created;
}

/** Weekly contractor review tasks (I) on each contractor's review day. */
export async function generateContractorWeekly(asOf = new Date()): Promise<number> {
  const enabled = await enabledSequences();
  const occurrence = dayStamp(asOf);
  const contractors = await prisma.contractor.findMany({
    where: {
      isActive: true,
      agreementSignedAt: { not: null },
      weeklyReviewDay: asOf.getDay(),
      automationsPaused: false,
    },
  });
  let created = 0;
  for (const c of contractors) {
    if (!enabled.has("I") && !isDryRunAddress(c.email)) continue;
    const row = await createStep({
      contractorId: c.id,
      sequenceKey: "I",
      stepKey: "I_weekly",
      kind: "TASK",
      anchorAt: asOf,
      scheduledFor: asOf,
      occurrence,
    });
    if (row) created++;
  }
  return created;
}

export async function runRecurringGenerators(asOf = new Date()) {
  return {
    fridayUpdates: await generateFridayUpdates(asOf),
    quarterlyRecap: await generateQuarterlyRecap(asOf),
    partnerTouches: await generatePartnerTouches(asOf),
    careQuarterly: await generateCareQuarterly(asOf),
    contractorWeekly: await generateContractorWeekly(asOf),
  };
}

// --- Rescheduling on timing edits ------------------------------------------

/** Applies a new offset to every PENDING instance of a step (anchor-relative). */
export async function reschedulePendingForStep(
  stepKey: string,
  newOffsetMinutes: number
): Promise<number> {
  const pending = await prisma.scheduledStep.findMany({
    where: { stepKey, status: "PENDING" },
  });
  for (const step of pending) {
    await prisma.scheduledStep.update({
      where: { id: step.id },
      data: { scheduledFor: new Date(step.anchorAt.getTime() + newOffsetMinutes * 60 * 1000) },
    });
  }
  return pending.length;
}
