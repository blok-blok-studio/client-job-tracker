/**
 * Covers the failure that produced "The string did not match the expected
 * pattern." in a contractor-facing toast: a Vercel platform error page parsed
 * as JSON. Run: npx tsx scripts/test-fetch-json.ts
 */
import { readJson, friendlyError } from "../src/lib/fetch-json";
import { safeUuid } from "../src/lib/safe-uuid";
import { checkDocumentFile, guessContentType } from "../src/lib/file-type";
import { sanitizePublishError } from "../src/lib/social/publisher";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}\n      expected: ${expected}\n      actual:   ${actual}`);
  }
}

async function run() {
  console.log("\nreadJson — platform responses that are not JSON");

  // The exact body Vercel returns; captured from production
  const payloadTooLarge = new Response(
    "Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nfra1::wl7s7-1787240516508",
    { status: 413, headers: { "content-type": "text/plain" } }
  );
  const r1 = await readJson(payloadTooLarge);
  check("413 does not throw", r1.ok, false);
  check("413 explains the size", r1.error, "That file is too large to send this way.");

  const gatewayTimeout = new Response("<!DOCTYPE html><html>...</html>", {
    status: 504,
    headers: { "content-type": "text/html" },
  });
  const r2 = await readJson(gatewayTimeout);
  check(
    "504 HTML explains the timeout",
    r2.error,
    "That took too long and timed out. Try again with fewer files at once."
  );

  const emptyBody = await readJson(new Response("", { status: 200 }), "Couldn't save that.");
  check("empty 200 body is a failure, not a crash", emptyBody.ok, false);
  check("empty 200 body uses the fallback", emptyBody.error, "Couldn't save that.");

  console.log("\nreadJson — our own API responses");

  const ok = await readJson<{ data: number[] }>(
    new Response(JSON.stringify({ success: true, data: [1, 2] }), { status: 201 })
  );
  check("success passes through", ok.ok, true);
  check("success carries data", JSON.stringify(ok.data?.data), "[1,2]");

  const appError = await readJson(
    new Response(JSON.stringify({ success: false, error: "That client isn't assigned to you" }), {
      status: 400,
    })
  );
  check("our error text survives", appError.error, "That client isn't assigned to you");

  const softFail = await readJson(
    new Response(JSON.stringify({ success: false, error: "Invalid link" }), { status: 200 })
  );
  check("success:false on a 200 is still a failure", softFail.ok, false);

  console.log("\nfriendlyError — browser internals never reach a user");

  check(
    "Safari JSON parse",
    friendlyError(new SyntaxError("The string did not match the expected pattern."), "Upload failed."),
    "Upload failed."
  );
  check(
    "Chrome JSON parse",
    friendlyError(new SyntaxError(`Unexpected token 'R', "Request En"... is not valid JSON`), "Upload failed."),
    "Upload failed."
  );
  check(
    "Firefox JSON parse",
    friendlyError(new SyntaxError("JSON.parse: unexpected character"), "Upload failed."),
    "Upload failed."
  );
  check(
    "Safari network failure",
    friendlyError(new TypeError("Load failed")),
    "Connection lost. Check your internet and try again."
  );
  check(
    "our own message survives",
    friendlyError(new Error("Choose which client this work goes to")),
    "Choose which client this work goes to"
  );
  check("non-Error values fall back", friendlyError("boom", "Upload failed."), "Upload failed.");

  console.log("\nsafeUuid");
  const a = safeUuid();
  const b = safeUuid();
  check("produces a uuid-shaped id", /^[0-9a-f-]{20,}$/.test(a), true);
  check("ids are unique", a !== b, true);

  console.log("\nfile checks");
  const bigFile = { name: "invoice.pdf", size: 40 * 1024 * 1024, type: "application/pdf" } as File;
  check("oversize file is caught", (checkDocumentFile(bigFile) || "").includes("under 25MB"), true);

  const heic = { name: "IMG_0421.HEIC", size: 3 * 1024 * 1024, type: "" } as File;
  check("Safari's empty type is inferred", guessContentType(heic), "image/heic");
  check("inferred HEIC is accepted", checkDocumentFile(heic), null);

  const video = { name: "clip.mov", size: 1024, type: "video/quicktime" } as File;
  check("a video is rejected for invoices", (checkDocumentFile(video) || "").includes("PDF"), true);

  const okFile = { name: "invoice.pdf", size: 500 * 1024, type: "application/pdf" } as File;
  check("a normal invoice passes", checkDocumentFile(okFile), null);

  console.log("\nsanitizePublishError — social publishing failures");
  check(
    "an unreadable platform response is explained",
    sanitizePublishError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`),
    "The platform returned a response we couldn't read. It may be having an outage. The post was not published."
  );
  check(
    "a real platform error still comes through",
    sanitizePublishError("Instagram media create error (400): Invalid media type"),
    "Instagram media create error (400): Invalid media type"
  );
  check(
    "credentials are still redacted",
    sanitizePublishError("Failed: Bearer abc123def456ghi789jkl0"),
    "Failed: Bearer [REDACTED]"
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

run();
