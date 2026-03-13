import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";
import { resilientFetch, buildApiHeaders, humanDelay } from "../http";

const GRAPH_API = "https://graph.facebook.com/v19.0";

export async function publishToInstagram(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;
  const igUserId = credential.username;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const caption = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  if (content.mediaUrls.length === 0) {
    throw new Error("Instagram requires at least one image or video URL");
  }

  const headers = buildApiHeaders(accessToken);

  // Carousel support: 2-10 media items
  if (content.mediaUrls.length >= 2 && content.mediaUrls.length <= 10) {
    const childIds: string[] = [];

    for (const mediaUrl of content.mediaUrls.slice(0, 10)) {
      await humanDelay(500, 1500);

      const isVideo = /\.(mp4|mov|webm)$/i.test(mediaUrl);
      const childBody: Record<string, string> = {
        access_token: accessToken,
        is_carousel_item: "true",
      };

      if (isVideo) {
        childBody.media_type = "VIDEO";
        childBody.video_url = mediaUrl;
      } else {
        childBody.image_url = mediaUrl;
      }

      const childRes = await resilientFetch(`${GRAPH_API}/${igUserId}/media`, {
        method: "POST",
        headers,
        body: JSON.stringify(childBody),
      });

      if (!childRes.ok) {
        const err = await childRes.text();
        throw new Error(`Instagram carousel item error (${childRes.status}): ${err}`);
      }

      const { id: childId } = await childRes.json();
      childIds.push(childId);
    }

    // Wait for media processing
    await humanDelay(2000, 4000);

    // Create the carousel container
    const carouselRes = await resilientFetch(`${GRAPH_API}/${igUserId}/media`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_type: "CAROUSEL",
        caption,
        children: childIds,
        access_token: accessToken,
      }),
    });

    if (!carouselRes.ok) {
      const err = await carouselRes.text();
      throw new Error(`Instagram carousel create error (${carouselRes.status}): ${err}`);
    }

    const { id: carouselId } = await carouselRes.json();

    await humanDelay(1000, 2000);

    // Publish the carousel
    const publishRes = await resilientFetch(`${GRAPH_API}/${igUserId}/media_publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ creation_id: carouselId, access_token: accessToken }),
    });

    if (!publishRes.ok) {
      const err = await publishRes.text();
      throw new Error(`Instagram carousel publish error (${publishRes.status}): ${err}`);
    }

    const { id: mediaId } = await publishRes.json();

    return {
      success: true,
      externalId: mediaId,
      externalUrl: `https://www.instagram.com/p/${mediaId}/`,
    };
  }

  // Single media post
  const mediaUrl = content.mediaUrls[0];
  const isVideo = /\.(mp4|mov|webm)$/i.test(mediaUrl);

  const createBody: Record<string, string> = {
    caption,
    access_token: accessToken,
  };

  if (isVideo) {
    createBody.media_type = "VIDEO";
    createBody.video_url = mediaUrl;
  } else {
    createBody.image_url = mediaUrl;
  }

  // Step 1: Create media container
  const createRes = await resilientFetch(`${GRAPH_API}/${igUserId}/media`, {
    method: "POST",
    headers,
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Instagram media create error (${createRes.status}): ${err}`);
  }

  const { id: containerId } = await createRes.json();

  // For video, poll until processing is complete
  if (isVideo) {
    let ready = false;
    let pollAttempts = 0;
    while (!ready && pollAttempts < 30) {
      await humanDelay(3000, 5000);
      const statusRes = await resilientFetch(
        `${GRAPH_API}/${containerId}?fields=status_code&access_token=${accessToken}`,
        { headers }
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status_code === "FINISHED") {
          ready = true;
        } else if (statusData.status_code === "ERROR") {
          throw new Error("Instagram video processing failed");
        }
      }
      pollAttempts++;
    }
  } else {
    await humanDelay(1000, 2000);
  }

  // Step 2: Publish the container
  const publishRes = await resilientFetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers,
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });

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
