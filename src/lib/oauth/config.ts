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
  /** Name of the app-id query/body param (TikTok calls it client_key) */
  clientIdParam?: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  meta: {
    name: "Meta",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments", // first comment
      "instagram_manage_insights", // post analytics
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts", // publish to Pages (text, photos, video)
      "business_management", // Pages owned through a Business portfolio
    ],
    scopeSeparator: ",",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    usePKCE: false,
    // Threads needs its own OAuth (the "threads" provider): a Facebook Login
    // token can't call graph.threads.net.
    platforms: ["INSTAGRAM", "FACEBOOK"],
  },
  // Instagram API with Instagram Login: Business/Creator accounts sign in with
  // Instagram directly, no Facebook Page needed. Separate app id/secret from the
  // Meta (Facebook Login) app — find them under the app's Instagram product.
  instagram: {
    name: "Instagram",
    authUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_insights",
    ],
    scopeSeparator: ",",
    clientIdEnv: "INSTAGRAM_APP_ID",
    clientSecretEnv: "INSTAGRAM_APP_SECRET",
    usePKCE: false,
    userinfoUrl: "https://graph.instagram.com/v23.0/me?fields=user_id,username,name,profile_picture_url,account_type",
    platforms: ["INSTAGRAM"],
  },
  tiktok: {
    name: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.profile", "video.publish", "video.upload", "video.list"],
    scopeSeparator: ",",
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    usePKCE: false,
    userinfoUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username",
    platforms: ["TIKTOK"],
    clientIdParam: "client_key",
  },
  threads: {
    name: "Threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    // Only what threads.ts actually calls: identify the profile, and publish.
    // threads_manage_replies and threads_manage_insights were requested here but
    // never used - the Threads adapter has no reply and no insights code, and
    // there is no Threads panel in the composer, so there is no first comment
    // either. Asking a user to grant scopes the app never calls is a policy
    // problem on its own, separate from App Review. Add them back the same day
    // the features land, not before.
    scopes: ["threads_basic", "threads_content_publish"],
    scopeSeparator: ",",
    clientIdEnv: "THREADS_APP_ID",
    clientSecretEnv: "THREADS_APP_SECRET",
    usePKCE: false,
    userinfoUrl: "https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url",
    platforms: ["THREADS"],
  },
  twitter: {
    name: "X (Twitter)",
    authUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
    scopeSeparator: " ",
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    usePKCE: true,
    userinfoUrl: "https://api.x.com/2/users/me",
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
      "https://www.googleapis.com/auth/youtube.force-ssl", // playlists + thumbnails
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
