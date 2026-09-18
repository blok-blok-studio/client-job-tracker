/**
 * The one place scheduled posts get published.
 *
 * Every trigger (the per-minute cron, the 6-hourly cron, the legacy
 * publish-due / auto-publish endpoints) calls publishDuePosts. Runs can overlap
 * safely:
 *  - a post is started only by the runner that wins the atomic
 *    SCHEDULED → PUBLISHING claim;
 *  - a multi-step publish (chunked upload, platform processing) is advanced
 *    only by the runner holding its short pollLockedUntil lease.
 * Nothing is ever re-sent blindly: a step that dies mid-flight fails the post
 * with a "check the account first" message.
 */

import { Prisma, type ContentPost } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAdapter, resolveCredentialForPost, runPublishStep, sanitizePublishError } from "@/lib/social/publisher";
import { PublishValidationError, type PublishStep } from "@/lib/social/types";
import { notifyUser, type NotificationType } from "@/lib/notifications";

/** A single-shot send still PUBLISHING after this long was cut off (timeout, crash). */
const STUCK_AFTER_MS = 15 * 60 * 1000;
/** A multi-step publish that hasn't finished after this long is given up on. */
const MULTI_STEP_TIMEOUT_MS = 6 * 60 * 60 * 1000;
/** Lease taken while advancing a multi-step publish; longer than any one function run. */
const STEP_LEASE_MS = 6 * 60 * 1000;
/** Longest one adapter call may work before handing back a "continue". */
const STEP_BUDGET_MS = 150_000;
/** The furthest ahead any adapter may start early (YouTube native scheduling). */
const MAX_LEAD_MS = 6 * 60 * 60 * 1000;

/** Chase posts to his own X/Threads by hand; never auto-publish those. */
const MANUAL_ONLY_FILTER = {
  NOT: {
    platform: { in: ["TWITTER", "THREADS"] as ("TWITTER" | "THREADS")[] },
    client: { name: { contains: "Chase Haynes" } },
  },
};

/** Posts sent to the client for sign-off only publish once approved. */
const APPROVAL_CLEAR_FILTER = {
  OR: [{ approvalStatus: null }, { approvalStatus: "APPROVED" }],
};

type PostWithClient = ContentPost & { client: { name: string } };

export interface RunResult {
  published: number;
  failed: number;
  interrupted: number;
  inProgress: number;
  handedOff: number;
  results: { id: string; platform: string; status: "PUBLISHED" | "FAILED" | "PUBLISHING" | "ACTION_NEEDED"; error?: string }[];
}

const INTERRUPTED_ERROR = (platform: string) =>
  `Publishing was interrupted before ${platform} confirmed it. Check the account to see whether it went out before you retry, so it doesn't post twice.`;

/** In-app notification to the post's assignee, or every active owner if nobody is assigned. */
async function notifyPostPeople(
  post: Pick<ContentPost, "assignedToId" | "clientId">,
  input: { type: NotificationType; title: string; body?: string; link: string }
): Promise<void> {
  const recipients = post.assignedToId
    ? [post.assignedToId]
    : (await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } })).map((u) => u.id);
  for (const userId of recipients) {
    await notifyUser({ userId, clientId: post.clientId, ...input }).catch(() => {});
  }
}

async function logActivity(clientId: string, actor: string, action: string, details: string) {
  await prisma.activityLog.create({ data: { clientId, actor, action, details } }).catch(() => {});
}

async function failPost(post: PostWithClient, actor: string, error: string, onlyIfStatus: "PUBLISHING" = "PUBLISHING") {
  const { count } = await prisma.contentPost.updateMany({
    where: { id: post.id, status: onlyIfStatus },
    data: { status: "FAILED", publishError: error, publishPhase: null, pollLockedUntil: null },
  });
  if (count !== 1) return false;
  await logActivity(post.clientId, actor, "content_publish_failed", `Failed to publish ${post.platform} post "${post.title || "(untitled)"}": ${error}`);
  await notifyPostPeople(post, {
    type: "post_failed",
    title: `${post.platform} post didn't publish`,
    body: `${post.client.name}: ${error.slice(0, 240)}`,
    link: `/content?post=${post.id}`,
  });
  return true;
}

/** Persist the outcome of one adapter step. */
async function applyStep(post: PostWithClient, step: PublishStep, actor: string, run: RunResult) {
  if (step.kind === "done") {
    // Conditional on PUBLISHING so a cancel that landed mid-step isn't overwritten
    await prisma.contentPost.updateMany({
      where: { id: post.id, status: "PUBLISHING" },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        externalId: step.externalId || null,
        externalUrl: step.externalUrl || null,
        publishError: null,
        publishPhase: null,
        publishState: Prisma.DbNull,
        pollLockedUntil: null,
      },
    });
    await logActivity(post.clientId, actor, "content_published", `Published ${post.platform} post: ${post.title || "(untitled)"}`);
    run.published++;
    run.results.push({ id: post.id, platform: post.platform, status: "PUBLISHED" });
    return;
  }

  if (step.kind === "handoff") {
    // From here it's a manual post: ASSISTED so a snooze reminds the person
    // again instead of sending the platform a second copy
    const { count } = await prisma.contentPost.updateMany({
      where: { id: post.id, status: "PUBLISHING" },
      data: {
        status: "ACTION_NEEDED",
        publishMode: "ASSISTED",
        externalId: step.externalId || null,
        publishError: null,
        publishPhase: null,
        publishState: Prisma.DbNull,
        pollLockedUntil: null,
      },
    });
    if (count !== 1) return;
    await logActivity(post.clientId, actor, "content_action_needed", `${post.platform} post "${post.title || "(untitled)"}" was sent to the account as a draft and is waiting to be finished in the app`);
    await notifyPostPeople(post, {
      type: "post_action_needed",
      title: step.notice.title,
      body: `${post.client.name}${post.title ? `: ${post.title}` : ""}. ${step.notice.body}`,
      link: `/content/handoff/${post.id}`,
    });
    run.handedOff++;
    run.results.push({ id: post.id, platform: post.platform, status: "ACTION_NEEDED" });
    return;
  }

  await prisma.contentPost.updateMany({
    where: { id: post.id, status: "PUBLISHING" },
    data: {
      publishPhase: step.phase,
      publishState: step.state as object,
      pollLockedUntil: new Date(Date.now() + (step.retryAfterMs ?? 20_000)),
    },
  });
  run.inProgress++;
  run.results.push({ id: post.id, platform: post.platform, status: "PUBLISHING" });
}

async function stepFailed(post: PostWithClient, err: unknown, actor: string, run: RunResult) {
  let error =
    err instanceof PublishValidationError
      ? err.message
      : sanitizePublishError(err instanceof Error ? err.message : "Unknown publish error");
  // Past the first step the platform may already have the upload or the post
  const state = post.publishState as Record<string, unknown> | null;
  if (post.publishPhase && state && Object.keys(state).some((k) => !k.startsWith("__")) && !/post twice/i.test(error)) {
    error += " Part of this was already sent to the platform, so check the account before you retry, so it doesn't post twice.";
  }
  if (await failPost(post, actor, error)) {
    run.failed++;
    run.results.push({ id: post.id, platform: post.platform, status: "FAILED", error });
  }
}

/**
 * Single-shot sends stuck in PUBLISHING are failed, never retried: the upload
 * may already be live. Multi-step publishes are failed once they pass the
 * overall timeout.
 */
export async function recoverStuckPosts(actor: string, onlyIds?: string[]): Promise<number> {
  const now = Date.now();
  const stuck = (await prisma.contentPost.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      status: "PUBLISHING",
      OR: [
        { publishPhase: null, publishStartedAt: { lt: new Date(now - STUCK_AFTER_MS) } },
        // Claimed by the old code, which never stamped publishStartedAt
        { publishPhase: null, publishStartedAt: null, updatedAt: { lt: new Date(now - STUCK_AFTER_MS) } },
        { publishPhase: { not: null }, publishStartedAt: { lt: new Date(now - MULTI_STEP_TIMEOUT_MS) } },
      ],
    },
    include: { client: { select: { name: true } } },
  })) as PostWithClient[];

  let recovered = 0;
  for (const post of stuck) {
    const error = post.publishPhase
      ? `${post.platform} was still ${post.publishPhase} after 6 hours, so we stopped. Check the account before retrying, so it doesn't post twice.`
      : INTERRUPTED_ERROR(post.platform);
    if (await failPost(post, actor, error)) recovered++;
  }
  return recovered;
}

/** Marker written into publishState while a runner holds the step lease. */
const LEASE_MARKER = "__leasedAt";

function adapterState(state: unknown): Record<string, unknown> {
  const copy = { ...((state as Record<string, unknown>) || {}) };
  delete copy[LEASE_MARKER];
  return copy;
}

/** Advance multi-step publishes whose lease has expired. */
async function advanceInProgress(actor: string, startedAt: number, budgetMs: number, run: RunResult, onlyIds?: string[]) {
  const ready = await prisma.contentPost.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      status: "PUBLISHING",
      publishPhase: { not: null },
      pollLockedUntil: { lte: new Date() },
    },
    select: { id: true, pollLockedUntil: true },
    orderBy: { pollLockedUntil: "asc" },
    take: 25,
  });

  for (const candidate of ready) {
    if (Date.now() - startedAt > budgetMs) break;

    const post = (await prisma.contentPost.findUnique({
      where: { id: candidate.id },
      include: { client: { select: { name: true } } },
    })) as PostWithClient | null;
    if (!post || post.status !== "PUBLISHING") continue;

    const state = (post.publishState as Record<string, unknown>) || {};

    // A lease marker still present means the last runner died inside this
    // step without saving its result. Upload steps re-check the platform's
    // offset and are safe to repeat; anything else may have already created
    // or published something, so stop instead of risking a double post.
    if (state[LEASE_MARKER] && post.publishPhase !== "uploading") {
      await failPost(post, actor, INTERRUPTED_ERROR(post.platform));
      run.failed++;
      run.results.push({ id: post.id, platform: post.platform, status: "FAILED", error: INTERRUPTED_ERROR(post.platform) });
      continue;
    }

    // Take the lease only if nobody else advanced it since we looked
    const lease = await prisma.contentPost.updateMany({
      where: { id: candidate.id, status: "PUBLISHING", pollLockedUntil: candidate.pollLockedUntil },
      data: {
        pollLockedUntil: new Date(Date.now() + STEP_LEASE_MS),
        publishState: { ...state, [LEASE_MARKER]: new Date().toISOString() },
      },
    });
    if (lease.count !== 1) continue;

    try {
      const deadline = Math.min(Date.now() + STEP_BUDGET_MS, startedAt + budgetMs + 60_000);
      const step = await runPublishStep(post, adapterState(state), deadline);
      await applyStep(post, step, actor, run);
    } catch (err) {
      await stepFailed(post, err, actor, run);
    }
  }
}

/** ASSISTED posts that are due: hand off to a person instead of calling an API. */
async function handOffAssistedPosts(actor: string, run: RunResult, onlyIds?: string[]) {
  const due = (await prisma.contentPost.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      status: "SCHEDULED",
      publishMode: "ASSISTED",
      scheduledAt: { lte: new Date() },
      ...APPROVAL_CLEAR_FILTER,
    },
    include: { client: { select: { name: true } } },
    take: 50,
  })) as PostWithClient[];

  for (const post of due) {
    const { count } = await prisma.contentPost.updateMany({
      where: { id: post.id, status: "SCHEDULED", publishMode: "ASSISTED" },
      data: { status: "ACTION_NEEDED", publishStartedAt: new Date() },
    });
    if (count !== 1) continue;

    await logActivity(post.clientId, actor, "content_action_needed", `${post.platform} post "${post.title || "(untitled)"}" is ready to post by hand`);
    await notifyPostPeople(post, {
      type: "post_action_needed",
      title: `Time to post on ${post.platform === "REDNOTE" ? "RedNote" : post.platform}`,
      body: `${post.client.name}${post.title ? `: ${post.title}` : ""}. Open it on your phone to save the media and copy the caption.`,
      link: `/content/handoff/${post.id}`,
    });
    run.handedOff++;
    run.results.push({ id: post.id, platform: post.platform, status: "ACTION_NEEDED" });
  }
}

export async function publishDuePosts(opts: {
  actor: string;
  limit?: number;
  /** Stop starting new work after this long so the function finishes inside maxDuration. */
  budgetMs?: number;
  /** Restrict every phase to these post ids (tests) */
  onlyIds?: string[];
}): Promise<RunResult> {
  const { actor, limit = 25, budgetMs = 200_000, onlyIds } = opts;
  const startedAt = Date.now();
  const run: RunResult = { published: 0, failed: 0, interrupted: 0, inProgress: 0, handedOff: 0, results: [] };

  run.interrupted = await recoverStuckPosts(actor, onlyIds);
  await handOffAssistedPosts(actor, run, onlyIds);
  await advanceInProgress(actor, startedAt, budgetMs, run, onlyIds);

  // Look a little ahead so adapters with a lead time (YouTube) can start early;
  // everything else is filtered back to "due now" below.
  const horizon = new Date(Date.now() + MAX_LEAD_MS);
  const candidates = await prisma.contentPost.findMany({
    where: {
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
      status: "SCHEDULED",
      publishMode: "AUTO",
      scheduledAt: { lte: horizon },
      AND: [MANUAL_ONLY_FILTER, APPROVAL_CLEAR_FILTER],
    },
    orderBy: { scheduledAt: "asc" },
    take: limit * 2,
  });

  let started = 0;
  for (const candidate of candidates) {
    if (started >= limit || Date.now() - startedAt > budgetMs) break;

    const lead = Math.min(getAdapter(candidate.platform)?.leadTimeMs?.(candidate) ?? 0, MAX_LEAD_MS);
    const startAt = new Date(Date.now() + lead);
    if (!candidate.scheduledAt || candidate.scheduledAt > startAt) continue;

    // Atomic claim: only one runner can move this row out of SCHEDULED. If the
    // post was edited back to a draft or claimed by an overlapping run, skip it.
    const claim = await prisma.contentPost.updateMany({
      where: {
        id: candidate.id,
        status: "SCHEDULED",
        publishMode: "AUTO",
        scheduledAt: { lte: startAt },
        ...APPROVAL_CLEAR_FILTER,
      },
      data: {
        status: "PUBLISHING",
        publishStartedAt: new Date(),
        publishAttempts: { increment: 1 },
        publishPhase: null,
        publishState: Prisma.DbNull,
        pollLockedUntil: null,
      },
    });
    if (claim.count !== 1) continue;
    started++;

    const post = (await prisma.contentPost.findUnique({
      where: { id: candidate.id },
      include: { client: { select: { name: true } } },
    })) as PostWithClient | null;
    if (!post) continue;

    // No whole-post retry: a failure after the platform accepted the upload
    // would publish it twice. Transient 429/5xx retries happen per request.
    try {
      // Capped by the run budget too, so a late claim can't outlive the function
      const step = await runPublishStep(post, null, Math.min(Date.now() + STEP_BUDGET_MS, startedAt + budgetMs + 60_000));
      await applyStep(post, step, actor, run);
    } catch (err) {
      await stepFailed(post, err, actor, run);
    }
  }

  return run;
}

/**
 * Flag posts scheduled in the next 48 hours that have no usable connection, so
 * they can be fixed before they fail. One in-app warning per post.
 */
export async function warnPostsWithBrokenConnections(): Promise<number> {
  const soon = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const posts = (await prisma.contentPost.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: soon }, ...MANUAL_ONLY_FILTER },
    include: { client: { select: { name: true } } },
  })) as PostWithClient[];
  if (posts.length === 0) return 0;

  const { findCredential } = await import("@/lib/social/publisher");

  let warned = 0;
  for (const post of posts) {
    const marker = `post:${post.id}`;
    const already = await prisma.activityLog.findFirst({
      where: { action: "content_connection_warning", details: { contains: marker } },
      select: { id: true },
    });
    if (already) continue;

    const awaitingClient = post.approvalStatus === "PENDING" || post.approvalStatus === "CHANGES_REQUESTED";
    // Manual posts need no connection; only an approval hold can block them
    if (post.publishMode === "ASSISTED" && !awaitingClient) continue;

    const creds = await prisma.credential.findMany({
      where: post.credentialId ? { id: post.credentialId } : { clientId: post.clientId },
    });
    const cred = post.credentialId ? creds[0] : findCredential(creds, post.platform);

    let problem: string | null = null;
    if (post.approvalStatus === "PENDING") problem = "the client hasn't approved it yet, so it won't publish";
    else if (post.approvalStatus === "CHANGES_REQUESTED") problem = "the client asked for changes, so it won't publish";
    else if (!cred) problem = "there is no connected account for it";
    else if (cred.url && new Date(cred.url).getTime() < Date.now()) problem = "its connection has expired";
    else if (!cred.url) {
      // markNeedsReconnect clears the expiry stamp, so a dead connection looks
      // like "no expiry"; the reconnect log newer than its last rotation tells them apart
      const dead = await prisma.activityLog.findFirst({
        where: {
          clientId: post.clientId,
          action: "credential_needs_reconnect",
          createdAt: { gt: cred.lastRotated || new Date(0) },
          details: { contains: cred.platform },
        },
        select: { id: true },
      });
      if (dead) problem = "its connection is dead and needs a reconnect";
    }
    if (!problem) continue;

    await logActivity(post.clientId, "system", "content_connection_warning", `${post.platform} post "${post.title || "(untitled)"}" will fail: ${problem} (${marker})`);
    await notifyPostPeople(post, {
      type: "connection_problem",
      title: `${post.platform} post will fail`,
      body: `${post.client.name}: ${problem}. Reconnect on the client page before it's due.`,
      link: `/clients/${post.clientId}`,
    });
    warned++;
  }
  return warned;
}

/**
 * Pull back a post that's mid-publish so it can be edited or deleted
 * (YouTube uploaded ahead as private with a future publishAt). Only works when
 * the platform supports cancelling and no runner is working on the post right
 * now. On success the post is back to DRAFT with its publish state cleared.
 */
export async function cancelInFlightPost(
  postId: string,
  actor: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const post = await prisma.contentPost.findUnique({ where: { id: postId } });
  if (!post) return { ok: false, status: 404, error: "Not found" };
  if (post.status !== "PUBLISHING") return { ok: true };

  const adapter = getAdapter(post.platform);
  if (!adapter?.cancel) {
    return { ok: false, status: 409, error: "This post is being published right now. Wait for it to finish before editing." };
  }

  const state = (post.publishState as Record<string, unknown>) || {};
  // A runner is inside a step (its lease is live): don't race it
  if (state[LEASE_MARKER] && post.pollLockedUntil && post.pollLockedUntil > new Date()) {
    return { ok: false, status: 409, error: "This post is uploading right now. Try again in a couple of minutes." };
  }

  // Take the post away from the runner first: same compare-and-set it uses
  const lease = await prisma.contentPost.updateMany({
    where: { id: postId, status: "PUBLISHING", pollLockedUntil: post.pollLockedUntil },
    data: {
      pollLockedUntil: new Date(Date.now() + STEP_LEASE_MS),
      publishState: { ...state, [LEASE_MARKER]: new Date().toISOString() },
    },
  });
  if (lease.count !== 1) {
    return { ok: false, status: 409, error: "This post is uploading right now. Try again in a couple of minutes." };
  }

  try {
    const credential = await resolveCredentialForPost(post);
    const result = await adapter.cancel({ post, credential, state: adapterState(state) });
    if (!result.cancelled) {
      // Hand it back to the runner untouched
      await prisma.contentPost.updateMany({
        where: { id: postId, status: "PUBLISHING" },
        data: { pollLockedUntil: new Date(), publishState: adapterState(state) as object },
      });
      return { ok: false, status: 409, error: result.message || "This post can't be pulled back anymore." };
    }

    await prisma.contentPost.updateMany({
      where: { id: postId, status: "PUBLISHING" },
      data: {
        status: "DRAFT",
        publishPhase: null,
        publishState: Prisma.DbNull,
        pollLockedUntil: null,
        publishError: null,
        externalId: null,
        externalUrl: null,
      },
    });
    await logActivity(
      post.clientId,
      actor,
      "content_publish_cancelled",
      `Pulled back ${post.platform} post "${post.title || "(untitled)"}" before it went live${result.message ? `: ${result.message}` : ""}`
    );
    return { ok: true };
  } catch (err) {
    await prisma.contentPost.updateMany({
      where: { id: postId, status: "PUBLISHING" },
      data: { pollLockedUntil: new Date(), publishState: adapterState(state) as object },
    });
    return {
      ok: false,
      status: 502,
      error: `Couldn't pull the post back: ${sanitizePublishError(err instanceof Error ? err.message : "unknown error")}`,
    };
  }
}
