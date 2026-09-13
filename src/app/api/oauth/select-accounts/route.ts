import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { findExistingOwners, saveDiscoveredMetaAccounts } from "@/lib/oauth/meta-accounts";
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

    // Only save accounts that were selected (matched by `platform:userId`),
    // never one that's already connected to a different client
    const selected = pending.accounts.filter((account) => selectedIds.includes(`${account.platform}:${account.userId}`));
    const owners = await findExistingOwners(selected);
    const skipped: string[] = [];
    const allowed = selected.filter((account) => {
      const owner = owners.get(`${account.platform}:${account.userId}`);
      if (owner && owner.clientId !== pending.clientId) {
        skipped.push(`${account.label} (already connected to ${owner.clientName})`);
        return false;
      }
      return true;
    });
    const savedPlatforms = await saveDiscoveredMetaAccounts(
      pending.clientId,
      pending.accessToken,
      new Date(pending.expiresAt),
      allowed
    );

    // Clear the pending cookie
    cookieStore.delete(PENDING_COOKIE);
    await deletePendingAccounts(pendingId);

    return NextResponse.json({
      success: true,
      connected: savedPlatforms,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save accounts";
    console.error("[OAuth Select] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
