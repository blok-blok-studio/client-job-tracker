import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";
import { resilientFetch, buildApiHeaders, humanDelay } from "../http";

export async function publishToLinkedin(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;
  const authorUrn = credential.username.startsWith("urn:")
    ? credential.username
    : `urn:li:person:${credential.username}`;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const text = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  const headers = buildApiHeaders(accessToken, { "X-Restli-Protocol-Version": "2.0.0" });

  // ─── Document carousel (PDF) ───────────────────────────────────────────────
  if (content.documentUrl) {
    return publishLinkedinDocument(content, authorUrn, headers, accessToken, text);
  }

  // ─── Image post ────────────────────────────────────────────────────────────
  const uploadedAssets: string[] = [];

  if (content.mediaUrls.length > 0) {
    for (const mediaUrl of content.mediaUrls.slice(0, 9)) {
      await humanDelay(400, 1000);
      const asset = await registerAndUploadAsset(
        authorUrn,
        "urn:li:digitalmediaRecipe:feedshare-image",
        mediaUrl,
        headers,
        accessToken
      );
      uploadedAssets.push(asset);
    }
  }

  await humanDelay(500, 1200);

  const mediaContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: uploadedAssets.length > 0 ? "IMAGE" : "NONE",
  };

  if (uploadedAssets.length > 0) {
    mediaContent.media = uploadedAssets.map((asset) => ({
      status: "READY",
      media: asset,
    }));
  }

  const postBody = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": mediaContent,
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await resilientFetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers,
    body: JSON.stringify(postBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn API error (${res.status}): ${err}`);
  }

  const postId = res.headers.get("x-restli-id") || "";

  return {
    success: true,
    externalId: postId,
    externalUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndUploadAsset(
  authorUrn: string,
  recipe: string,
  mediaUrl: string,
  headers: Record<string, string>,
  accessToken: string
): Promise<string> {
  const registerRes = await resilientFetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: [recipe],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    }
  );

  if (!registerRes.ok) {
    const err = await registerRes.text();
    throw new Error(`LinkedIn register upload error (${registerRes.status}): ${err}`);
  }

  const registerData = await registerRes.json();
  const uploadUrl =
    registerData.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  const asset = registerData.value?.asset;

  if (!uploadUrl || !asset) {
    throw new Error("LinkedIn did not return upload URL or asset");
  }

  const fileRes = await fetch(mediaUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch media from ${mediaUrl}`);
  }
  const fileBuffer = await fileRes.arrayBuffer();

  await humanDelay(200, 600);

  const uploadRes = await resilientFetch(uploadUrl, {
    method: "PUT",
    headers: {
      ...buildApiHeaders(accessToken),
      "Content-Type": "application/octet-stream",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`LinkedIn upload error (${uploadRes.status}): ${err}`);
  }

  return asset;
}

async function publishLinkedinDocument(
  content: PostContent,
  authorUrn: string,
  headers: Record<string, string>,
  accessToken: string,
  text: string
): Promise<PublishResult> {
  await humanDelay(400, 1000);

  // Register and upload the PDF as a document asset
  const asset = await registerAndUploadAsset(
    authorUrn,
    "urn:li:digitalmediaRecipe:feedshare-document",
    content.documentUrl!,
    headers,
    accessToken
  );

  await humanDelay(500, 1200);

  const postBody = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NATIVE_DOCUMENT",
        media: [
          {
            status: "READY",
            media: asset,
            title: { text: content.documentTitle || "Document" },
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await resilientFetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers,
    body: JSON.stringify(postBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn document carousel error (${res.status}): ${err}`);
  }

  const postId = res.headers.get("x-restli-id") || "";

  return {
    success: true,
    externalId: postId,
    externalUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined,
  };
}
