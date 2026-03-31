/**
 * OAuth provider configuration.
 * Each provider defines auth URLs, token URLs, scopes, and how to extract user info.
 */

export interface OAuthProviderConfig {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Whether this provider requires PKCE (code_challenge) */
  usePKCE: boolean;
  /** Endpoint to fetch user profile after token exchange */
  userinfoUrl?: string;
  /** Platforms this provider covers (for credential creation) */
  platforms: string[];
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  meta: {
    name: "Meta",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_messages",
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
    ],
    scopeSeparator: ",",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    usePKCE: false,
    platforms: ["INSTAGRAM", "FACEBOOK", "THREADS"],
  },
  threads: {
    name: "Threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_manage_insights",
    ],
    scopeSeparator: ",",
    clientIdEnv: "THREADS_APP_ID",
    clientSecretEnv: "THREADS_APP_SECRET",
    usePKCE: false,
    userinfoUrl: "https://graph.threads.net/v1.0/me?fields=id,username",
    platforms: ["THREADS"],
  },
  twitter: {
    name: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
    scopeSeparator: " ",
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    usePKCE: true,
    userinfoUrl: "https://api.twitter.com/2/users/me",
    platforms: ["TWITTER"],
  },
  linkedin: {
    name: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["w_member_social", "openid", "profile", "email"],
    scopeSeparator: " ",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    usePKCE: false,
    userinfoUrl: "https://api.linkedin.com/v2/userinfo",
    platforms: ["LINKEDIN"],
  },
  google: {
    name: "YouTube",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    scopeSeparator: " ",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    usePKCE: false,
    userinfoUrl: "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    platforms: ["YOUTUBE"],
  },
};

export function getProviderConfig(provider: string): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[provider.toLowerCase()] || null;
}

export function getRedirectUri(provider: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/api/oauth/${provider}/callback`;
}

export function getClientCredentials(config: OAuthProviderConfig): { clientId: string; clientSecret: string } {
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(`Missing OAuth credentials: ${config.clientIdEnv} or ${config.clientSecretEnv}`);
  }
  return { clientId, clientSecret };
}
