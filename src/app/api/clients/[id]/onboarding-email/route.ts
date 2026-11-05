import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/app/api/studio-invoices/_shared";
import { sendOnboardingLinkEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

// POST: email the client their onboarding form (reusing an open link, or
// opening a fresh one). Used from the contract screen when details are missing.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, session } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, email: true, onboardToken: true } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  if (!client.email) return NextResponse.json({ success: false, error: "Add the client's email first" }, { status: 400 });

  let token = client.onboardToken;
  if (!token) {
    token = randomBytes(16).toString("base64url");
    await prisma.client.update({ where: { id }, data: { onboardToken: token } });
  }
  const onboardUrl = `${APP_URL}/o/${token}`;
  try {
    const sent = await sendOnboardingLinkEmail({ to: client.email, clientName: client.name, onboardUrl });
    if (!sent) return NextResponse.json({ success: false, error: "Email is not set up (RESEND_API_KEY missing)", data: { onboardUrl } }, { status: 503 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Email failed: ${err instanceof Error ? err.message : "unknown error"}`, data: { onboardUrl } },
      { status: 502 }
    );
  }
  await prisma.activityLog.create({
    data: { clientId: id, actor: session?.name || "owner", action: "pipeline_onboard_sent", details: `Onboarding form sent to ${client.name} (${client.email}) for contract details` },
  });
  return NextResponse.json({ success: true, data: { onboardUrl, sentTo: client.email } });
}
