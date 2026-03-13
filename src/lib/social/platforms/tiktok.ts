import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";

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

  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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

  return {
    success: true,
    externalId: publishId,
    externalUrl: undefined,
  };
}
