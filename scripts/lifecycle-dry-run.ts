/**
 * Runs the fake-client lifecycle dry run against the database and prints the
 * resulting timeline. No real emails, no kanban tasks — dry-run records only.
 *
 *   npx tsx scripts/lifecycle-dry-run.ts            # run and keep records (visible in the UI)
 *   npx tsx scripts/lifecycle-dry-run.ts --cleanup  # remove dry-run records afterwards
 */
import { runFullDryRun, cleanupDryRunRecords } from "../src/lib/lifecycle/dry-run";

async function main() {
  console.log("Running lifecycle dry run (no real emails will be sent)…\n");
  const report = await runFullDryRun();
  const t0 = report.t0.getTime();
  const day = (d: Date) => `day ${String(Math.round((d.getTime() - t0) / 86400000)).padStart(3)}`;

  console.log("=== Simulated events ===");
  for (const e of report.events) console.log(`  day ${String(e.day).padStart(3)}  ${e.action}`);

  console.log("\n=== Resulting timeline (all scheduled steps) ===");
  const pad = (s: string | null | undefined, n: number) => String(s ?? "").padEnd(n).slice(0, n);
  console.log(
    `  ${pad("when", 8)} ${pad("who", 11)} ${pad("seq", 4)} ${pad("step", 16)} ${pad("kind", 6)} ${pad("status", 10)} ${pad("dry", 4)} detail`
  );
  for (const s of report.timeline) {
    const detail =
      s.status === "CANCELLED"
        ? `cancelled: ${s.cancelReason}`
        : s.subjectOrTitle || "";
    console.log(
      `  ${pad(day(s.scheduledFor), 8)} ${pad(s.record, 11)} ${pad(s.sequenceKey, 4)} ${pad(s.stepKey, 16)} ${pad(s.kind, 6)} ${pad(s.status, 10)} ${pad(s.dryRun ? "yes" : "", 4)} ${detail}`
    );
  }

  console.log("\n=== Acceptance checks ===");
  let failed = 0;
  for (const a of report.assertions) {
    console.log(`  ${a.pass ? "PASS" : "FAIL"}  ${a.name}  (${a.detail})`);
    if (!a.pass) failed++;
  }
  console.log(`\nReal emails delivered: ${report.emailsDelivered}`);

  if (process.argv.includes("--cleanup")) {
    await cleanupDryRunRecords();
    console.log("Dry-run records removed.");
  } else {
    console.log("Dry-run records kept — view the fake client's timeline in the portal.");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
