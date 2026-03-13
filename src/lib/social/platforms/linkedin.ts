import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";

export async function publishToLinkedin(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;
  const authorUrn = credential.username;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const text = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  const postBody = {
    author: authorUrn.startsWith("urn:") ? authorUrn : `urn:li:person:${authorUrn}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: content.mediaUrls.length > 0 ? "IMAGE" : "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
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
