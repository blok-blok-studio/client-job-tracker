/**
 * Threads Publishing API (Meta Graph API)
 *
 * Threads API uses similar patterns to Instagram Graph API.
 * Requires: Threads User ID (username field) + access token (password field)
 *
 * Flow: Create media container → Publish container
 * For video: Create container → Poll for processing → Publish
 */

import type { PostContent, DecryptedCredential, PublishResult } from "../publisher";
import { buildApiHeaders, humanDelay, resilientFetch } from "../http";

const GRAPH_API = "https://graph.threads.net/v1.0";

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(url);
}

export async function publishToThreads(
  content: PostContent,
  cred: DecryptedCredential
): Promise<PublishResult> {
  const userId = cred.username; // Threads User ID
  const accessToken = cred.password;
  const headers = buildApiHeaders(accessToken);

  const text = [content.body, content.hashtags.map((h) => `#${h}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  let containerId: string;

  if (content.mediaUrls.length === 1) {
    const mediaUrl = content.mediaUrls[0];
    const mediaType = isVideo(mediaUrl) ? "VIDEO" : "IMAGE";

    // Create media container
    const createRes = await resilientFetch(`${GRAPH_API}/${userId}/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_type: mediaType,
        text,
        ...(mediaType === "IMAGE" ? { image_url: mediaUrl } : { video_url: mediaUrl }),
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Threads media creation failed (${createRes.status}): ${err}`);
    }

    const createData = await createRes.json();
    containerId = createData.id;

    // For video, poll until processing complete
    if (mediaType === "VIDEO") {
      for (let i = 0; i < 30; i++) {
        await humanDelay(3000, 5000);
        const statusRes = await resilientFetch(
          `${GRAPH_API}/${containerId}?fields=status&access_token=${accessToken}`,
          { headers }
        );
        const statusData = await statusRes.json();
        if (statusData.status === "FINISHED") break;
        if (statusData.status === "ERROR") throw new Error("Threads video processing failed");
      }
    }
  } else if (content.mediaUrls.length === 0) {
    // Text-only post
    const createRes = await resilientFetch(`${GRAPH_API}/${userId}/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_type: "TEXT",
        text,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Threads post creation failed (${createRes.status}): ${err}`);
    }

    const createData = await createRes.json();
    containerId = createData.id;
  } else {
    // Carousel (multiple media)
    const childIds: string[] = [];

    for (const url of content.mediaUrls) {
      const mediaType = isVideo(url) ? "VIDEO" : "IMAGE";
      const childRes = await resilientFetch(`${GRAPH_API}/${userId}/threads`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          media_type: mediaType,
          is_carousel_item: true,
          ...(mediaType === "IMAGE" ? { image_url: url } : { video_url: url }),
        }),
      });

      if (!childRes.ok) throw new Error(`Threads carousel item upload failed`);
      const childData = await childRes.json();
      childIds.push(childData.id);
      await humanDelay(1000, 2000);
    }

    // Create carousel container
    const carouselRes = await resilientFetch(`${GRAPH_API}/${userId}/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_type: "CAROUSEL",
        children: childIds.join(","),
        text,
      }),
    });

    if (!carouselRes.ok) throw new Error("Threads carousel creation failed");
    const carouselData = await carouselRes.json();
    containerId = carouselData.id;
  }

  await humanDelay(2000, 4000);

  // Publish the container
  const publishRes = await resilientFetch(`${GRAPH_API}/${userId}/threads_publish`, {
    method: "POST",
    headers,
    body: JSON.stringify({ creation_id: containerId }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Threads publish failed (${publishRes.status}): ${err}`);
  }

  const publishData = await publishRes.json();

  return {
    success: true,
    externalId: publishData.id,
    externalUrl: `https://www.threads.net/post/${publishData.id}`,
  };
}
