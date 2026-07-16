import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendClientReportEmail } from "@/lib/email";
import type { GeneratedReport } from "@/lib/report-ai";

// POST — email the report to the client (owner only)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Only owners can send reports" }, { status: 403 });

  const { id } = await params;
  const record = await prisma.clientReport.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true, email: true } } },
  });

  if (!record || !record.report) {
    return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
  }
  if (!record.client.email) {
    return NextResponse.json(
      { success: false, error: "This client has no email on file — add one on their profile first" },
      { status: 400 }
    );
  }

  const report = record.report as unknown as GeneratedReport;
  const monthLabel = new Date(`${record.month}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  try {
    await sendClientReportEmail({
      to: record.client.email,
      clientName: record.client.name,
      monthLabel,
      metrics: report.metrics || [],
      highlights: report.highlights || [],
      summary: report.summary || [],
      trajectory: report.trajectory || [],
      recommendations: report.recommendations || [],
      preparedBy: record.preparedBy,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Email failed" },
      { status: 500 }
    );
  }

  const updated = await prisma.clientReport.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), sentTo: record.client.email },
  });

  await prisma.activityLog.create({
    data: {
      clientId: record.client.id,
      actor: session.name,
      action: "report_sent",
      details: `Sent ${monthLabel} performance report to ${record.client.email}`,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, data: updated });
}
