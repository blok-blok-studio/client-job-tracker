import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";
import { resilientFetch, buildApiHeaders, humanDelay } from "../http";

export async function publishToTiktok(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;

  if (content.mediaUrls.length === 0) {
    throw new Error("TikTok requires a video URL to publish");
  }

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const title = [content.body || content.title, hashtagStr].filter(Boolean).join(" ").slice(0, 150);

  const headers = buildApiHeaders(accessToken);

  await humanDelay(300, 800);

  const initRes = await resilientFetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers,
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: content.mediaUrls[0],
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`TikTok API error (${initRes.status}): ${err}`);
  }

  const data = await initRes.json();
  const publishId = data.data?.publish_id;

  // Poll for publish completion
  if (publishId) {
    let pollAttempts = 0;
    while (pollAttempts < 15) {
      await humanDelay(5000, 8000);

      const statusRes = await resilientFetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ publish_id: publishId }),
        }
      );

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const status = statusData.data?.status;
        if (status === "PUBLISH_COMPLETE") {
          return {
            success: true,
            externalId: publishId,
            externalUrl: undefined,
          };
        } else if (status === "FAILED") {
          const failReason = statusData.data?.fail_reason || "Unknown";
          throw new Error(`TikTok publish failed: ${failReason}`);
        }
      }
      pollAttempts++;
    }
  }

  return {
    success: true,
    externalId: publishId,
    externalUrl: undefined,
  };
}
