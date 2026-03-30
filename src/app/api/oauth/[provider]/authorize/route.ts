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

  // Generate state with embedded clientId
  const state = generateState(clientId, provider, codeVerifier);

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

  // Google needs access_type=offline for refresh token
  if (provider === "google") {
    authParams.set("access_type", "offline");
    authParams.set("prompt", "consent");
  }

  const authUrl = `${config.authUrl}?${authParams.toString()}`;
  return NextResponse.redirect(authUrl);
}
