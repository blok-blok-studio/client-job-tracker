import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";
import { resilientFetch, buildApiHeaders, humanDelay } from "../http";

const GRAPH_API = "https://graph.facebook.com/v19.0";

export async function publishToFacebook(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;
  const pageId = credential.username;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const message = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  const headers = buildApiHeaders(accessToken);

  // Multi-photo support: upload each photo, then create post with attached_media
  if (content.mediaUrls.length > 1) {
    const photoIds: string[] = [];

    for (const mediaUrl of content.mediaUrls.slice(0, 10)) {
      await humanDelay(400, 1000);

      const uploadRes = await resilientFetch(`${GRAPH_API}/${pageId}/photos`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: mediaUrl,
          published: false, // unpublished photo for attachment
          access_token: accessToken,
        }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Facebook photo upload error (${uploadRes.status}): ${err}`);
      }

      const { id: photoId } = await uploadRes.json();
      photoIds.push(photoId);
    }

    await humanDelay(500, 1200);

    // Create multi-photo post
    const attachedMedia = Object.fromEntries(
      photoIds.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })])
    );

    const postRes = await resilientFetch(`${GRAPH_API}/${pageId}/feed`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message,
        access_token: accessToken,
        ...attachedMedia,
      }),
    });

    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`Facebook multi-photo post error (${postRes.status}): ${err}`);
    }

    const data = await postRes.json();
    return {
      success: true,
      externalId: data.id,
      externalUrl: data.id ? `https://www.facebook.com/${data.id}` : undefined,
    };
  }

  // Single media or text-only post
  let endpoint = `${GRAPH_API}/${pageId}/feed`;
  const body: Record<string, string> = { message, access_token: accessToken };

  if (content.mediaUrls.length === 1) {
    const mediaUrl = content.mediaUrls[0];
    const isVideo = /\.(mp4|mov|webm)$/i.test(mediaUrl);

    if (isVideo) {
      endpoint = `${GRAPH_API}/${pageId}/videos`;
      body.file_url = mediaUrl;
      body.description = message;
      delete body.message;
    } else {
      endpoint = `${GRAPH_API}/${pageId}/photos`;
      body.url = mediaUrl;
    }
  }

  await humanDelay(300, 800);

  const res = await resilientFetch(endpoint, {
    method: "POST",
    headers,
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
