/**
 * Token refresh logic for OAuth credentials.
 * Called by the daily cron and just-in-time before publishing.
 */

import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { refreshToken, exchangeMetaLongLivedToken, refreshInstagramToken } from "./utils";
import type { CredentialMeta } from "@/lib/social/types";
import { sendTelegramMessage } from "@/lib/telegram";
import { refreshThreadsToken } from "@/lib/social/platforms/threads";
import { notifyUser } from "@/lib/notifications";

/** Check if a credential's token is expiring within the given window */
function isExpiringSoon(expiryIso: string | null, windowMs: number): boolean {
  if (!expiryIso) return false;
  const expiry = new Date(expiryIso).getTime();
  return expiry - Date.now() < windowMs;
}

/** OAuth provider for a credential: the one recorded at connect time, else inferred from the platform name */
function credentialProvider(credential: { platform: string; meta?: unknown }): string | null {
  const recorded = (credential.meta as CredentialMeta | null)?.provider;
  return recorded || platformToProvider(credential.platform);
}

/** Map platform names to OAuth provider keys */
function platformToProvider(platform: string): string | null {
  const map: Record<string, string> = {
    INSTAGRAM: "meta",
    FACEBOOK: "meta",
    THREADS: "threads",
    TWITTER: "twitter",
    LINKEDIN: "linkedin",
    YOUTUBE: "google",
    TIKTOK: "tiktok",
  };
  return map[platform] || map[platform.toUpperCase()] || null;
}

/** Refresh a single credential's token. Returns true if refreshed. */
export async function refreshCredential(credentialId: string): Promise<boolean> {
  const credential = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!credential) return false;

  const provider = credentialProvider(credential);
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

    // A Meta token can only be exchanged while it's still valid. Once it has
    // expired no retry can work, so stop retrying and ask for a reconnect.
    if (credential.url && new Date(credential.url).getTime() < Date.now()) {
      await markNeedsReconnect(credential, "the Meta token expired before it could be renewed");
      return false;
    }

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
      const message = (err as Error).message;
      console.error(`[OAuth Refresh] Meta refresh failed for ${credentialId}:`, message);
      await prisma.activityLog.create({
        data: {
          clientId: credential.clientId,
          actor: "oauth",
          action: "credential_refresh_failed",
          details: `Failed to refresh ${credential.platform} token: ${message.slice(0, 300)}`,
        },
      }).catch(() => {});
      return false;
    }
  }

  // Instagram Login and Threads tokens extend themselves while still valid (no refresh token)
  if (provider === "instagram" || provider === "threads") {
    if (!ivData.password) return false;
    if (credential.url && new Date(credential.url).getTime() < Date.now()) {
      await markNeedsReconnect(credential, `the ${credential.platform} token expired before it could be renewed`);
      return false;
    }
    try {
      const accessToken = decrypt(credential.password, ivData.password);
      const newToken =
        provider === "threads" ? await refreshThreadsToken(accessToken) : await refreshInstagramToken(accessToken);
      const encrypted = encrypt(newToken.access_token);
      await prisma.credential.update({
        where: { id: credentialId },
        data: {
          password: encrypted.encrypted,
          iv: JSON.stringify({ ...ivData, password: encrypted.iv }),
          url: new Date(Date.now() + (newToken.expires_in || 60 * 24 * 60 * 60) * 1000).toISOString(),
          lastRotated: new Date(),
        },
      });
      return true;
    } catch (err) {
      const message = (err as Error).message;
      await prisma.activityLog.create({
        data: {
          clientId: credential.clientId,
          actor: "oauth",
          action: "credential_refresh_failed",
          details: `Failed to refresh ${credential.platform} token: ${message.slice(0, 300)}`,
        },
      }).catch(() => {});
      return false;
    }
  }

  // Standard OAuth refresh_token flow (Twitter, LinkedIn, Google, TikTok)
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

    const newIvData: Record<string, string | null> = { ...ivData, password: encryptedAccess.iv };

    // TikTok rotates refresh tokens and reports their lifetime
    if (newTokens.refresh_expires_in) {
      updateData.meta = {
        ...((credential.meta as CredentialMeta | null) || {}),
        refreshExpiresAt: new Date(Date.now() + newTokens.refresh_expires_in * 1000).toISOString(),
      };
    }

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
    const message = (err as Error).message;
    console.error(`[OAuth Refresh] ${provider} refresh failed for ${credentialId}:`, message);

    // invalid_grant means the refresh token itself is dead (revoked, expired,
    // or minted by an OAuth app still in Google's 7-day "Testing" mode).
    // Retrying every cron run can never succeed — clear the expiry stamp so
    // the cron stops picking this credential up, log once, and ping Chase.
    if (message.includes("invalid_grant")) {
      await markNeedsReconnect(credential, "the refresh token is no longer valid (invalid_grant)");
      return false;
    }

    await prisma.activityLog.create({
      data: {
        clientId: credential.clientId,
        actor: "oauth",
        action: "credential_refresh_failed",
        details: `Failed to refresh ${credential.platform} token: ${message}`,
      },
    }).catch(() => {});

    return false;
  }
}

/**
 * A connection can never recover on its own: clear the expiry stamp so crons
 * stop retrying it, log once, and notify the owners (in-app + Telegram).
 */
async function markNeedsReconnect(
  credential: { id: string; clientId: string; platform: string; label: string | null },
  reason: string
): Promise<void> {
  await prisma.credential.update({
    where: { id: credential.id },
    data: { url: null },
  }).catch(() => {});

  await prisma.activityLog.create({
    data: {
      clientId: credential.clientId,
      actor: "oauth",
      action: "credential_needs_reconnect",
      details: `${credential.platform} connection for ${credential.label || "account"} is dead (${reason}). Reconnect it from the client page (Connect Account). Auto-refresh retries stopped.`,
    },
  }).catch(() => {});

  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } }).catch(() => []);
  for (const owner of owners) {
    await notifyUser({
      userId: owner.id,
      type: "connection_problem",
      clientId: credential.clientId,
      title: `${credential.platform} connection needs a reconnect`,
      body: `${credential.label || "Account"}: ${reason}. Scheduled posts on it will fail until it's reconnected.`,
      link: `/clients/${credential.clientId}`,
    }).catch(() => {});
  }

  const chaseChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (chaseChatId) {
    await sendTelegramMessage(
      chaseChatId,
      `🔌 <b>${credential.platform}</b> connection (${credential.label || "account"}) is dead and needs a manual reconnect: open the client page and use Connect Account. If a YouTube connection dies again within a week, the Google OAuth app is still in Testing mode and needs to be published to Production in Google Cloud Console.`,
      "HTML"
    ).catch(() => {});
  }
}

/** Meta long-lived tokens must be renewed while still valid, so start a week out. */
const META_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Refresh credentials nearing expiry. Called by the 6-hourly cron. */
export async function refreshExpiringCredentials(): Promise<{ refreshed: number; failed: number }> {

  // Find credentials with expiry timestamps (stored in url field)
  const credentials = await prisma.credential.findMany({
    where: {
      url: { not: null },
    },
    select: { id: true, url: true, platform: true, meta: true },
  });

  let refreshed = 0;
  let failed = 0;

  for (const cred of credentials) {
    const provider = credentialProvider(cred);
    const windowMs =
      provider === "meta" || provider === "instagram" || provider === "threads" ? META_REFRESH_WINDOW_MS : DEFAULT_REFRESH_WINDOW_MS;
    if (!isExpiringSoon(cred.url, windowMs)) continue;

    const success = await refreshCredential(cred.id);
    if (success) refreshed++;
    else failed++;
  }

  return { refreshed, failed };
}

/** Just-in-time refresh — check if a credential needs refresh and do it. Returns true if a new token was written. */
export async function ensureFreshToken(credentialId: string): Promise<boolean> {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    select: { id: true, url: true },
  });

  if (!credential?.url) return false;

  // Refresh if expiring within 5 minutes
  if (isExpiringSoon(credential.url, 5 * 60 * 1000)) {
    return refreshCredential(credentialId);
  }
  return false;
}
