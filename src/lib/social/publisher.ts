import type { ContentPost, Credential } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { publishToTwitter } from "./platforms/twitter";
import { publishToInstagram } from "./platforms/instagram";
import { publishToLinkedin } from "./platforms/linkedin";
import { publishToFacebook } from "./platforms/facebook";
import { publishToTiktok } from "./platforms/tiktok";
import { publishToYoutube } from "./platforms/youtube";

/** Strip tokens/keys from error messages to prevent credential leakage in logs */
export function sanitizePublishError(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/access_token[=:]\s*[^\s,}&]*/gi, "access_token=[REDACTED]")
    .replace(/token[=:]\s*["']?[A-Za-z0-9\-._~+/]{20,}["']?/gi, "token=[REDACTED]")
    .replace(/key[=:]\s*["']?[A-Za-z0-9\-._~+/]{20,}["']?/gi, "key=[REDACTED]");
}

export interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

export interface PostContent {
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
}

export interface DecryptedCredential {
  username: string;
  password: string;
  notes: string | null;
}

function findCredential(credentials: Credential[], platform: string): Credential | undefined {
  const platformMap: Record<string, string[]> = {
    INSTAGRAM: ["instagram", "meta", "facebook"],
    FACEBOOK: ["facebook", "meta"],
    TWITTER: ["twitter", "x", "x.com"],
    LINKEDIN: ["linkedin"],
    TIKTOK: ["tiktok"],
    YOUTUBE: ["youtube", "google"],
  };

  const aliases = platformMap[platform] || [platform.toLowerCase()];
  return credentials.find((c) =>
    aliases.some((alias) => c.platform.toLowerCase().includes(alias))
  );
}

function decryptCredential(credential: Credential): DecryptedCredential {
  const ivData: Record<string, string | null> = JSON.parse(credential.iv);
  if (!ivData.username || !ivData.password) {
    throw new Error("Credential data corrupted — missing IV fields");
  }
  return {
    username: decrypt(credential.username, ivData.username),
    password: decrypt(credential.password, ivData.password),
    notes: credential.notes && ivData.notes ? decrypt(credential.notes, ivData.notes) : null,
  };
}

export async function publishPost(
  post: ContentPost & { credentialId?: string | null },
  credentials: Credential[]
): Promise<PublishResult> {
  // If a specific credential is linked, use it directly
  const credential = post.credentialId
    ? credentials.find((c) => c.id === post.credentialId) || findCredential(credentials, post.platform)
    : findCredential(credentials, post.platform);

  if (!credential) {
    throw new Error(`No ${post.platform} credentials found for this client. Add credentials in the Vault.`);
  }

  const decrypted = decryptCredential(credential);

  const content: PostContent = {
    title: post.title || "",
    body: post.body || "",
    hashtags: post.hashtags,
    mediaUrls: post.mediaUrls,
  };

  switch (post.platform) {
    case "TWITTER":
      return publishToTwitter(content, decrypted);
    case "INSTAGRAM":
      return publishToInstagram(content, decrypted);
    case "LINKEDIN":
      return publishToLinkedin(content, decrypted);
    case "FACEBOOK":
      return publishToFacebook(content, decrypted);
    case "TIKTOK":
      return publishToTiktok(content, decrypted);
    case "YOUTUBE":
      return publishToYoutube(content, decrypted);
    default:
      throw new Error(`Unsupported platform: ${post.platform}`);
  }
}
