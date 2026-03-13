import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";

export async function publishToYoutube(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const accessToken = credential.password;

  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const description = [content.body, hashtagStr].filter(Boolean).join("\n\n");

  if (content.mediaUrls.length === 0) {
    throw new Error("YouTube publishing requires a video URL. Community posts are not yet supported.");
  }

  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title: content.title || "Untitled",
          description,
          tags: content.hashtags,
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API error (${res.status}): ${err}`);
  }

  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) {
    throw new Error("YouTube did not return an upload URL");
  }

  const videoRes = await fetch(content.mediaUrls[0]);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch video from ${content.mediaUrls[0]}`);
  }

  const videoBuffer = await videoRes.arrayBuffer();
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/*",
      "Content-Length": String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`YouTube upload error (${uploadRes.status}): ${err}`);
  }

  const data = await uploadRes.json();
  const videoId = data.id;

  return {
    success: true,
    externalId: videoId,
    externalUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
  };
}
