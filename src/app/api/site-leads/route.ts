import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

/**
 * Ingest endpoint for the client sites we build. A site POSTs a form or quiz
 * submission here with the shared token and it lands in SiteLead, so leads
 * live in the command center rather than only in an inbox.
 *
 * Auth is a single shared secret, not a session: the caller is a website, not
 * a person. Set SITE_LEADS_TOKEN in this project and in each site.
 */
const schema = z.object({
  source: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  answers: z.array(z.string().max(300)).max(20).optional(),
  matched: z.array(z.string().max(120)).max(10).optional(),
  clientId: z.string().max(40).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const token = process.env.SITE_LEADS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }
  if (request.headers.get("x-site-leads-token") !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const { source, name, email, answers = [], matched = [], clientId } = parsed.data;

  const lead = await prisma.siteLead.create({
    data: { source, name, email: email.toLowerCase(), answers, matched, clientId: clientId || null },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: lead.id }, { status: 201 });
}
