/**
 * Token refresh logic for OAuth credentials.
 * Called by the daily cron and just-in-time before publishing.
 */

import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { refreshToken, exchangeMetaLongLivedToken } from "./utils";

/** Check if a credential's token is expiring within the given window */
function isExpiringSoon(expiryIso: string | null, windowMs: number): boolean {
  if (!expiryIso) return false;
  const expiry = new Date(expiryIso).getTime();
  return expiry - Date.now() < windowMs;
}

/** Map platform names to OAuth provider keys */
function platformToProvider(platform: string): string | null {
  const map: Record<string, string> = {
    Instagram: "meta",
    Facebook: "meta",
    Threads: "meta",
    TWITTER: "twitter",
    LINKEDIN: "linkedin",
    YOUTUBE: "google",
  };
  return map[platform] || null;
}

/** Refresh a single credential's token. Returns true if refreshed. */
export async function refreshCredential(credentialId: string): Promise<boolean> {
  const credential = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!credential) return false;

  const provider = platformToProvider(credential.platform);
  if (!provider) return false;

  // Parse IV data
  let ivData: Record<string, string | null>;
  try {
    ivData = JSON.parse(credential.iv);
  } catch {
    return false;
  }

  // Meta tokens don't use refresh_token — they exchange the access token for a new long-lived one
  if (provider === "meta") {
    if (!ivData.password) return false;
    const accessToken = decrypt(credential.password, ivData.password);

    try {
      const newToken = await exchangeMetaLongLivedToken(accessToken);
      const encrypted = encrypt(newToken.access_token);
      const expiresAt = newToken.expires_in
        ? new Date(Date.now() + newToken.expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      await prisma.credential.update({
        where: { id: credentialId },
        data: {
          password: encrypted.encrypted,
          iv: JSON.stringify({ ...ivData, password: encrypted.iv }),
          url: expiresAt.toISOString(),
          lastRotated: new Date(),
        },
      });

      return true;
    } catch (err) {
      console.error(`[OAuth Refresh] Meta refresh failed for ${credentialId}:`, (err as Error).message);
      return false;
    }
  }

  // Standard OAuth refresh_token flow (Twitter, LinkedIn, Google)
  if (!credential.notes || !ivData.notes) return false; // No refresh token stored

  const currentRefreshToken = decrypt(credential.notes, ivData.notes);

  try {
    const newTokens = await refreshToken(provider, currentRefreshToken);
    const encryptedAccess = encrypt(newTokens.access_token);

    const updateData: Record<string, unknown> = {
      password: encryptedAccess.encrypted,
      url: newTokens.expires_in
        ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
        : credential.url,
      lastRotated: new Date(),
    };

    const newIvData = { ...ivData, password: encryptedAccess.iv };

    // If a new refresh token was issued, update it
    if (newTokens.refresh_token) {
      const encryptedRefresh = encrypt(newTokens.refresh_token);
      updateData.notes = encryptedRefresh.encrypted;
      newIvData.notes = encryptedRefresh.iv;
    }

    updateData.iv = JSON.stringify(newIvData);

    await prisma.credential.update({
      where: { id: credentialId },
      data: updateData,
    });

    await prisma.activityLog.create({
      data: {
        clientId: credential.clientId,
        actor: "oauth",
        action: "credential_refreshed",
        details: `Auto-refreshed ${credential.platform} token for ${credential.label || "account"}`,
      },
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error(`[OAuth Refresh] ${provider} refresh failed for ${credentialId}:`, (err as Error).message);

    await prisma.activityLog.create({
      data: {
        clientId: credential.clientId,
        actor: "oauth",
        action: "credential_refresh_failed",
        details: `Failed to refresh ${credential.platform} token: ${(err as Error).message}`,
      },
    }).catch(() => {});

    return false;
  }
}

/** Refresh all credentials expiring within 24 hours. Called by daily cron. */
export async function refreshExpiringCredentials(): Promise<{ refreshed: number; failed: number }> {
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours

  // Find credentials with expiry timestamps (stored in url field)
  const credentials = await prisma.credential.findMany({
    where: {
      url: { not: null },
    },
    select: { id: true, url: true, platform: true },
  });

  let refreshed = 0;
  let failed = 0;

  for (const cred of credentials) {
    if (!isExpiringSoon(cred.url, windowMs)) continue;

    const success = await refreshCredential(cred.id);
    if (success) refreshed++;
    else failed++;
  }

  return { refreshed, failed };
}

/** Just-in-time refresh — check if a credential needs refresh and do it. */
export async function ensureFreshToken(credentialId: string): Promise<void> {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    select: { id: true, url: true },
  });

  if (!credential?.url) return;

  // Refresh if expiring within 5 minutes
  if (isExpiringSoon(credential.url, 5 * 60 * 1000)) {
    await refreshCredential(credentialId);
  }
}
