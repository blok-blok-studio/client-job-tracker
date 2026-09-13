import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProviderConfig } from "@/lib/oauth/config";
import type { CredentialMeta } from "@/lib/social/types";
import {
  parseState,
  exchangeCode,
  exchangeMetaLongLivedToken,
  exchangeInstagramLongLivedToken,
  storeOAuthCredential,
  discoverMetaAccounts,
} from "@/lib/oauth/utils";
import { exchangeThreadsLongLivedToken } from "@/lib/social/platforms/threads";
import { getSession } from "@/lib/auth";
import { safeReturnTo, withParam } from "@/lib/oauth/access";
import { saveDiscoveredMetaAccounts } from "@/lib/oauth/meta-accounts";
import { PENDING_COOKIE, savePendingAccounts } from "@/lib/oauth/pending";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Handle user denial: send them back where they started (a client lands on
  // their onboarding page, not the team login)
  if (error) {
    const deniedState = stateParam ? parseState(stateParam) : null;
    const back = safeReturnTo(deniedState?.returnTo, `${baseUrl}/content`);
    return NextResponse.redirect(withParam(back, "oauth_error", error));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${baseUrl}/content?oauth_error=missing_params`);
  }

  // Validate state against cookie (CSRF protection)
  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;

  if (!storedState || storedState !== stateParam) {
    return NextResponse.redirect(`${baseUrl}/content?oauth_error=invalid_state`);
  }

  // Clear the state cookie
  cookieStore.delete("oauth_state");

  const state = parseState(stateParam);
  if (!state || state.provider !== provider) {
    return NextResponse.redirect(`${baseUrl}/content?oauth_error=state_mismatch`);
  }

  const config = getProviderConfig(provider);
  if (!config) {
    return NextResponse.redirect(`${baseUrl}/content?oauth_error=unknown_provider`);
  }

  // The state matched the httpOnly cookie our authorize route set, and that
  // route only sets it for a team session or a valid client onboarding token.
  // Still require one of the two here.
  const session = await getSession();
  if (!session && !state.viaOnboard) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  try {
    // Exchange code for tokens
    let tokenData = await exchangeCode(provider, code, state.codeVerifier);

    // Instagram Login hands back a 1-hour token; trade it for the 60-day one
    if (provider === "instagram") {
      const longLived = await exchangeInstagramLongLivedToken(tokenData.access_token);
      tokenData = { ...longLived, user_id: tokenData.user_id };
    }

    // Threads also starts with a 1-hour token; the 60-day one is refreshable
    if (provider === "threads") {
      const longLived = await exchangeThreadsLongLivedToken(tokenData.access_token);
      tokenData = { ...longLived, user_id: tokenData.user_id };
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    const redirectBase = safeReturnTo(state.returnTo, `${baseUrl}/clients/${state.clientId}`);

    if (provider === "meta") {
      return await handleMetaCallback(state.clientId, tokenData.access_token, expiresAt, redirectBase, !!state.viaOnboard);
    }

    // For other providers, fetch user info and store credential
    return await handleStandardCallback(
      provider,
      config,
      state.clientId,
      tokenData,
      expiresAt,
      redirectBase
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    console.error(`[OAuth ${provider}] Callback error:`, message);
    const errorRedirect = safeReturnTo(state.returnTo, `${baseUrl}/clients/${state.clientId}`);
    return NextResponse.redirect(withParam(errorRedirect, "oauth_error", "Connection failed. Please try again."));
  }
}

async function handleMetaCallback(
  clientId: string,
  shortLivedToken: string,
  _expiresAt: Date | undefined,
  redirectBase: string,
  viaOnboard: boolean
): Promise<NextResponse> {
  // Exchange for long-lived token (60 days)
  const longLived = await exchangeMetaLongLivedToken(shortLivedToken);
  const accessToken = longLived.access_token;
  const expiresAt = longLived.expires_in
    ? new Date(Date.now() + longLived.expires_in * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // Default 60 days

  // Discover all connected accounts (Instagram, Facebook Pages, Threads)
  const accounts = await discoverMetaAccounts(accessToken);

  if (accounts.length === 0) {
    return NextResponse.redirect(
      withParam(
        redirectBase,
        "oauth_error",
        "No business accounts found. Make sure you have an Instagram Business/Creator account linked to a Facebook Page."
      )
    );
  }

  // A client connecting from their onboarding link has no team session, so
  // the in-app account picker isn't available to them. They just approved
  // these exact accounts on Facebook's own consent screen: save them all.
  if (viaOnboard) {
    const saved = await saveDiscoveredMetaAccounts(clientId, accessToken, expiresAt, accounts);
    return NextResponse.redirect(withParam(redirectBase, "oauth_success", `Connected ${saved.join(", ")}`));
  }

  // Hold the discovered accounts server-side (only an id goes in the cookie)
  // and send the team member to the account picker
  const pendingId = await savePendingAccounts({ clientId, accessToken, expiresAt: expiresAt.toISOString(), accounts });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pickerUrl = `${baseUrl}/oauth/select-accounts?clientId=${clientId}&returnTo=${encodeURIComponent(redirectBase)}`;

  const cookieStore = await cookies();
  cookieStore.set(PENDING_COOKIE, pendingId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes to complete selection
    path: "/",
  });

  return NextResponse.redirect(pickerUrl);
}

async function handleStandardCallback(
  provider: string,
  config: { userinfoUrl?: string; platforms: string[] },
  clientId: string,
  tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    refresh_expires_in?: number;
    scope?: string;
    user_id?: string | number;
  },
  expiresAt: Date | undefined,
  redirectBase: string
): Promise<NextResponse> {
  const platform = config.platforms[0];
  let userId = "unknown";
  let label = platform;
  const meta: CredentialMeta = {
    provider,
    scopes: tokenData.scope ? tokenData.scope.split(/[ ,]+/).filter(Boolean) : undefined,
  };

  // Fetch user info
  if (provider === "tiktok" && tokenData.open_id) userId = tokenData.open_id;
  if (provider === "tiktok" && tokenData.refresh_expires_in) {
    meta.refreshExpiresAt = new Date(Date.now() + tokenData.refresh_expires_in * 1000).toISOString();
  }

  if (config.userinfoUrl) {
    try {
      // Instagram's and Threads' graph APIs take the token as a query param
      const userinfoUrl =
        provider === "instagram" || provider === "threads"
          ? `${config.userinfoUrl}&access_token=${encodeURIComponent(tokenData.access_token)}`
          : config.userinfoUrl;
      const userinfoRes = await fetch(userinfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();

        switch (provider) {
          case "twitter": {
            const data = userinfo.data || userinfo;
            userId = data.id || userId;
            label = data.username ? `@${data.username}` : data.name || label;
            meta.username = data.username;
            meta.displayName = data.name;
            break;
          }
          case "linkedin": {
            userId = userinfo.sub || userId;
            label = userinfo.name || userinfo.given_name || label;
            meta.displayName = userinfo.name;
            meta.avatarUrl = userinfo.picture;
            break;
          }
          case "google": {
            const channel = userinfo.items?.[0];
            if (channel) {
              userId = channel.id || userId;
              label = channel.snippet?.title || label;
              meta.username = channel.snippet?.customUrl;
              meta.avatarUrl = channel.snippet?.thumbnails?.default?.url;
            }
            break;
          }
          case "tiktok": {
            // TikTok wraps the profile in data.user and reports errors in-body
            const user = userinfo.data?.user;
            if (user) {
              userId = user.open_id || tokenData.open_id || userId;
              label = user.username ? `@${user.username}` : user.display_name || label;
              meta.username = user.username;
              meta.displayName = user.display_name;
              meta.avatarUrl = user.avatar_url;
            }
            break;
          }
          case "instagram": {
            userId = String(userinfo.user_id || tokenData.user_id || userId);
            label = userinfo.username ? `@${userinfo.username}` : label;
            meta.username = userinfo.username;
            meta.displayName = userinfo.name;
            meta.avatarUrl = userinfo.profile_picture_url;
            meta.apiHost = "graph.instagram.com";
            break;
          }
          case "threads": {
            userId = String(userinfo.id || tokenData.user_id || userId);
            label = userinfo.username ? `@${userinfo.username}` : label;
            meta.username = userinfo.username;
            meta.avatarUrl = userinfo.threads_profile_picture_url;
            break;
          }
        }
      }
    } catch (err) {
      console.error(`[OAuth ${provider}] Userinfo fetch failed:`, err);
    }
  }

  await storeOAuthCredential({
    clientId,
    platform,
    label,
    userId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    meta: { ...meta, accountId: userId },
  });

  return NextResponse.redirect(withParam(redirectBase, "oauth_success", `Connected ${platform}: ${label}`));
}
