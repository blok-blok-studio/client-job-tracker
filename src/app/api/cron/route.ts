import { NextRequest, NextResponse } from "next/server";
import { processRecurringTasks } from "@/lib/recurring-tasks";
import prisma from "@/lib/prisma";
import { sendPaymentReminderEmail } from "@/lib/email";
import crypto from "crypto";
import { refreshExpiringCredentials } from "@/lib/oauth/refresh";
import { publishPost, sanitizePublishError } from "@/lib/social/publisher";
import { humanDelay } from "@/lib/social/http";
import { backfillMissingThumbnails, backfillMissingPlayback } from "@/lib/server-video-thumbnail";

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

    // Nudge about tasks stuck in Blocked for 3+ days (once per blocked stint)
    const staleBlockedCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    let staleBlocked: Array<{ id: string; title: string; clientId: string | null; blockedAt: Date | null; blockedReason: string | null; client: { name: string } | null }> = [];
    try {
      staleBlocked = (await prisma.task.findMany({
        where: { status: "BLOCKED", blockedAt: { lte: staleBlockedCutoff }, blockedAlertAt: null },
        select: { id: true, title: true, clientId: true, blockedAt: true, blockedReason: true, client: { select: { name: true } } },
      })) as unknown as typeof staleBlocked;
    } catch (err) {
      console.error("[Cron] Stale blocked query error:", err);
    }
    for (const t of staleBlocked) {
      const days = Math.floor((Date.now() - t.blockedAt!.getTime()) / (24 * 60 * 60 * 1000));
      const clientLabel = t.client?.name ? ` (*${t.client.name}*)` : "";
      const reason = t.blockedReason ? `\n> Blocked on: ${t.blockedReason}` : "";
      const { notifySlack } = await import("@/lib/slack");
      await notifySlack(
        `:no_entry: *${t.title}*${clientLabel} has been stuck in *Blocked* for ${days} days — time to chase it up.${reason}`
      ).catch(() => {});
      await prisma.task.update({ where: { id: t.id }, data: { blockedAlertAt: new Date() } }).catch(() => {});
      await prisma.activityLog.create({
        data: {
          clientId: t.clientId,
          taskId: t.id,
          actor: "system",
          action: "blocked_stale_alert",
          details: `Task stuck in Blocked for ${days} days${t.blockedReason ? ` (blocked on: ${t.blockedReason})` : ""}`,
        },
      }).catch(() => {});
    }

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

    // Publish any scheduled posts that are due
    let postsPublished = 0;
    let postsFailed = 0;
    try {
      const duePosts = await prisma.contentPost.findMany({
        where: {
          status: "SCHEDULED",
          scheduledAt: { lte: new Date() },
          NOT: {
            platform: { in: ["TWITTER", "THREADS"] },
            client: { name: { contains: "Chase Haynes" } },
          },
        },
        orderBy: { scheduledAt: "asc" },
      });

      for (const post of duePosts) {
        await prisma.contentPost.update({ where: { id: post.id }, data: { status: "PUBLISHING" } });

        const credentials = post.credentialId
          ? await prisma.credential.findMany({ where: { id: post.credentialId } })
          : await prisma.credential.findMany({ where: { clientId: post.clientId } });

        let published = false;
        let lastError = "";

        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            if (attempt > 0) await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 2000 + Math.random() * 2000));
            const result = await publishPost(post, credentials);
            await prisma.contentPost.update({
              where: { id: post.id },
              data: { status: "PUBLISHED", publishedAt: new Date(), externalId: result.externalId || null, externalUrl: result.externalUrl || null, publishError: null },
            });
            await prisma.activityLog.create({
              data: { clientId: post.clientId, actor: "cron", action: "content_published", details: `Published ${post.platform} post: ${post.title || "(untitled)"}` },
            });
            postsPublished++;
            published = true;
            break;
          } catch (err) {
            lastError = sanitizePublishError(err instanceof Error ? err.message : "Unknown error");
            if (lastError.includes("credentials") || lastError.includes("Unauthorized") || lastError.includes("401")) break;
          }
        }

        if (!published) {
          await prisma.contentPost.update({ where: { id: post.id }, data: { status: "FAILED", publishError: lastError } });
          await prisma.activityLog.create({
            data: { clientId: post.clientId, actor: "cron", action: "content_publish_failed", details: `Failed: ${post.platform} post: ${lastError}` },
          });
          postsFailed++;
        }

        if (duePosts.indexOf(post) < duePosts.length - 1) await humanDelay(2000, 5000);
      }

      if (postsPublished + postsFailed > 0) {
        console.log(`[Cron] Posts: ${postsPublished} published, ${postsFailed} failed`);
      }
    } catch (err) {
      console.error("[Cron] Post publishing error:", err);
    }

    // Backfill thumbnails for any videos still missing one (best-effort)
    let thumbnailsGenerated = 0;
    try {
      const thumbResult = await backfillMissingThumbnails(10);
      thumbnailsGenerated = thumbResult.generated;
      if (thumbResult.total > 0) {
        console.log(`[Cron] Thumbnails: ${thumbResult.generated}/${thumbResult.total} generated`);
      }
    } catch (err) {
      console.error("[Cron] Thumbnail backfill error:", err);
    }

    // Backfill web-safe playback transcodes (slower; only 2 per run)
    let playbacksGenerated = 0;
    try {
      const playbackResult = await backfillMissingPlayback(2);
      playbacksGenerated = playbackResult.generated;
      if (playbackResult.total > 0) {
        console.log(`[Cron] Playback transcodes: ${playbackResult.generated}/${playbackResult.total} generated`);
      }
    } catch (err) {
      console.error("[Cron] Playback backfill error:", err);
    }

    // Morning Slack digest — cron fires at UTC 0/6/12/18; only the 6:00 UTC
    // run (8am Berlin in summer) sends, so the channel gets one digest a day.
    let digestSent = false;
    if (new Date().getUTCHours() === 6) {
      try {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const dueTasks = (await prisma.task.findMany({
          where: { status: { notIn: ["DONE"] }, dueDate: { lt: endOfToday } },
          select: {
            title: true,
            dueDate: true,
            assignedTo: true,
            client: { select: { name: true } },
          },
          orderBy: { dueDate: "asc" },
          take: 25,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any as Array<{
          title: string;
          dueDate: Date | null;
          assignedTo: string | null;
          client: { name: string } | null;
        }>;

        {
          const users = await prisma.user.findMany({
            where: { isActive: true },
            select: { name: true, slackUserId: true },
          });
          const mention = (assignee: string | null) => {
            if (!assignee) return "";
            const u = users.find((x) => x.name.toLowerCase() === assignee.toLowerCase());
            return u?.slackUserId ? ` — <@${u.slackUserId}>` : ` — ${assignee}`;
          };
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const overdueLines = dueTasks
            .filter((t) => t.dueDate && t.dueDate < startOfToday)
            .map((t) => `• *${t.title}*${t.client ? ` (${t.client.name})` : ""}${mention(t.assignedTo)}`);
          const todayLines = dueTasks
            .filter((t) => t.dueDate && t.dueDate >= startOfToday)
            .map((t) => `• *${t.title}*${t.client ? ` (${t.client.name})` : ""}${mention(t.assignedTo)}`);

          // Invoices unpaid for 15+ days — chase the cash
          const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
          const staleInvoices = (await prisma.invoice.findMany({
            where: { status: { in: ["SENT", "OVERDUE"] }, createdAt: { lt: fifteenDaysAgo } },
            select: { amount: true, currency: true, createdAt: true, client: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
            take: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any as Array<{ amount: unknown; currency: string; createdAt: Date; client: { name: string } | null }>;
          const invoiceLines = staleInvoices.map((inv) => {
            const days = Math.floor((now.getTime() - inv.createdAt.getTime()) / (24 * 60 * 60 * 1000));
            const amt = Number(inv.amount).toLocaleString("en-US", { style: "currency", currency: inv.currency || "USD" });
            return `• *${amt}* — ${inv.client?.name || "Unknown"} · unpaid ${days} days`;
          });

          const { notifySlack } = await import("@/lib/slack");
          const parts = [":sunrise: *Morning digest*"];
          if (overdueLines.length) parts.push(`*Overdue (${overdueLines.length})*\n${overdueLines.join("\n")}`);
          if (todayLines.length) parts.push(`*Due today (${todayLines.length})*\n${todayLines.join("\n")}`);
          if (invoiceLines.length) parts.push(`:money_with_wings: *Invoices 15+ days unpaid (${invoiceLines.length})*\n${invoiceLines.join("\n")}`);
          // Only speak when there's something to say
          if (parts.length > 1) {
            await notifySlack(parts.join("\n\n"));
            digestSent = true;
          }
        }
      } catch (err) {
        console.error("[Cron] Digest error:", err);
      }
    }

    return NextResponse.json({
      success: true,
      data: { recurringTasksCreated: recurringCreated, staleBlockedAlerts: staleBlocked.length, contractsExpired: expiredContracts.length, remindersSent, tokensRefreshed, tokenRefreshFailed, postsPublished, postsFailed, thumbnailsGenerated, playbacksGenerated, digestSent },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron job failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
