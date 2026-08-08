import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runFullDryRun, cleanupDryRunRecords } from "@/lib/lifecycle/dry-run";

export const maxDuration = 300;

// POST /api/lifecycle/dry-run — walk a fake client + contractor through the
// full lifecycle with simulated time. No real emails, no kanban tasks.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const report = await runFullDryRun();
    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    console.error("[Lifecycle] Dry run failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Dry run failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/lifecycle/dry-run — remove the fake records
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  await cleanupDryRunRecords();
  return NextResponse.json({ success: true });
}
