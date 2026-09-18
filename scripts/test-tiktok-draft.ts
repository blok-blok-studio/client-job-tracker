/**
 * TikTok "send to drafts" against a mocked TikTok API (no network, nothing posted).
 * The only real I/O is a read-only library lookup for the video's duration.
 *
 *   set -a && . ./.env.local && set +a && npx tsx scripts/test-tiktok-draft.ts
 *
 * Checks:
 *  1. A draft video uses the inbox endpoint and sends no post settings.
 *  2. The upload finishes and SEND_TO_USER_INBOX ends in a handoff, not "done".
 *  3. A draft needs no privacy level; a direct post still does.
 *  4. A direct post still uses the direct endpoint with its post settings.
 *  5. A draft photo post uses MEDIA_UPLOAD.
 */

import type { ContentPost } from "@prisma/client";
import { tiktokAdapter } from "../src/lib/social/platforms/tiktok";
import type { PublishContext, PublishStep } from "../src/lib/social/types";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

const VIDEO = "https://teststore.public.blob.vercel-storage.com/draft-test.mp4";
const PHOTO = "https://teststore.public.blob.vercel-storage.com/draft-test.jpg";
const SIZE = 1024 * 1024;

const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let statusQueue: string[] = [];

const json = (data: unknown) => new Response(JSON.stringify({ data, error: { code: "ok" } }), { status: 200 });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || "GET";
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  calls.push({ url, method, body });

  if (url.endsWith("/creator_info/query/")) return json({ creator_username: "tester", privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"], max_video_post_duration_sec: 600 });
  if (url.endsWith("/inbox/video/init/") || url.endsWith("/publish/video/init/")) return json({ publish_id: "pub_1", upload_url: "https://upload.test/put" });
  if (url.endsWith("/content/init/")) return json({ publish_id: "pub_photo" });
  if (url.endsWith("/status/fetch/")) return json({ status: statusQueue.shift() || "PROCESSING_UPLOAD" });
  if (url === "https://upload.test/put") return new Response(null, { status: 201 });
  if (url === VIDEO && method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": String(SIZE) } });
  if (url === VIDEO) return new Response(new Uint8Array(SIZE), { status: 206 });
  return new Response("{}", { status: 404 });
}) as typeof fetch;

function ctx(settings: Record<string, unknown>, mediaUrls: string[], state: Record<string, unknown> | null): PublishContext {
  return {
    post: { id: "test" } as ContentPost,
    credential: { id: "c", username: "open_id", password: "token", notes: null, meta: { username: "tester" } },
    content: { title: "Title", body: "Caption", hashtags: ["tag"], mediaUrls },
    settings,
    state,
    deadline: Date.now() + 120_000,
  };
}

async function runToEnd(settings: Record<string, unknown>, mediaUrls: string[]): Promise<PublishStep> {
  let state: Record<string, unknown> | null = null;
  for (let i = 0; i < 10; i++) {
    const step = await tiktokAdapter.publish(ctx(settings, mediaUrls, state));
    if (step.kind !== "continue") return step;
    state = step.state;
  }
  throw new Error("never finished");
}

async function main() {
  process.env.TIKTOK_MEDIA_SIGNING_SECRET ||= "test-secret";
  process.env.NEXT_PUBLIC_APP_URL ||= "https://example.test";

  // 1 + 2 + 3: draft video, no privacy level set
  statusQueue = ["PROCESSING_UPLOAD", "SEND_TO_USER_INBOX"];
  const draft = await runToEnd({ tiktokDraft: true, postType: "video" }, [VIDEO]);
  const init = calls.find((c) => c.url.includes("/video/init/"));
  check("draft video uses the inbox endpoint", !!init?.url.endsWith("/post/publish/inbox/video/init/"), init?.url);
  check("draft init sends no post settings", !!init?.body && !("post_info" in init.body) && "source_info" in init.body);
  check("the video was uploaded", calls.some((c) => c.url === "https://upload.test/put" && c.method === "PUT"));
  check("reaching the inbox ends in a handoff", draft.kind === "handoff" && draft.externalId === "pub_1", draft.kind);

  // 3: direct post without a privacy level is refused
  calls.length = 0;
  const refused = await runToEnd({ postType: "video" }, [VIDEO]).then(
    () => null,
    (e: Error) => e.message
  );
  check("a direct post still needs a privacy level", !!refused && /who can view/i.test(refused), refused || "no error");
  check("nothing was created on TikTok for the refused post", !calls.some((c) => c.url.includes("/init/")));

  // 4: direct post unchanged
  calls.length = 0;
  statusQueue = ["PUBLISH_COMPLETE"];
  const direct = await runToEnd({ postType: "video", privacyLevel: "SELF_ONLY" }, [VIDEO]);
  const directInit = calls.find((c) => c.url.includes("/video/init/"));
  const postInfo = directInit?.body?.post_info as Record<string, unknown> | undefined;
  check("direct post uses the direct endpoint", !!directInit?.url.endsWith("/post/publish/video/init/"), directInit?.url);
  check("direct post sends caption and privacy", postInfo?.privacy_level === "SELF_ONLY" && postInfo?.title === "Caption #tag", JSON.stringify(postInfo));
  check("direct post ends done", direct.kind === "done", direct.kind);

  // 5: draft photos
  calls.length = 0;
  statusQueue = ["SEND_TO_USER_INBOX"];
  const photos = await runToEnd({ tiktokDraft: true, postType: "photo" }, [PHOTO]);
  const photoInit = calls.find((c) => c.url.endsWith("/content/init/"));
  check("draft photos use MEDIA_UPLOAD", photoInit?.body?.post_mode === "MEDIA_UPLOAD", String(photoInit?.body?.post_mode));
  check("draft photos end in a handoff", photos.kind === "handoff", photos.kind);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
