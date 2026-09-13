/**
 * Saving the Facebook Pages / Instagram accounts a Meta login discovered,
 * shared by the team account picker and the client onboarding flow.
 */

import { storeOAuthCredential } from "@/lib/oauth/utils";

export interface DiscoveredMetaAccount {
  platform: string;
  userId: string;
  label: string;
  avatarUrl?: string;
}

async function fetchPageToken(pageId: string, userToken: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ fields: "access_token", access_token: userToken });
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}?${params}`);
    const json = await res.json();
    return res.ok && typeof json.access_token === "string" ? json.access_token : null;
  } catch {
    return null;
  }
}

/** Store the given accounts; returns "Platform (label)" for each one saved. */
export async function saveDiscoveredMetaAccounts(
  clientId: string,
  userAccessToken: string,
  expiresAt: Date,
  accounts: DiscoveredMetaAccount[]
): Promise<string[]> {
  const saved: string[] = [];
  for (const account of accounts) {
    // Threads rows from older pending cookies: Threads connects on its own now
    if (account.platform === "Threads") continue;
    // Facebook Pages publish with a PAGE token. One derived from the
    // long-lived user token doesn't expire, so no expiry is stored for it.
    const pageToken = account.platform === "Facebook" ? await fetchPageToken(account.userId, userAccessToken) : null;
    await storeOAuthCredential({
      clientId,
      platform: account.platform,
      label: account.label,
      userId: account.userId,
      accessToken: pageToken || userAccessToken,
      expiresAt: pageToken ? undefined : expiresAt,
      meta: {
        provider: "meta",
        accountId: account.userId,
        username: account.label.replace(/^@/, ""),
        avatarUrl: account.avatarUrl,
        apiHost: "graph.facebook.com",
      },
    });
    saved.push(`${account.platform} (${account.label})`);
  }
  return saved;
}
