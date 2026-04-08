import { NextRequest, NextResponse } from "next/server";
import { getProviderConfig, getRedirectUri, getClientCredentials } from "@/lib/oauth/config";
import { generateState, generatePKCE } from "@/lib/oauth/utils";
import { cookies } from "next/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const clientId = request.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const config = getProviderConfig(provider);
  if (!config) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  let oauthClientId: string;
  try {
    const creds = getClientCredentials(config);
    oauthClientId = creds.clientId;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth not configured" },
      { status: 500 }
    );
  }

  // Generate PKCE for providers that need it
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (config.usePKCE) {
    const pkce = generatePKCE();
    codeVerifier = pkce.codeVerifier;
    codeChallenge = pkce.codeChallenge;
  }

  // Generate state with embedded clientId and optional returnTo
  const returnTo = request.nextUrl.searchParams.get("returnTo") || undefined;
  const state = generateState(clientId, provider, codeVerifier, returnTo);

  // Store state in httpOnly cookie for CSRF validation on callback
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // Must be lax for cross-site redirect
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // Build authorization URL
  const redirectUri = getRedirectUri(provider);
  const authParams = new URLSearchParams({
    client_id: oauthClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(config.scopeSeparator),
    state,
  });

  // Add PKCE params
  if (codeChallenge) {
    authParams.set("code_challenge", codeChallenge);
    authParams.set("code_challenge_method", "S256");
  }

  // Provider-specific params to force re-authentication. Without these, each
  // provider will silently reuse the browser's existing session and auto-sign
  // the user into whichever account they last used — making it impossible to
  // connect a different account for a different client. Every provider has a
  // different mechanism for forcing account selection.
  switch (provider) {
    case "google":
      // access_type=offline is required for refresh tokens.
      // prompt=consent forces the consent screen; select_account shows the
      // Google account picker so the user can choose which account to use.
      authParams.set("access_type", "offline");
      authParams.set("prompt", "consent select_account");
      break;
    case "meta":
      // Facebook/Instagram: auth_type=reauthenticate forces the user to
      // re-enter their password, which lets them switch accounts.
      authParams.set("auth_type", "reauthenticate");
      break;
    case "threads":
      // Threads uses the same Meta auth infrastructure.
      authParams.set("auth_type", "reauthenticate");
      break;
    case "twitter":
      // Twitter/X OAuth 2.0 doesn't officially support prompt=login, but
      // passing force_login nudges the flow to show the login screen when
      // possible. See logout wrapper below for the stronger guarantee.
      authParams.set("force_login", "true");
      break;
    case "linkedin":
      // LinkedIn ignores prompt=login entirely — handled via logout redirect
      // below.
      break;
  }

  const authUrl = `${config.authUrl}?${authParams.toString()}`;

  // For providers that don't honor re-auth query params, wrap the authorize
  // URL in the provider's logout redirect so the browser session is cleared
  // first, forcing the login page on the next hop.
  if (provider === "linkedin") {
    const logoutUrl = `https://www.linkedin.com/m/logout/?session_redirect=${encodeURIComponent(authUrl)}`;
    return NextResponse.redirect(logoutUrl);
  }

  return NextResponse.redirect(authUrl);
}
