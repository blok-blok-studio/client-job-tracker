import prisma from "@/lib/prisma";
import { addDays } from "./tiers";
import {
  ensureSeeded,
  onClientChanged,
  onContractorChanged,
  processDueSteps,
  generateFridayUpdates,
  generateContractorWeekly,
  snapshotClient,
} from "./engine";
import { DRY_RUN_EMAIL_DOMAIN } from "./deliver";

/**
 * Walks a fake client and a fake contractor through the full lifecycle with
 * simulated time. Fake records use @dryrun.local emails, which the engine
 * treats as permanently dry: no Resend calls, no kanban tasks — every step is
 * recorded on the timeline with its rendered content instead.
 */

export interface DryRunEvent {
  day: number;
  action: string;
}

export interface DryRunStepRow {
  record: string;
  sequenceKey: string;
  stepKey: string;
  kind: string;
  status: string;
  dryRun: boolean;
  scheduledFor: Date;
  processedAt: Date | null;
  subjectOrTitle: string | null;
  cancelReason: string | null;
}

export interface DryRunAssertion {
  name: string;
  pass: boolean;
  detail: string;
}

export interface DryRunReport {
  clientId: string;
  contractorId: string;
  t0: Date;
  events: DryRunEvent[];
  timeline: DryRunStepRow[];
  assertions: DryRunAssertion[];
  emailsDelivered: number; // must be 0
}

const at = (t0: Date, days: number, minutes = 5) =>
  new Date(t0.getTime() + days * 24 * 60 * 60 * 1000 + minutes * 60 * 1000);

function nextDow(from: Date, dow: number): Date {
  const d = new Date(from);
  const diff = (dow - d.getDay() + 7) % 7 || 7;
  return addDays(d, diff);
}

/** Remove previous dry-run records so reruns start clean. Only touches @dryrun.local fakes. */
export async function cleanupDryRunRecords() {
  await prisma.client.deleteMany({ where: { email: { endsWith: DRY_RUN_EMAIL_DOMAIN } } });
  await prisma.contractor.deleteMany({ where: { email: { endsWith: DRY_RUN_EMAIL_DOMAIN } } });
}

async function applyClientUpdate(
  clientId: string,
  data: Parameters<typeof prisma.client.update>[0]["data"],
  events: DryRunEvent[],
  t0: Date,
  day: number,
  label: string
) {
  const before = snapshotClient(
    (await prisma.client.findUniqueOrThrow({ where: { id: clientId } }))
  );
  await prisma.client.update({ where: { id: clientId }, data });
  // Simulated "now" so anchors land on the simulated dates, not real time
  await onClientChanged(clientId, before, "dry-run", at(t0, day));
  events.push({ day, action: label });
}

export async function runFullDryRun(): Promise<DryRunReport> {
  await ensureSeeded();
  await cleanupDryRunRecords();

  const t0 = new Date();
  const events: DryRunEvent[] = [];
  // Placeholder links are passed per-run only — they never touch real settings.
  const process = (asOfDate: Date) =>
    processDueSteps({
      asOf: asOfDate,
      ignoreEnabledForDryRun: true,
      settingsOverride: {
        bookingLink: "https://cal.com/blokblokstudio/kickoff",
        assetChecklistLink: "https://blokblokstudio-clients.vercel.app/u/dryrun-example",
      },
    });

  // --- Fake records ---
  const client = await prisma.client.create({
    data: {
      name: "Maria Keller (Dry Run)",
      email: `maria${DRY_RUN_EMAIL_DOMAIN}`,
      company: "Keller Bakery",
      type: "ACTIVE",
      role: "CLIENT",
      packageTier: "ESSENTIAL",
      projectName: "Keller Bakery Website",
      projectPrice: 3500,
      depositReceived: 1750,
      projectBalance: 1750,
      websiteUrl: "https://kellerbakery.example",
    },
  });
  const contractor = await prisma.contractor.create({
    data: {
      name: "Jonas Weber (Dry Run)",
      email: `jonas${DRY_RUN_EMAIL_DOMAIN}`,
      uploadToken: `dryrun-${Date.now().toString(36)}`,
      weeklyReviewDay: 1, // Monday
    },
  });
  events.push({ day: 0, action: "Created fake client (Essential tier) and fake contractor" });

  // --- Day 0: contract signed → A1 immediately, asset deadline defaults to +10d ---
  await applyClientUpdate(client.id, { contractSignedAt: t0 }, events, t0, 0, "Contract signed");
  await process(at(t0, 0));

  // Contractor agreement signed the same day → I cadence
  await onContractorChanged(
    contractor.id,
    null,
    "dry-run"
  ); // no-op guard check (agreement not yet set)
  await prisma.contractor.update({
    where: { id: contractor.id },
    data: { agreementSignedAt: t0 },
  });
  await onContractorChanged(contractor.id, null, "dry-run");
  events.push({ day: 0, action: "Contractor agreement signed" });
  await process(at(t0, 0, 10));

  // --- Day 1: kickoff booked → A2 must never fire ---
  await applyClientUpdate(client.id, { kickoffBookedAt: at(t0, 1) }, events, t0, 1, "Kickoff call booked");

  // --- Day 2+: where A2 would have fired ---
  await process(at(t0, 2, 90));

  // --- Day 3: content chaser B1 (deadline minus 7) fires ---
  await process(at(t0, 3));

  // --- Day 4: assets received → B2 and B3 must cancel ---
  await applyClientUpdate(client.id, { assetsReceivedAt: at(t0, 4) }, events, t0, 4, "Content received");
  await process(at(t0, 4, 30));

  // --- First Friday: update prompt draft for Chase ---
  const friday = nextDow(t0, 5);
  const fridayDay = Math.round((friday.getTime() - t0.getTime()) / 86400000);
  await generateFridayUpdates(friday);
  await process(new Date(friday.getTime() + 5 * 60 * 1000));
  events.push({ day: fridayDay, action: "Friday: weekly update draft prompt generated" });

  // --- Contractor onboarding tasks come due ---
  await process(at(t0, 7));
  await process(at(t0, 14));

  // --- Day 21: launch + final payment → close-out D, Care period starts, E scheduled ---
  const launch = at(t0, 21, 0);
  await applyClientUpdate(client.id, { launchDate: launch }, events, t0, 21, "Launch date set");
  await applyClientUpdate(client.id, { finalPaymentAt: launch }, events, t0, 21, "Final payment received");
  await process(at(t0, 21, 30));

  // --- Contractor day 30 review ---
  await process(at(t0, 30));

  // --- Contractor weekly review on his review day (Monday) ---
  const monday = nextDow(addDays(t0, 30), 1);
  const mondayDay = Math.round((monday.getTime() - t0.getTime()) / 86400000);
  await generateContractorWeekly(monday);
  await process(new Date(monday.getTime() + 5 * 60 * 1000));
  events.push({ day: mondayDay, action: "Contractor weekly review task generated (Monday)" });

  // --- Launch+30 (day 51): Care value note draft #1 ---
  await process(at(t0, 51));

  // --- Contractor day 60 ---
  await process(at(t0, 60));

  // --- Launch+60 (day 81): Care value note draft #2 ---
  await process(at(t0, 81));

  // --- Launch+70 (day 91): E2 conversion call email fires ---
  await process(at(t0, 91));

  // --- Day 96: client converts to paying Care → E3 and note #3 must cancel, F starts ---
  await applyClientUpdate(
    client.id,
    { careStatus: "PAYING", careTier: "CARE" },
    events,
    t0,
    96,
    "Care converted to paying (200 per month)"
  );

  // --- Where E3 (launch+80 = day 101) would have fired ---
  await process(at(t0, 101));

  // --- F check-in day 30 (day 126) ---
  await process(at(t0, 126));

  // --- Collect timeline ---
  const steps = await prisma.scheduledStep.findMany({
    where: { OR: [{ clientId: client.id }, { contractorId: contractor.id }] },
    orderBy: { scheduledFor: "asc" },
  });
  const timeline: DryRunStepRow[] = steps.map((s) => ({
    record: s.clientId ? "client" : "contractor",
    sequenceKey: s.sequenceKey,
    stepKey: s.stepKey,
    kind: s.kind,
    status: s.status,
    dryRun: s.dryRun,
    scheduledFor: s.scheduledFor,
    processedAt: s.processedAt,
    subjectOrTitle: s.renderedSubject,
    cancelReason: s.cancelReason,
  }));

  // --- Assertions (the acceptance criteria) ---
  const find = (key: string) => steps.find((s) => s.stepKey === key);
  const freshClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
  const assertions: DryRunAssertion[] = [];
  const assert = (name: string, pass: boolean, detail: string) =>
    assertions.push({ name, pass, detail });

  const a1 = find("A1");
  assert(
    "A1 welcome sent at T+0 (dry)",
    a1?.status === "SENT" && a1.dryRun,
    `A1 status=${a1?.status} dryRun=${a1?.dryRun}`
  );
  const a2 = find("A2");
  assert(
    "A2 cancelled after kickoff booked",
    a2?.status === "CANCELLED",
    `A2 status=${a2?.status} reason=${a2?.cancelReason}`
  );
  const b1 = find("B1");
  assert("B1 one-week warning sent (dry)", b1?.status === "SENT" && !!b1.dryRun, `B1 status=${b1?.status}`);
  const b2 = find("B2");
  const b3 = find("B3");
  assert(
    "B2 and B3 cancelled after content received",
    b2?.status === "CANCELLED" && b3?.status === "CANCELLED",
    `B2=${b2?.status}, B3=${b3?.status}`
  );
  const c1 = find("C1");
  assert("C1 Friday draft created, never auto-sent", c1?.status === "DONE" && c1.kind === "DRAFT", `C1 status=${c1?.status}`);
  const d1 = find("D1");
  assert("D1 completion summary sent (dry)", d1?.status === "SENT" && !!d1.dryRun, `D1 status=${d1?.status}`);
  assert(
    "D referral-names task created",
    find("D_referrals")?.status === "DONE",
    `D_referrals status=${find("D_referrals")?.status}`
  );
  const expectedSupport = addDays(launch, 0);
  const supportOk =
    freshClient.supportEnd &&
    Math.abs(
      freshClient.supportEnd.getTime() -
        new Date(new Date(expectedSupport).setMonth(expectedSupport.getMonth() + 6)).getTime()
    ) <
      36 * 60 * 60 * 1000;
  assert(
    "supportEnd = launch + 6 months (Essential)",
    !!supportOk,
    `supportEnd=${freshClient.supportEnd?.toDateString()}`
  );
  const careOk =
    freshClient.careFreeEnd &&
    Math.abs(
      freshClient.careFreeEnd.getTime() -
        new Date(new Date(launch).setMonth(launch.getMonth() + 3)).getTime()
    ) <
      36 * 60 * 60 * 1000;
  assert(
    "careFreeEnd = launch + 3 months",
    !!careOk,
    `careFreeEnd=${freshClient.careFreeEnd?.toDateString()}`
  );
  const note30 = find("E_note30");
  assert(
    "E1 Care note is a draft with stat placeholders intact",
    note30?.status === "DONE" &&
      note30.kind === "DRAFT" &&
      (note30.renderedBody || "").includes("{{uptime}}"),
    `E_note30 status=${note30?.status}`
  );
  const e2 = find("E_call70");
  assert("E2 conversion call email sent at launch+70 (dry)", e2?.status === "SENT" && !!e2.dryRun, `status=${e2?.status}`);
  const e3 = find("E_decision80");
  assert(
    "E3 decision email cancelled after care went paying",
    e3?.status === "CANCELLED",
    `E_decision80 status=${e3?.status} reason=${e3?.cancelReason}`
  );
  const f30 = find("F_30");
  assert("F 30-day check-in task after conversion", f30?.status === "DONE", `F_30 status=${f30?.status}`);
  const iDay0 = find("I_day0");
  assert(
    "Contractor 'Before day 1' checklist task",
    iDay0?.status === "DONE" && iDay0.kind === "TASK",
    `I_day0 status=${iDay0?.status}`
  );
  assert(
    "Contractor weekly review generated on review day",
    find("I_weekly")?.status === "DONE",
    `I_weekly status=${find("I_weekly")?.status}`
  );
  const noRawTokens = steps
    .filter((s) => s.kind === "EMAIL" && s.status === "SENT")
    .every((s) => !(s.renderedBody || "").match(/\{\{(?!uptime|patch_count|backup_count|hours_used|what_was_done|hours_remaining)/));
  assert("No auto-sent email contains raw merge tokens", noRawTokens, "checked all SENT email bodies");
  const emailsDelivered = steps.filter(
    (s) => s.kind === "EMAIL" && s.status === "SENT" && !s.dryRun
  ).length;
  assert("Zero real emails delivered", emailsDelivered === 0, `${emailsDelivered} real sends`);

  return {
    clientId: client.id,
    contractorId: contractor.id,
    t0,
    events,
    timeline,
    assertions,
    emailsDelivered,
  };
}
