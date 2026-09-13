import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { PENDING_COOKIE, loadPendingAccounts } from "@/lib/oauth/pending";

/**
 * GET — Read the pending Meta accounts this browser is choosing from.
 * Returns the discovered accounts (without the access token) for the picker UI.
 */
export async function GET() {
  // Team-only picker (clients connecting from onboarding never reach it)
  if (!(await getSession())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const pending = await loadPendingAccounts(cookieStore.get(PENDING_COOKIE)?.value).catch(() => null);

  if (!pending) {
    return NextResponse.json(
      { success: false, error: "No pending accounts. Please reconnect via OAuth." },
      { status: 400 }
    );
  }

  // Return accounts WITHOUT the access token (security)
  return NextResponse.json({
    success: true,
    clientId: pending.clientId,
    accounts: pending.accounts,
  });
}
