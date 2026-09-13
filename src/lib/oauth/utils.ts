/**
 * OAuth utilities: state management, PKCE, token exchange, credential storage.
 */

import crypto from "crypto";
import { encrypt } from "@/lib/encryption";
import prisma from "@/lib/prisma";
import { getProviderConfig, getRedirectUri, getClientCredentials } from "./config";
import type { CredentialMeta } from "@/lib/social/types";

// ─── State & PKCE ─────────────────────────────────────────────────────────

export interface OAuthState {
  clientId: string;
  provider: string;
  codeVerifier?: string;
  returnTo?: string;
  /** Started from a client's onboarding link (no team session) */
  viaOnboard?: boolean;
  nonce: string;
}

/** Generate a cryptographic state parameter that embeds clientId */
export function generateState(
  clientId: string,
  provider: string,
  codeVerifier?: string,
  returnTo?: string,
  viaOnboard?: boolean
): string {
  const state: OAuthState = {
    clientId,
    provider,
    codeVerifier,
    returnTo,
    viaOnboard: viaOnboard || undefined,
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
  /** TikTok */
  open_id?: string;
  refresh_expires_in?: number;
  scope?: string;
  /** Instagram Login */
  user_id?: string | number;
}

/**
 * TikTok returns HTTP 200 with an error body, and Instagram's short-lived
 * exchange wraps the token in data[]. Normalize both to TokenResponse.
 */
function normalizeTokenBody(provider: string, body: Record<string, unknown>): TokenResponse {
  if (provider === "tiktok" && (body.error || !body.access_token)) {
    throw new Error(`Token request failed: ${String(body.error_description || body.error || "no access_token")}`);
  }
  if (provider === "instagram" && Array.isArray(body.data) && body.data[0]) {
    return body.data[0] as TokenResponse;
  }
  return body as unknown as TokenResponse;
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
    [config.clientIdParam || "client_id"]: clientId,
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

  return normalizeTokenBody(provider, await res.json());
}

/** Instagram Login: swap the 1-hour token for a 60-day one. */
export async function exchangeInstagramLongLivedToken(shortToken: string): Promise<TokenResponse> {
  const config = getProviderConfig("instagram")!;
  const { clientSecret } = getClientCredentials(config);
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: clientSecret,
    access_token: shortToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params}`);
  if (!res.ok) {
    throw new Error(`Instagram long-lived token exchange failed: ${await res.text()}`);
  }
  return res.json();
}

/** Instagram Login: extend a still-valid long-lived token by another 60 days. */
export async function refreshInstagramToken(longLivedToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: longLivedToken });
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
  if (!res.ok) {
    throw new Error(`Instagram token refresh failed: ${await res.text()}`);
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
    [config.clientIdParam || "client_id"]: clientId,
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

  return normalizeTokenBody(provider, await res.json());
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
  /** Non-secret connection details (see CredentialMeta) */
  meta?: CredentialMeta;
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
    tiktok: "TikTok",
    TIKTOK: "TikTok",
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

  // Reconnecting the same account updates its row; a different account on the
  // same platform gets its own row. Match on the platform account id when we
  // have it (labels can change), else on the label. The old "any row for this
  // platform" fallback overwrote a client's second account.
  const meta: CredentialMeta = { ...params.meta, accountId: params.meta?.accountId || userId };
  const existing =
    (await prisma.credential.findFirst({
      where: { clientId, platform, meta: { path: ["accountId"], equals: meta.accountId } },
    })) ||
    (await prisma.credential.findFirst({
      where: { clientId, platform, label },
    }));

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
        meta: meta as object,
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
      meta: meta as object,
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
  avatarUrl?: string;
}

/**
 * Fetch the Facebook Pages and their linked Instagram accounts a Meta
 * (Facebook Login) token can manage. Threads isn't discovered here: it has its
 * own OAuth provider. Page tokens aren't put in the pending cookie (size limit);
 * select-accounts fetches them for the Pages that get picked.
 */
export async function discoverMetaAccounts(accessToken: string): Promise<MetaAccount[]> {
  const accounts: MetaAccount[] = [];

  // Fetch Facebook Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture{url},instagram_business_account{id,username,profile_picture_url}&limit=100&access_token=${accessToken}`
  );

  if (pagesRes.ok) {
    const pagesData = await pagesRes.json();
    for (const page of pagesData.data || []) {
      // Facebook Page
      accounts.push({
        platform: "Facebook",
        userId: page.id,
        label: page.name,
        avatarUrl: page.picture?.data?.url,
      });

      // Instagram Business Account (linked to page)
      if (page.instagram_business_account) {
        const igId = page.instagram_business_account.id;
        const igUsername = page.instagram_business_account.username || page.name;
        accounts.push({
          platform: "Instagram",
          userId: igId,
          label: `@${igUsername}`,
          avatarUrl: page.instagram_business_account.profile_picture_url,
        });
      }
    }
  }

  return accounts;
}
