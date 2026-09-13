import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { saveDiscoveredMetaAccounts } from "@/lib/oauth/meta-accounts";
import { PENDING_COOKIE, deletePendingAccounts, loadPendingAccounts } from "@/lib/oauth/pending";

/**
 * POST — Finalize Meta OAuth account selection.
 * The OAuth callback holds the discovered accounts server-side (id in a cookie).
 * This route saves only the selected accounts, then clears the pending entry.
 */
export async function POST(request: NextRequest) {
  // The picker is a team page; clients connecting from onboarding skip it
  if (!(await getSession())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const pendingId = cookieStore.get(PENDING_COOKIE)?.value;
  const pending = await loadPendingAccounts(pendingId).catch(() => null);

  if (!pending) {
    return NextResponse.json(
      { success: false, error: "No pending accounts. Please reconnect via OAuth." },
      { status: 400 }
    );
  }

  try {
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
    cookieStore.delete(PENDING_COOKIE);
    await deletePendingAccounts(pendingId);

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
