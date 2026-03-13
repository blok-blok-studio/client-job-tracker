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

  // Upload images if present
  const uploadedAssets: string[] = [];

  if (content.mediaUrls.length > 0) {
    for (const mediaUrl of content.mediaUrls.slice(0, 9)) {
      await humanDelay(400, 1000);

      // Step 1: Register upload
      const registerRes = await resilientFetch(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
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

      // Step 2: Fetch and upload the image binary
      const imageRes = await fetch(mediaUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to fetch image from ${mediaUrl}`);
      }
      const imageBuffer = await imageRes.arrayBuffer();

      await humanDelay(200, 600);

      const uploadRes = await resilientFetch(uploadUrl, {
        method: "PUT",
        headers: {
          ...buildApiHeaders(accessToken),
          "Content-Type": "application/octet-stream",
        },
        body: imageBuffer,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`LinkedIn image upload error (${uploadRes.status}): ${err}`);
      }

      uploadedAssets.push(asset);
    }
  }

  await humanDelay(500, 1200);

  // Build the post body
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
