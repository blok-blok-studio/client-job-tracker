import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";

export async function publishToInstagram(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;
  const igUserId = credential.username;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const caption = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  const mediaUrl = content.mediaUrls[0];
  if (!mediaUrl) {
    throw new Error("Instagram requires at least one image or video URL");
  }

  // Step 1: Create media container
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: mediaUrl, caption, access_token: accessToken }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Instagram media create error (${createRes.status}): ${err}`);
  }

  const { id: containerId } = await createRes.json();

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    }
  );

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Instagram publish error (${publishRes.status}): ${err}`);
  }

  const { id: mediaId } = await publishRes.json();

  return {
    success: true,
    externalId: mediaId,
    externalUrl: `https://www.instagram.com/p/${mediaId}/`,
  };
}
