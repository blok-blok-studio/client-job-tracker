import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { storeOAuthCredential } from "@/lib/oauth/utils";

/**
 * POST — Finalize Meta OAuth account selection.
 * The OAuth callback stores discovered accounts in an encrypted cookie.
 * This route reads that cookie, saves only the selected accounts, and clears it.
 */
export async function POST(request: NextRequest) {
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

    const { selectedIds } = await request.json() as { selectedIds: string[] };

    if (!selectedIds || selectedIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No accounts selected" },
        { status: 400 }
      );
    }

    // Only save accounts that were selected (matched by `platform:userId`)
    const savedPlatforms: string[] = [];
    for (const account of pending.accounts) {
      const accountKey = `${account.platform}:${account.userId}`;
      if (selectedIds.includes(accountKey)) {
        await storeOAuthCredential({
          clientId: pending.clientId,
          platform: account.platform,
          label: account.label,
          userId: account.userId,
          accessToken: pending.accessToken,
          expiresAt: new Date(pending.expiresAt),
        });
        savedPlatforms.push(`${account.platform} (${account.label})`);
      }
    }

    // Clear the pending cookie
    cookieStore.delete("oauth_pending_accounts");

    return NextResponse.json({
      success: true,
      connected: savedPlatforms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save accounts";
    console.error("[OAuth Select] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
