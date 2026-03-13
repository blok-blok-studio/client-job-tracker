import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";
import { resilientFetch, buildApiHeaders, humanDelay } from "../http";

export async function publishToTwitter(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const apiKey = credential.password;

  // Build tweet text: body + hashtags
  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const tweetText = [content.body, hashtagStr].filter(Boolean).join("\n\n").slice(0, 280);

  const tweetBody: Record<string, unknown> = { text: tweetText };

  // Upload media attachments if present (up to 4 images or 1 video)
  if (content.mediaUrls.length > 0) {
    const mediaIds: string[] = [];

    for (const mediaUrl of content.mediaUrls.slice(0, 4)) {
      await humanDelay(300, 900);

      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) {
        throw new Error(`Failed to fetch media from ${mediaUrl}`);
      }

      const mediaBuffer = await mediaRes.arrayBuffer();
      const base64 = Buffer.from(mediaBuffer).toString("base64");
      const isVideo = /\.(mp4|mov|webm)$/i.test(mediaUrl);

      if (isVideo) {
        // Chunked upload for video: INIT → APPEND → FINALIZE → poll STATUS
        const initRes = await resilientFetch(
          "https://upload.twitter.com/1.1/media/upload.json",
          {
            method: "POST",
            headers: {
              ...buildApiHeaders(apiKey),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              command: "INIT",
              total_bytes: String(mediaBuffer.byteLength),
              media_type: "video/mp4",
              media_category: "tweet_video",
            }),
          }
        );
        if (!initRes.ok) {
          const err = await initRes.text();
          throw new Error(`Twitter media INIT error (${initRes.status}): ${err}`);
        }
        const initData = await initRes.json();
        const mediaId = initData.media_id_string;

        // APPEND in 5MB chunks
        const chunkSize = 5 * 1024 * 1024;
        const buf = Buffer.from(mediaBuffer);
        const totalChunks = Math.ceil(buf.length / chunkSize);
        for (let i = 0; i < totalChunks; i++) {
          await humanDelay(100, 400);
          const chunk = buf.subarray(i * chunkSize, (i + 1) * chunkSize);
          const appendRes = await resilientFetch(
            "https://upload.twitter.com/1.1/media/upload.json",
            {
              method: "POST",
              headers: {
                ...buildApiHeaders(apiKey),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                command: "APPEND",
                media_id: mediaId,
                segment_index: String(i),
                media_data: chunk.toString("base64"),
              }),
            }
          );
          if (!appendRes.ok) {
            const err = await appendRes.text();
            throw new Error(`Twitter media APPEND error (${appendRes.status}): ${err}`);
          }
        }

        // FINALIZE
        await humanDelay(200, 600);
        const finalRes = await resilientFetch(
          "https://upload.twitter.com/1.1/media/upload.json",
          {
            method: "POST",
            headers: {
              ...buildApiHeaders(apiKey),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              command: "FINALIZE",
              media_id: mediaId,
            }),
          }
        );
        if (!finalRes.ok) {
          const err = await finalRes.text();
          throw new Error(`Twitter media FINALIZE error (${finalRes.status}): ${err}`);
        }

        // Poll for processing completion
        let processing = true;
        let pollAttempts = 0;
        while (processing && pollAttempts < 30) {
          const statusRes = await resilientFetch(
            `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
            { headers: buildApiHeaders(apiKey) }
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const state = statusData.processing_info?.state;
            if (state === "succeeded" || !statusData.processing_info) {
              processing = false;
            } else if (state === "failed") {
              throw new Error(`Twitter video processing failed: ${JSON.stringify(statusData.processing_info.error)}`);
            } else {
              const waitSec = statusData.processing_info.check_after_secs || 5;
              await new Promise((r) => setTimeout(r, waitSec * 1000));
            }
          }
          pollAttempts++;
        }

        mediaIds.push(mediaId);
        break; // Twitter only allows 1 video per tweet
      } else {
        // Simple image upload via base64
        const uploadRes = await resilientFetch(
          "https://upload.twitter.com/1.1/media/upload.json",
          {
            method: "POST",
            headers: {
              ...buildApiHeaders(apiKey),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ media_data: base64 }),
          }
        );

        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          throw new Error(`Twitter media upload error (${uploadRes.status}): ${err}`);
        }

        const uploadData = await uploadRes.json();
        mediaIds.push(uploadData.media_id_string);
      }
    }

    if (mediaIds.length > 0) {
      tweetBody.media = { media_ids: mediaIds };
    }
  }

  await humanDelay(400, 1200);

  const res = await resilientFetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: buildApiHeaders(apiKey),
    body: JSON.stringify(tweetBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const tweetId = data.data?.id;

  return {
    success: true,
    externalId: tweetId,
    externalUrl: tweetId ? `https://x.com/i/status/${tweetId}` : undefined,
  };
}
