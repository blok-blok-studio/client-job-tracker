import { NextRequest, NextResponse } from "next/server";
import { processWebhookEvent } from "@/lib/openclaw/handlers";
import crypto from "crypto";

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const signature = request.headers.get("x-openclaw-signature");

  // Verify webhook signature
  if (process.env.OPENCLAW_WEBHOOK_SECRET && !verifySignature(bodyText, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(bodyText);
    const result = await processWebhookEvent(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
