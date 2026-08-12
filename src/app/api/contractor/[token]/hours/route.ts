import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";

// Public, token-scoped contractor hours log API.
// GET  — validate the link and return assigned clients + the contractor's own entries
// POST — log a work session. Entries are append-only legal records: no update or
//        delete path exists. Mistakes are fixed by submitting a correction entry
//        that points at the original via correctsId.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

// Exact certification wording stored on every entry. Changing this only affects
// future submissions; past rows keep the text they were attested under.
const ATTESTATION_TEXT =
  "I certify that the hours reported in this entry are true and accurate.";

const MAX_SESSION_MINUTES = 16 * 60;

async function findContractor(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contractor.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, company: true, isActive: true },
  });
}

const entrySelect = {
  id: true,
  workDate: true,
  startLocal: true,
  endLocal: true,
  timezone: true,
  durationMinutes: true,
  clientId: true,
  clientName: true,
  description: true,
  status: true,
  submittedAt: true,
  correctsId: true,
  correctedBy: { select: { id: true } },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const contractor = await findContractor(token);
  if (!contractor || !contractor.isActive) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const [assignments, entries] = await Promise.all([
    // Prisma include-type inference is broken repo-wide — cast the result
    prisma.contractorClientAssignment.findMany({
      where: { contractorId: contractor.id },
      select: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }) as unknown as Promise<{ client: { id: string; name: string } }[]>,
    prisma.contractorHoursEntry.findMany({
      where: { contractorId: contractor.id },
      orderBy: { startAt: "desc" },
      take: 50,
      select: entrySelect,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      contractor: { name: contractor.name, company: contractor.company },
      clients: assignments.map((a) => a.client),
      entries,
      attestationText: ATTESTATION_TEXT,
    },
  });
}

const submitSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startLocal: z.string().regex(/^\d{2}:\d{2}$/),
  endLocal: z.string().regex(/^\d{2}:\d{2}$/),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1).max(64),
  utcOffsetMinutes: z.number().int().min(-14 * 60).max(14 * 60),
  clientId: z.string().max(64).nullable().optional(),
  description: z.string().min(3).max(4000),
  attested: z.literal(true),
  correctsId: z.string().max(64).optional(),
});

// Format a UTC instant back into the wall-clock string the browser claims it
// came from, using the browser-reported offset (getTimezoneOffset convention:
// minutes to ADD to local time to reach UTC).
function localString(instant: Date, utcOffsetMinutes: number) {
  const local = new Date(instant.getTime() - utcOffsetMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}`,
    time: `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`,
  };
}

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const contractor = await findContractor(token);
    if (!contractor || !contractor.isActive) {
      return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const startAt = new Date(d.startAt);
    const endAt = new Date(d.endAt);
    if (!(endAt.getTime() > startAt.getTime())) {
      return NextResponse.json(
        { success: false, error: "End time must be after start time" },
        { status: 400 }
      );
    }
    const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
    if (durationMinutes < 1 || durationMinutes > MAX_SESSION_MINUTES) {
      return NextResponse.json(
        { success: false, error: "Session length must be between 1 minute and 16 hours" },
        { status: 400 }
      );
    }

    // The UTC instants must reproduce the wall-clock values the contractor typed
    // (±1 min for the start; the end additionally tolerates a DST shift on
    // overnight sessions). Rejects tampered or malformed payloads.
    const start = localString(startAt, d.utcOffsetMinutes);
    if (start.date !== d.workDate || start.time !== d.startLocal) {
      return NextResponse.json(
        { success: false, error: "Times do not match the reported timezone" },
        { status: 400 }
      );
    }
    const startLocalMs = new Date(`${d.workDate}T${d.startLocal}:00Z`).getTime();
    const endLocalMs = new Date(`${d.workDate}T${d.endLocal}:00Z`).getTime();
    const claimedDuration =
      (endLocalMs - startLocalMs + 24 * 60 * 60_000) % (24 * 60 * 60_000) || 24 * 60 * 60_000;
    if (Math.abs(claimedDuration / 60_000 - durationMinutes) > 61) {
      return NextResponse.json(
        { success: false, error: "Times do not match the reported timezone" },
        { status: 400 }
      );
    }

    // Client tag must be one of this contractor's assignments (null = general work)
    let clientName: string | null = null;
    const clientId = d.clientId || null;
    if (clientId) {
      const assignment = (await prisma.contractorClientAssignment.findUnique({
        where: { contractorId_clientId: { contractorId: contractor.id, clientId } },
        select: { client: { select: { name: true } } },
      })) as unknown as { client: { name: string } } | null;
      if (!assignment) {
        return NextResponse.json(
          { success: false, error: "Client not available for this contractor" },
          { status: 400 }
        );
      }
      clientName = assignment.client.name;
    }

    // A correction must target the contractor's own, not-yet-corrected entry
    let corrects: { id: string } | null = null;
    if (d.correctsId) {
      const original = await prisma.contractorHoursEntry.findFirst({
        where: {
          id: d.correctsId,
          contractorId: contractor.id,
          correctedBy: { is: null },
        },
        select: { id: true },
      });
      if (!original) {
        return NextResponse.json(
          { success: false, error: "Entry cannot be corrected" },
          { status: 400 }
        );
      }
      corrects = original;
    }

    // Reject overlaps with existing uncorrected entries (a correction may
    // overlap the entry it replaces)
    const overlap = await prisma.contractorHoursEntry.findFirst({
      where: {
        contractorId: contractor.id,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        correctedBy: { is: null },
        ...(corrects ? { id: { not: corrects.id } } : {}),
      },
      select: { id: true, workDate: true, startLocal: true, endLocal: true },
    });
    if (overlap) {
      return NextResponse.json(
        {
          success: false,
          error: `Overlaps an existing entry on ${overlap.workDate} (${overlap.startLocal} to ${overlap.endLocal})`,
        },
        { status: 409 }
      );
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const attestedAt = new Date();

    const entry = await prisma.contractorHoursEntry.create({
      data: {
        contractorId: contractor.id,
        clientId,
        clientName,
        startAt,
        endAt,
        durationMinutes,
        workDate: d.workDate,
        startLocal: d.startLocal,
        endLocal: d.endLocal,
        timezone: d.timezone,
        utcOffsetMinutes: d.utcOffsetMinutes,
        description: d.description,
        attestationText: ATTESTATION_TEXT,
        attestedAt,
        correctsId: corrects?.id ?? null,
        submitIp: ipAddress,
        submitUserAgent: userAgent,
        audits: {
          create: {
            event: "logged",
            actor: "contractor",
            ipAddress,
            userAgent,
            metadata: JSON.stringify({
              workDate: d.workDate,
              startLocal: d.startLocal,
              endLocal: d.endLocal,
              timezone: d.timezone,
              utcOffsetMinutes: d.utcOffsetMinutes,
              durationMinutes,
              clientId,
              clientName,
              attestationText: ATTESTATION_TEXT,
              attestedAt: attestedAt.toISOString(),
              ...(corrects ? { corrects: corrects.id } : {}),
            }),
          },
        },
      },
      select: entrySelect,
    });

    // The original entry gets a corrected_by event appended; its data is untouched.
    if (corrects) {
      await prisma.contractorHoursAudit.create({
        data: {
          entryId: corrects.id,
          event: "corrected_by",
          actor: "contractor",
          ipAddress,
          userAgent,
          metadata: JSON.stringify({ correctionId: entry.id }),
        },
      });
    }

    const where = clientName ? ` for ${clientName}` : "";
    await prisma.activityLog.create({
      data: {
        actor: "contractor",
        action: corrects ? "contractor_hours_corrected" : "contractor_hours_logged",
        details: `${contractor.name} logged ${fmtDuration(durationMinutes)}${where} on ${d.workDate} (${d.startLocal} to ${d.endLocal} ${d.timezone})${corrects ? ` — correction of ${corrects.id}` : ""}`,
        ipAddress,
        userAgent,
      },
    });

    notifySlack(
      `:hourglass_flowing_sand: *${contractor.name}* logged *${fmtDuration(durationMinutes)}*${
        clientName ? ` for *${clientName}*` : ""
      } — ${d.workDate}, ${d.startLocal}–${d.endLocal} (${d.timezone})${
        corrects ? " _(correction)_" : ""
      }\n> ${d.description.slice(0, 300)}\n<${APP_URL}/contractors?hours=${entry.id}|Review entry>`
    ).catch(() => {});

    return NextResponse.json({ success: true, data: entry });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to log hours" }, { status: 500 });
  }
}
