/**
 * LinkedIn member publishing.
 *
 * Text and image posts keep the v2 ugcPosts + assets path that has published
 * every LinkedIn post so far (don't change it without a live test). Two content
 * types never worked on that path and now use the versioned /rest APIs:
 *  - video: /rest/videos multipart upload (parts resume across runner steps),
 *    wait for AVAILABLE, then /rest/posts. Videos used to go through the image
 *    recipe and were silently rejected.
 *  - PDF documents: /rest/documents upload, wait for AVAILABLE, then
 *    /rest/posts. The old feedshare-document asset recipe returned ACCESS_DENIED.
 */

import type { DecryptedCredential, PublishResult } from "../publisher";
import { fetchRange, getRemoteSize, isVideoUrl } from "../media";
import { fetchWithRetry } from "../http";
import {
  PublishValidationError,
  type PlatformAdapter,
  type PostContent,
  type PublishContext,
  type PublishStep,
} from "../types";

/** Versioned API release (supported for at least a year from release). */
const LINKEDIN_VERSION = "202608";
const MAX_IMAGES = 9;
/** Organic feed videos: 75 KB to 500 MB per LinkedIn's video specs. */
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

function authorUrn(username: string): string {
  return username.startsWith("urn:") ? username : `urn:li:person:${username}`;
}

function plainCommentary(content: PostContent): string {
  const tags = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [content.body, tags].filter(Boolean).join("\n\n");
}

/**
 * /rest/posts commentary uses LinkedIn's "little" text format: reserved
 * characters must be backslash-escaped or the post is rejected or mangled.
 * A `#word` stays unescaped so it renders as a hashtag.
 */
export function littleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (ch, offset: number, whole: string) => {
    if (ch === "#" && /[\p{L}\p{N}_]/u.test(whole[offset + 1] || "")) return ch;
    return `\\${ch}`;
  });
}

function v2Headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function restHeaders(token: string): Record<string, string> {
  return { ...v2Headers(token), "LinkedIn-Version": LINKEDIN_VERSION };
}

async function liError(action: string, res: Response): Promise<Error> {
  const text = await res.text();
  let hint = "";
  if (res.status === 401) hint = " The LinkedIn connection expired. Reconnect LinkedIn on the client page.";
  else if (res.status === 426 || /version/i.test(text)) hint = " The LinkedIn API version may need updating.";
  return new Error(`LinkedIn ${action} error (${res.status}): ${text.slice(0, 500)}${hint}`);
}

// ─── v2 image/text path (unchanged behavior) ─────────────────────────────────

async function registerAndUploadImage(author: string, mediaUrl: string, token: string): Promise<string> {
  const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: v2Headers(token),
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: author,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  if (!registerRes.ok) throw await liError("register upload", registerRes);

  const registerData = await registerRes.json();
  const uploadUrl =
    registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const asset = registerData.value?.asset;
  if (!uploadUrl || !asset) throw new Error("LinkedIn did not return upload URL or asset");

  const fileRes = await fetch(mediaUrl);
  if (!fileRes.ok) throw new Error(`Failed to fetch media from ${mediaUrl}`);
  const fileBuffer = await fileRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: fileBuffer,
  });
  if (!uploadRes.ok) throw await liError("upload", uploadRes);
  return asset;
}

async function publishTextOrImages(content: PostContent, author: string, token: string): Promise<PublishStep> {
  const uploadedAssets: string[] = [];
  for (const mediaUrl of content.mediaUrls) {
    uploadedAssets.push(await registerAndUploadImage(author, mediaUrl, token));
  }

  const mediaContent: Record<string, unknown> = {
    shareCommentary: { text: plainCommentary(content) },
    shareMediaCategory: uploadedAssets.length > 0 ? "IMAGE" : "NONE",
  };
  if (uploadedAssets.length > 0) {
    mediaContent.media = uploadedAssets.map((asset) => ({ status: "READY", media: asset }));
  }

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: v2Headers(token),
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": mediaContent },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!res.ok) throw await liError("API", res);

  const postId = res.headers.get("x-restli-id") || "";
  return {
    kind: "done",
    externalId: postId,
    externalUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined,
  };
}

// ─── /rest path for video and documents ──────────────────────────────────────

async function createRestPost(
  content: PostContent,
  author: string,
  token: string,
  media: { id: string; title?: string }
): Promise<PublishStep> {
  const body: Record<string, unknown> = {
    author,
    commentary: littleText(plainCommentary(content)),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: media.title ? { id: media.id, title: media.title } : { id: media.id } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: restHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await liError("post", res);
  const postId = res.headers.get("x-restli-id") || "";
  return {
    kind: "done",
    externalId: postId,
    externalUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined,
  };
}

interface LinkedInState {
  video?: {
    urn: string;
    url: string;
    uploadToken: string;
    parts: { uploadUrl: string; firstByte: number; lastByte: number }[];
    etags: string[];
    finalized?: boolean;
  };
  document?: { urn: string; uploadUrl: string; url: string; uploaded?: boolean };
}

async function assetStatus(kind: "videos" | "documents", urn: string, token: string): Promise<{ status: string; reason?: string }> {
  const res = await fetchWithRetry(`https://api.linkedin.com/rest/${kind}/${encodeURIComponent(urn)}`, {
    headers: restHeaders(token),
  });
  if (!res.ok) throw await liError(`${kind === "videos" ? "video" : "document"} status check`, res);
  const json = await res.json();
  return { status: String(json.status || ""), reason: json.processingFailureReason };
}

async function publishStep(
  content: PostContent,
  credential: { username: string; password: string },
  state: LinkedInState | null,
  deadline: number
): Promise<PublishStep> {
  const token = credential.password;
  const author = authorUrn(credential.username);
  const title = content.title || undefined;

  // ─── Video in progress ──────────────────────────────────────────────────────
  if (state?.video) {
    const video = { ...state.video, etags: [...state.video.etags] };

    if (video.etags.length < video.parts.length) {
      while (video.etags.length < video.parts.length && Date.now() < deadline - 20_000) {
        const part = video.parts[video.etags.length];
        const bytes = await fetchRange(video.url, part.firstByte, part.lastByte);
        // Each part has its own upload URL and byte range, so re-sending it is safe
        const res = await fetchWithRetry(
          part.uploadUrl,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
            body: new Uint8Array(bytes),
          },
          { idempotent: true }
        );
        if (!res.ok) throw await liError("video part upload", res);
        const etag = res.headers.get("etag");
        if (!etag) throw new Error("LinkedIn didn't return an ETag for an uploaded video part");
        video.etags.push(etag);
      }
      if (video.etags.length < video.parts.length) {
        return { kind: "continue", phase: "uploading", state: { video }, retryAfterMs: 0 };
      }
    }

    if (!video.finalized) {
      const res = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
        method: "POST",
        headers: restHeaders(token),
        body: JSON.stringify({
          finalizeUploadRequest: { video: video.urn, uploadToken: video.uploadToken, uploadedPartIds: video.etags },
        }),
      });
      if (!res.ok) throw await liError("video finalize", res);
      video.finalized = true;
      return { kind: "continue", phase: "processing", state: { video }, retryAfterMs: 15_000 };
    }

    const { status, reason } = await assetStatus("videos", video.urn, token);
    if (status === "PROCESSING_FAILED") throw new Error(`LinkedIn couldn't process the video: ${reason || "processing failed"}`);
    if (status !== "AVAILABLE") return { kind: "continue", phase: "processing", state: { video }, retryAfterMs: 20_000 };
    return createRestPost(content, author, token, { id: video.urn, title });
  }

  // ─── Document in progress ───────────────────────────────────────────────────
  if (state?.document) {
    const document = { ...state.document };
    if (!document.uploaded) {
      const fileRes = await fetchWithRetry(document.url);
      if (!fileRes.ok) throw new Error(`Couldn't read the PDF (${fileRes.status}). Re-upload it and try again.`);
      const bytes = await fileRes.arrayBuffer();
      // Single-file PUT to this document's own upload URL: safe to re-send
      const res = await fetchWithRetry(
        document.uploadUrl,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
          body: bytes,
        },
        { idempotent: true }
      );
      if (!res.ok) throw await liError("document upload", res);
      document.uploaded = true;
      return { kind: "continue", phase: "processing", state: { document }, retryAfterMs: 10_000 };
    }
    const { status } = await assetStatus("documents", document.urn, token);
    if (status === "PROCESSING_FAILED") throw new Error("LinkedIn couldn't process the PDF. Check it opens and is under 100 MB and 300 pages.");
    if (status !== "AVAILABLE") return { kind: "continue", phase: "processing", state: { document }, retryAfterMs: 15_000 };
    return createRestPost(content, author, token, { id: document.urn, title: content.documentTitle || title || "Document" });
  }

  // ─── First step ─────────────────────────────────────────────────────────────
  const videos = content.mediaUrls.filter(isVideoUrl);
  const images = content.mediaUrls.filter((u) => !isVideoUrl(u));

  if (content.documentUrl) {
    if (content.mediaUrls.length > 0) {
      throw new PublishValidationError("A LinkedIn document post can't also include images or video.");
    }
    const res = await fetch("https://api.linkedin.com/rest/documents?action=initializeUpload", {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    });
    if (!res.ok) throw await liError("document upload start", res);
    const json = await res.json();
    return {
      kind: "continue",
      phase: "uploading",
      state: { document: { urn: json.value.document, uploadUrl: json.value.uploadUrl, url: content.documentUrl } },
      retryAfterMs: 0,
    };
  }

  if (videos.length > 1 || (videos.length === 1 && images.length > 0)) {
    throw new PublishValidationError("A LinkedIn post can have one video or up to 9 images, not both.");
  }

  if (videos.length === 1) {
    const url = videos[0];
    const size = await getRemoteSize(url);
    if (size > MAX_VIDEO_BYTES) throw new PublishValidationError("LinkedIn videos must be 500 MB or smaller.");
    const res = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({
        initializeUploadRequest: { owner: author, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false },
      }),
    });
    if (!res.ok) throw await liError("video upload start", res);
    const json = await res.json();
    const value = json.value;
    return {
      kind: "continue",
      phase: "uploading",
      state: {
        video: {
          urn: value.video,
          url,
          uploadToken: value.uploadToken || "",
          parts: (value.uploadInstructions || []).map((p: { uploadUrl: string; firstByte: number; lastByte: number }) => ({
            uploadUrl: p.uploadUrl,
            firstByte: p.firstByte,
            lastByte: p.lastByte,
          })),
          etags: [],
        },
      },
      retryAfterMs: 0,
    };
  }

  if (images.length > MAX_IMAGES) {
    throw new PublishValidationError(`LinkedIn posts can have up to ${MAX_IMAGES} images. This one has ${images.length}.`);
  }
  return publishTextOrImages({ ...content, mediaUrls: images }, author, token);
}

export const linkedinAdapter: PlatformAdapter = {
  publish(ctx: PublishContext) {
    return publishStep(ctx.content, ctx.credential, ctx.state as LinkedInState | null, ctx.deadline);
  },
};

/**
 * Legacy single-call entry point, kept until publisher.ts registers
 * linkedinAdapter. Runs every step inline.
 */
export async function publishToLinkedin(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  let state: LinkedInState | null = null;
  const giveUpAt = Date.now() + 270_000;
  for (;;) {
    const step = await publishStep(content, credential, state, giveUpAt);
    if (step.kind === "done") return { success: true, externalId: step.externalId, externalUrl: step.externalUrl };
    if (Date.now() > giveUpAt) throw new Error("LinkedIn is still processing the upload. Check the profile before retrying.");
    state = step.state as LinkedInState;
    await new Promise((r) => setTimeout(r, step.retryAfterMs ?? 10_000));
  }
}
