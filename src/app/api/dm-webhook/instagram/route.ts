/**
 * Instagram/Facebook Messaging Webhook
 * Receives DM events from Meta and routes them to automation flows.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { startExecution, resumeExecution } from "@/lib/automation/executor";

/** GET: Webhook verification (Meta sends this to verify your endpoint) */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const verifyToken = process.env.DM_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/** POST: Receive messaging events */
export async function POST(request: NextRequest) {
  const body = await request.text();

  // Verify webhook signature
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.META_APP_SECRET;

  if (appSecret && signature) {
    const expectedSig = "sha256=" + crypto.createHmac("sha256", appSecret).update(body).digest("hex");
    if (signature !== expectedSig) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  const payload = JSON.parse(body);

  // Process each entry (can contain multiple events)
  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      try {
        await handleMessagingEvent(event, entry.id);
      } catch (err) {
        console.error("[DM Webhook] Error processing event:", (err as Error).message);
      }
    }
  }

  // Always return 200 quickly to acknowledge receipt
  return NextResponse.json({ status: "ok" });
}

interface MessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: { type: string; payload: { url: string } }[];
    quick_reply?: { payload: string };
  };
  postback?: {
    title: string;
    payload: string;
  };
}

async function handleMessagingEvent(event: MessagingEvent, pageId: string): Promise<void> {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id;

  // Ignore messages sent by the page itself
  if (senderId === recipientId || senderId === pageId) return;

  const messageText = event.message?.text || event.postback?.title || "";
  const quickReplyPayload = event.message?.quick_reply?.payload || event.postback?.payload;

  // Check for active paused executions for this contact (resume conversation)
  const pausedExecution = await prisma.automationExecution.findFirst({
    where: {
      contactId: senderId,
      status: "PAUSED",
    },
    orderBy: { startedAt: "desc" },
  });

  if (pausedExecution) {
    await resumeExecution(pausedExecution.id, messageText, quickReplyPayload);
    return;
  }

  // Find matching active flows for this page/platform
  // First, find which client owns this page
  const credential = await prisma.credential.findFirst({
    where: {
      OR: [
        { platform: { contains: "instagram", mode: "insensitive" } },
        { platform: { contains: "facebook", mode: "insensitive" } },
      ],
    },
    select: { clientId: true, platform: true },
  });

  if (!credential) return;

  // Find active flows for this client that match the trigger
  const flows = await prisma.automationFlow.findMany({
    where: {
      clientId: credential.clientId,
      active: true,
    },
  });

  for (const flow of flows) {
    const triggerConfig = flow.triggerConfig as { keywords?: string[]; matchType?: string } | null;

    if (flow.trigger === "KEYWORD" && triggerConfig?.keywords?.length) {
      const matchType = triggerConfig.matchType || "contains";
      const lowerMsg = messageText.toLowerCase();
      const matched = triggerConfig.keywords.some((kw: string) => {
        const lowerKw = kw.toLowerCase();
        switch (matchType) {
          case "exact": return lowerMsg === lowerKw;
          case "starts_with": return lowerMsg.startsWith(lowerKw);
          default: return lowerMsg.includes(lowerKw);
        }
      });

      if (matched) {
        await startExecution(flow.id, senderId, senderId, messageText, quickReplyPayload);
        return; // Only trigger first matching flow
      }
    } else if (flow.trigger === "NEW_FOLLOWER" || flow.trigger === "MANUAL") {
      // These triggers are handled differently (not via DM webhook)
      continue;
    } else {
      // Default: trigger on any message if no keyword config
      await startExecution(flow.id, senderId, senderId, messageText, quickReplyPayload);
      return;
    }
  }
}
