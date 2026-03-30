import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent/engine";
import { processRecurringTasks } from "@/lib/recurring-tasks";
import prisma from "@/lib/prisma";
import { sendPaymentReminderEmail } from "@/lib/email";
import crypto from "crypto";
import { refreshExpiringCredentials } from "@/lib/oauth/refresh";

function verifyBearerToken(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;

  const token = authHeader.replace("Bearer ", "");

  // Hash both values to constant length before comparison — avoids leaking
  // token length via timing differences on the early length check
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();

  return crypto.timingSafeEqual(tokenHash, secretHash);
}

export async function GET(request: NextRequest) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Process recurring tasks first
    const recurringCreated = await processRecurringTasks().catch((err) => {
      console.error("[Cron] Recurring tasks error:", err);
      return 0;
    });

    // Expire stale contracts
    const expiredContracts = await prisma.contractSignature.findMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      select: { id: true, clientId: true },
    }).catch((err) => {
      console.error("[Cron] Expired contracts query error:", err);
      return [];
    });

    if (expiredContracts.length > 0) {
      await prisma.contractSignature.updateMany({
        where: { id: { in: expiredContracts.map((c) => c.id) } },
        data: { status: "EXPIRED" },
      });

      await prisma.activityLog.createMany({
        data: expiredContracts.map((c) => ({
          clientId: c.clientId,
          actor: "system",
          action: "contract_expired",
          details: "Contract expired (30-day signing window elapsed)",
        })),
      });

      console.log(`[Cron] Expired ${expiredContracts.length} contract(s)`);
    }

    // Send payment reminders for pending links older than 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    let remindersSent = 0;

    let pendingLinks: {
      id: string;
      clientId: string;
      amount: number;
      currency: string;
      description: string;
      stripeUrl: string;
      createdAt: Date;
      client: { email: string | null; name: string };
    }[] = [];
    try {
      pendingLinks = await prisma.paymentLink.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: threeDaysAgo },
        },
        include: {
          client: { select: { email: true, name: true } },
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
    } catch (err) {
      console.error("[Cron] Pending payment links query error:", err);
    }

    for (const link of pendingLinks) {
      // Skip if a reminder was already sent for this payment link
      const existingReminder = await prisma.activityLog.findFirst({
        where: {
          clientId: link.clientId,
          action: "payment_reminder_sent",
          details: { contains: link.id },
        },
      });

      if (existingReminder) continue;
      if (!link.client.email) continue;

      const amtStr = (link.amount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: link.currency.toUpperCase(),
      });

      const daysPending = Math.floor(
        (Date.now() - link.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      await sendPaymentReminderEmail({
        to: link.client.email,
        clientName: link.client.name,
        amount: amtStr,
        description: link.description,
        paymentUrl: link.stripeUrl,
        daysPending,
      }).catch((err) => console.error("[Email] Payment reminder error:", err));

      await prisma.activityLog.create({
        data: {
          clientId: link.clientId,
          actor: "system",
          action: "payment_reminder_sent",
          details: `Payment reminder sent for ${link.description} (${link.id})`,
        },
      });

      remindersSent++;
    }

    if (remindersSent > 0) {
      console.log(`[Cron] Sent ${remindersSent} payment reminder(s)`);
    }

    // Refresh expiring OAuth tokens
    let tokensRefreshed = 0;
    let tokenRefreshFailed = 0;
    try {
      const refreshResult = await refreshExpiringCredentials();
      tokensRefreshed = refreshResult.refreshed;
      tokenRefreshFailed = refreshResult.failed;
      if (tokensRefreshed + tokenRefreshFailed > 0) {
        console.log(`[Cron] OAuth tokens: ${tokensRefreshed} refreshed, ${tokenRefreshFailed} failed`);
      }
    } catch (err) {
      console.error("[Cron] OAuth token refresh error:", err);
    }

    // Publish due content posts (fallback if OpenClaw is offline)
    let contentPublished = 0;
    let contentFailed = 0;
    try {
      const duePosts = await prisma.contentPost.findMany({
        where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
        select: { id: true },
      });
      if (duePosts.length > 0) {
        const pubRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app"}/api/content-posts/publish-due`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
            "Content-Type": "application/json",
          },
        });
        const pubData = await pubRes.json().catch(() => ({}));
        contentPublished = pubData.published || 0;
        contentFailed = pubData.failed || 0;
        if (contentPublished + contentFailed > 0) {
          console.log(`[Cron] Content posts: ${contentPublished} published, ${contentFailed} failed`);
        }
      }
    } catch (err) {
      console.error("[Cron] Content publish error:", err);
    }

    // Then run agent cycle
    const result = await runAgentCycle();
    return NextResponse.json({
      success: true,
      data: { ...result, recurringTasksCreated: recurringCreated, contractsExpired: expiredContracts.length, remindersSent, tokensRefreshed, tokenRefreshFailed, contentPublished, contentFailed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron job failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
