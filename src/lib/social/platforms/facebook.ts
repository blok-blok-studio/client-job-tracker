import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";

export async function publishToFacebook(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;
  const pageId = credential.username;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const message = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const body: Record<string, string> = { message, access_token: accessToken };

  if (content.mediaUrls.length > 0) {
    endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
    body.url = content.mediaUrls[0];
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const postId = data.id;

  return {
    success: true,
    externalId: postId,
    externalUrl: postId ? `https://www.facebook.com/${postId}` : undefined,
  };
}
