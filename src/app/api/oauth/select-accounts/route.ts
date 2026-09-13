import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { saveDiscoveredMetaAccounts } from "@/lib/oauth/meta-accounts";

/**
 * POST — Finalize Meta OAuth account selection.
 * The OAuth callback stores discovered accounts in a short-lived httpOnly cookie.
 * This route reads that cookie, saves only the selected accounts, and clears it.
 */
export async function POST(request: NextRequest) {
  // The picker is a team page; clients connecting from onboarding skip it
  if (!(await getSession())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

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
      accounts: { platform: string; userId: string; label: string; avatarUrl?: string }[];
    };

    const { selectedIds } = await request.json() as { selectedIds: string[] };

    if (!selectedIds || selectedIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No accounts selected" },
        { status: 400 }
      );
    }

    // Only save accounts that were selected (matched by `platform:userId`)
    const savedPlatforms = await saveDiscoveredMetaAccounts(
      pending.clientId,
      pending.accessToken,
      new Date(pending.expiresAt),
      pending.accounts.filter((account) => selectedIds.includes(`${account.platform}:${account.userId}`))
    );

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
