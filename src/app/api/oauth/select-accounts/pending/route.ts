import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET — Read pending Meta accounts from httpOnly cookie.
 * Returns the discovered accounts (without the access token) for the picker UI.
 */
export async function GET() {
  const cookieStore = await cookies();
  const pendingCookie = cookieStore.get("oauth_pending_accounts")?.value;

  if (!pendingCookie) {
    return NextResponse.json(
      { success: false, error: "No pending accounts. Please reconnect via OAuth." },
      { status: 400 }
    );
  }

  try {
    const pending = JSON.parse(Buffer.from(pendingCookie, "base64url").toString("utf-8")) as {
      clientId: string;
      accessToken: string;
      expiresAt: string;
      accounts: { platform: string; userId: string; label: string }[];
    };

    // Return accounts WITHOUT the access token (security)
    return NextResponse.json({
      success: true,
      clientId: pending.clientId,
      accounts: pending.accounts,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to parse pending accounts" },
      { status: 500 }
    );
  }
}
