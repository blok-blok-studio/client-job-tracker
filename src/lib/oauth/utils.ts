/**
 * OAuth utilities: state management, PKCE, token exchange, credential storage.
 */

import crypto from "crypto";
import { encrypt } from "@/lib/encryption";
import prisma from "@/lib/prisma";
import { getProviderConfig, getRedirectUri, getClientCredentials } from "./config";

// ─── State & PKCE ─────────────────────────────────────────────────────────

export interface OAuthState {
  clientId: string;
  provider: string;
  codeVerifier?: string;
  returnTo?: string;
  nonce: string;
}

/** Generate a cryptographic state parameter that embeds clientId */
export function generateState(clientId: string, provider: string, codeVerifier?: string, returnTo?: string): string {
  const state: OAuthState = {
    clientId,
    provider,
    codeVerifier,
    returnTo,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/** Parse and validate state parameter */
export function parseState(stateParam: string): OAuthState | null {
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf-8");
    const state = JSON.parse(decoded) as OAuthState;
    if (!state.clientId || !state.provider || !state.nonce) return null;
    return state;
  } catch {
    return null;
  }
}

/** Generate PKCE code_verifier and code_challenge (S256) */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = hash.toString("base64url");
  return { codeVerifier, codeChallenge };
}

// ─── Token Exchange ───────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/** Exchange authorization code for tokens */
export async function exchangeCode(
  provider: string,
  code: string,
  codeVerifier?: string
): Promise<TokenResponse> {
  const config = getProviderConfig(provider);
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const { clientId, clientSecret } = getClientCredentials(config);
  const redirectUri = getRedirectUri(provider);

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (codeVerifier) {
    params.set("code_verifier", codeVerifier);
  }

  // Twitter requires Basic auth header instead of body params for client credentials
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (provider === "twitter") {
    headers["Authorization"] = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    params.delete("client_secret");
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${error}`);
  }

  return res.json();
}

/** Exchange Meta short-lived token for long-lived token (60 days) */
export async function exchangeMetaLongLivedToken(shortToken: string): Promise<TokenResponse> {
  const config = getProviderConfig("meta")!;
  const { clientId, clientSecret } = getClientCredentials(config);

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Long-lived token exchange failed: ${error}`);
  }

  return res.json();
}

/** Refresh an OAuth token using refresh_token grant */
export async function refreshToken(
  provider: string,
  currentRefreshToken: string
): Promise<TokenResponse> {
  const config = getProviderConfig(provider);
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const { clientId, clientSecret } = getClientCredentials(config);

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentRefreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (provider === "twitter") {
    headers["Authorization"] = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    params.delete("client_secret");
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${error}`);
  }

  return res.json();
}

// ─── Credential Storage ───────────────────────────────────────────────────

interface StoreCredentialParams {
  clientId: string;
  platform: string;
  label: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/** Normalize platform names for consistent display */
function normalizePlatform(platform: string): string {
  const map: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    threads: "Threads",
    twitter: "X (Twitter)",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    THREADS: "Threads",
    TWITTER: "X (Twitter)",
    LINKEDIN: "LinkedIn",
    YOUTUBE: "YouTube",
  };
  return map[platform] || platform;
}

/** Store OAuth tokens as encrypted credentials */
export async function storeOAuthCredential(params: StoreCredentialParams): Promise<string> {
  const { clientId, label, userId, accessToken, refreshToken: refreshTok, expiresAt } = params;
  const platform = normalizePlatform(params.platform);

  const encryptedUsername = encrypt(userId);
  const encryptedPassword = encrypt(accessToken);
  const encryptedNotes = refreshTok ? encrypt(refreshTok) : null;

  // Check for existing credential for this platform + client combo
  // Match by label too so different accounts (e.g. two IG accounts) don't overwrite each other
  const existing = await prisma.credential.findFirst({
    where: { clientId, platform, label },
  }) || await prisma.credential.findFirst({
    where: { clientId, platform },
  });

  if (existing) {
    // Update existing credential
    const ivData: Record<string, string | null> = {
      username: encryptedUsername.iv,
      password: encryptedPassword.iv,
      notes: encryptedNotes?.iv || null,
    };

    await prisma.credential.update({
      where: { id: existing.id },
      data: {
        username: encryptedUsername.encrypted,
        password: encryptedPassword.encrypted,
        notes: encryptedNotes?.encrypted || null,
        iv: JSON.stringify(ivData),
        label,
        url: expiresAt?.toISOString() || null,
        lastRotated: new Date(),
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId,
        actor: "oauth",
        action: "credential_reconnected",
        details: `Reconnected ${platform} account: ${label}`,
      },
    }).catch(() => {});

    return existing.id;
  }

  // Create new credential
  const credential = await prisma.credential.create({
    data: {
      clientId,
      platform,
      label,
      username: encryptedUsername.encrypted,
      password: encryptedPassword.encrypted,
      notes: encryptedNotes?.encrypted || null,
      url: expiresAt?.toISOString() || null,
      iv: JSON.stringify({
        username: encryptedUsername.iv,
        password: encryptedPassword.iv,
        notes: encryptedNotes?.iv || null,
      }),
      lastRotated: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      clientId,
      actor: "oauth",
      action: "credential_connected",
      details: `Connected ${platform} account: ${label}`,
    },
  }).catch(() => {});

  return credential.id;
}

// ─── Meta Account Discovery ──────────────────────────────────────────────

interface MetaAccount {
  platform: string;
  userId: string;
  label: string;
}

/** Fetch Instagram, Facebook Page, and Threads accounts from Meta token */
export async function discoverMetaAccounts(accessToken: string): Promise<MetaAccount[]> {
  const accounts: MetaAccount[] = [];

  // Fetch Facebook Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${accessToken}`
  );

  if (pagesRes.ok) {
    const pagesData = await pagesRes.json();
    for (const page of pagesData.data || []) {
      // Facebook Page
      accounts.push({
        platform: "Facebook",
        userId: page.id,
        label: page.name,
      });

      // Instagram Business Account (linked to page)
      if (page.instagram_business_account) {
        const igId = page.instagram_business_account.id;
        const igUsername = page.instagram_business_account.username || page.name;
        accounts.push({
          platform: "Instagram",
          userId: igId,
          label: `@${igUsername}`,
        });
      }
    }
  }

  // Fetch Threads user ID
  const threadsRes = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`
  );
  if (threadsRes.ok) {
    const threadsData = await threadsRes.json();
    if (threadsData.id) {
      accounts.push({
        platform: "Threads",
        userId: threadsData.id,
        label: `@${threadsData.username || "threads"}`,
      });
    }
  }

  return accounts;
}
