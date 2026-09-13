/**
 * Smoke test for the shared publish runner (src/lib/social/publish-runner.ts).
 * Every runner call is scoped to this test's own post ids (onlyIds), so real
 * clients' due posts are never touched even against the production database.
 *
 *   npx tsx scripts/test-publish-runner.ts
 *
 * Uses throwaway posts on a platform the test client has no connection for
 * (TIKTOK), so nothing can actually be published. Every row it creates is
 * deleted at the end.
 *
 * Checks:
 *  1. Two overlapping runs claim a due post exactly once (no double publish).
 *  2. A post stuck in PUBLISHING past the window is failed, not re-sent.
 *  3. A post edited back to DRAFT is never claimed.
 *  4. A post awaiting client approval is never claimed.
 *  5. A due manual (ASSISTED) post moves to ACTION_NEEDED and notifies someone.
 */

import prisma from "../src/lib/prisma";
import { publishDuePosts, recoverStuckPosts } from "../src/lib/social/publish-runner";

const TAG = `runner-test-${Date.now()}`;
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const client = await prisma.client.findFirst({
    where: { credentials: { none: { platform: { contains: "tiktok", mode: "insensitive" } } } },
    select: { id: true, name: true },
  });
  if (!client) throw new Error("No client without a TikTok connection to test against");

  const past = new Date(Date.now() - 60_000);
  const testStart = new Date();
  const ids: string[] = [];

  try {
    // 1. Overlapping runs
    const due = await prisma.contentPost.create({
      data: { clientId: client.id, platform: "TIKTOK", status: "SCHEDULED", title: TAG, scheduledAt: past },
    });
    ids.push(due.id);

    const [a, b] = await Promise.all([
      publishDuePosts({ actor: "test", onlyIds: ids }),
      publishDuePosts({ actor: "test", onlyIds: ids }),
    ]);
    const touched = [...a.results, ...b.results].filter((r) => r.id === due.id);
    const after = await prisma.contentPost.findUnique({ where: { id: due.id } });
    check("overlapping runs handle the post exactly once", touched.length === 1, `handled ${touched.length}x`);
    check("claim increments publishAttempts once", after?.publishAttempts === 1, `attempts=${after?.publishAttempts}`);
    check("missing connection ends FAILED with a reason", after?.status === "FAILED" && !!after.publishError, after?.publishError || "");

    // 2. Stuck post
    const stuck = await prisma.contentPost.create({
      data: {
        clientId: client.id,
        platform: "TIKTOK",
        status: "PUBLISHING",
        title: TAG,
        scheduledAt: past,
        publishStartedAt: new Date(Date.now() - 20 * 60_000),
      },
    });
    ids.push(stuck.id);
    const recovered = await recoverStuckPosts("test", ids);
    const stuckAfter = await prisma.contentPost.findUnique({ where: { id: stuck.id } });
    check("stuck post is recovered", recovered >= 1, `recovered=${recovered}`);
    check("stuck post is FAILED, not re-queued", stuckAfter?.status === "FAILED" && stuckAfter.publishAttempts === 0);

    // 3. Draft is left alone
    const draft = await prisma.contentPost.create({
      data: { clientId: client.id, platform: "TIKTOK", status: "DRAFT", title: TAG, scheduledAt: past },
    });
    ids.push(draft.id);
    const run = await publishDuePosts({ actor: "test", onlyIds: ids });
    const draftAfter = await prisma.contentPost.findUnique({ where: { id: draft.id } });
    check("draft is never claimed", draftAfter?.status === "DRAFT" && !run.results.some((r) => r.id === draft.id));

    // 4. Awaiting approval
    const pending = await prisma.contentPost.create({
      data: {
        clientId: client.id,
        platform: "TIKTOK",
        status: "SCHEDULED",
        title: TAG,
        scheduledAt: past,
        approvalStatus: "PENDING",
      },
    });
    ids.push(pending.id);
    await publishDuePosts({ actor: "test", onlyIds: ids });
    const pendingAfter = await prisma.contentPost.findUnique({ where: { id: pending.id } });
    check("post awaiting approval is not published", pendingAfter?.status === "SCHEDULED" && pendingAfter.publishAttempts === 0);

    // 5. Manual handoff
    const manual = await prisma.contentPost.create({
      data: {
        clientId: client.id,
        platform: "REDNOTE",
        status: "SCHEDULED",
        publishMode: "ASSISTED",
        title: TAG,
        scheduledAt: past,
      },
    });
    ids.push(manual.id);
    const handoffRun = await publishDuePosts({ actor: "test", onlyIds: ids });
    const manualAfter = await prisma.contentPost.findUnique({ where: { id: manual.id } });
    const notes = await prisma.notification.count({
      where: { link: `/content/handoff/${manual.id}`, createdAt: { gte: testStart } },
    });
    check("manual post moves to ACTION_NEEDED", manualAfter?.status === "ACTION_NEEDED", manualAfter?.status);
    check("manual post hand-off notifies someone", notes > 0, `notifications=${notes}`);
    check("run reports the hand-off", handoffRun.handedOff >= 1);
  } finally {
    await prisma.notification.deleteMany({
      where: { createdAt: { gte: testStart }, OR: ids.map((id) => ({ link: { contains: id } })) },
    });
    await prisma.contentPost.deleteMany({ where: { id: { in: ids } } });
    await prisma.activityLog.deleteMany({
      where: { clientId: client.id, actor: "test", createdAt: { gte: testStart } },
    });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
