import type { DecryptedCredential, PostContent, PublishResult } from "../publisher";

export async function publishToTwitter(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  const apiKey = credential.password;

  // Build tweet text: body + hashtags
  const hashtagStr = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const tweetText = [content.body, hashtagStr].filter(Boolean).join("\n\n").slice(0, 280);

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: tweetText }),
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
