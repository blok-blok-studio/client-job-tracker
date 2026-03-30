import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProviderConfig } from "@/lib/oauth/config";
import {
  parseState,
  exchangeCode,
  exchangeMetaLongLivedToken,
  storeOAuthCredential,
  discoverMetaAccounts,
} from "@/lib/oauth/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Handle user denial
  if (error) {
    return NextResponse.redirect(`${baseUrl}/content?oauth_error=${encodeURIComponent(error)}`);
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

  try {
    // Exchange code for tokens
    const tokenData = await exchangeCode(provider, code, state.codeVerifier);

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    if (provider === "meta") {
      return await handleMetaCallback(state.clientId, tokenData.access_token, expiresAt, baseUrl);
    }

    // For other providers, fetch user info and store credential
    return await handleStandardCallback(
      provider,
      config,
      state.clientId,
      tokenData,
      expiresAt,
      baseUrl
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    console.error(`[OAuth ${provider}] Callback error:`, message);
    return NextResponse.redirect(
      `${baseUrl}/clients/${state.clientId}?oauth_error=${encodeURIComponent("Connection failed. Please try again.")}`
    );
  }
}

async function handleMetaCallback(
  clientId: string,
  shortLivedToken: string,
  _expiresAt: Date | undefined,
  baseUrl: string
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
      `${baseUrl}/clients/${clientId}?oauth_error=${encodeURIComponent("No business accounts found. Make sure you have an Instagram Business/Creator account linked to a Facebook Page.")}`
    );
  }

  // Store credentials for each discovered account
  for (const account of accounts) {
    await storeOAuthCredential({
      clientId,
      platform: account.platform,
      label: account.label,
      userId: account.userId,
      accessToken,
      expiresAt,
    });
  }

  const platformNames = accounts.map((a) => a.platform).join(", ");
  return NextResponse.redirect(
    `${baseUrl}/clients/${clientId}?oauth_success=${encodeURIComponent(`Connected: ${platformNames}`)}`
  );
}

async function handleStandardCallback(
  provider: string,
  config: { userinfoUrl?: string; platforms: string[] },
  clientId: string,
  tokenData: { access_token: string; refresh_token?: string; expires_in?: number },
  expiresAt: Date | undefined,
  baseUrl: string
): Promise<NextResponse> {
  const platform = config.platforms[0];
  let userId = "unknown";
  let label = platform;

  // Fetch user info
  if (config.userinfoUrl) {
    try {
      const userinfoRes = await fetch(config.userinfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();

        switch (provider) {
          case "twitter": {
            const data = userinfo.data || userinfo;
            userId = data.id || userId;
            label = data.username ? `@${data.username}` : data.name || label;
            break;
          }
          case "linkedin": {
            userId = userinfo.sub || userId;
            label = userinfo.name || userinfo.given_name || label;
            break;
          }
          case "google": {
            const channel = userinfo.items?.[0];
            if (channel) {
              userId = channel.id || userId;
              label = channel.snippet?.title || label;
            }
            break;
          }
          case "threads": {
            userId = userinfo.id || userId;
            label = userinfo.username ? `@${userinfo.username}` : label;
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
  });

  return NextResponse.redirect(
    `${baseUrl}/clients/${clientId}?oauth_success=${encodeURIComponent(`Connected ${platform}: ${label}`)}`
  );
}
