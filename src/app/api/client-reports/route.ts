import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { generateClientReport } from "@/lib/report-ai";

export const maxDuration = 300;

// GET — list reports (optionally by client)
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const reports = await prisma.clientReport.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: { select: { id: true, name: true, company: true, email: true } } },
    orderBy: [{ month: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });
  return NextResponse.json({ success: true, data: reports });
}

// POST — generate (or regenerate) a monthly report from uploaded analytics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, month, rawData, notes } = z
      .object({
        clientId: z.string().min(1),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        rawData: z.string().min(20).max(200000),
        notes: z.string().max(5000).optional(),
      })
      .parse(body);

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, company: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const { report, error } = await generateClientReport({
      clientName: client.name,
      company: client.company,
      month,
      rawData,
      notes,
    });

    if (!report) {
      return NextResponse.json({ success: false, error: error || "Generation failed" }, { status: 500 });
    }

    const saved = await prisma.clientReport.upsert({
      where: { clientId_month: { clientId, month } },
      update: { rawData, notes: notes || null, report: report as object, status: "DRAFT", sentAt: null, sentTo: null },
      create: { clientId, month, rawData, notes: notes || null, report: report as object },
      include: { client: { select: { id: true, name: true, company: true, email: true } } },
    });

    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate report";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
