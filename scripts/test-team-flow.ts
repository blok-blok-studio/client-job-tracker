/**
 * Smoke test for the team flow: job roles, tab presets, assignment, and the
 * data the personal home / workload panel read.
 *
 *   npm run dev
 *   npx tsx scripts/test-team-flow.ts
 */
import prisma from "../src/lib/prisma";
import { createSessionToken } from "../src/lib/auth";
import { TEAM_ROLES, pagesForRole } from "../src/lib/team-roles";
import { VALID_PAGES } from "../src/lib/page-access";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const EMAIL = "zz-team-flow@blokblokstudio.test";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, extra ?? "");
  }
}

async function main() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.task.deleteMany({ where: { title: { startsWith: "ZZ flow task" } } });

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("No OWNER user found");
  const cookie = `bb_session=${createSessionToken({
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
  })}`;

  console.log("\n1. Role presets are internally consistent");
  for (const r of TEAM_ROLES) {
    check(
      `${r.label}: every preset tab is a real page`,
      r.pages.every((p) => VALID_PAGES.includes(p)),
      r.pages.filter((p) => !VALID_PAGES.includes(p))
    );
  }
  check("Owner/Operator means unrestricted", pagesForRole("owner-operator").length === 0);
  check("Developer preset includes the board and the vault", pagesForRole("full-stack-dev").includes("kanban") && pagesForRole("full-stack-dev").includes("vault"));
  check("Strategist preset includes content and newsletter", pagesForRole("marketing-strategist").includes("content") && pagesForRole("marketing-strategist").includes("newsletter"));
  check("Creative preset includes files and deliverables", pagesForRole("creative-director").includes("files") && pagesForRole("creative-director").includes("deliverables"));

  console.log("\n2. Creating a member with a job role sets their tabs");
  const created = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: "ZZ Flow Tester",
      email: EMAIL,
      password: "temp-password-123",
      role: "MEMBER",
      jobRole: "creative-director",
    }),
  });
  const createdJson = await created.json();
  check("member created", created.ok, createdJson);
  const userId: string = createdJson.user.id;
  check("job role stored", createdJson.user.jobRole === "creative-director", createdJson.user.jobRole);
  check(
    "tabs match the creative preset",
    JSON.stringify(createdJson.user.allowedPages) === JSON.stringify(pagesForRole("creative-director")),
    createdJson.user.allowedPages
  );

  console.log("\n3. Changing role re-applies the preset, and hand edits still win");
  const changed = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ jobRole: "full-stack-dev", applyRolePreset: true }),
  });
  check("role changed", changed.ok);
  const devUser = await prisma.user.findUnique({ where: { id: userId } });
  check("tabs switched to the developer preset", JSON.stringify(devUser?.allowedPages) === JSON.stringify(pagesForRole("full-stack-dev")), devUser?.allowedPages);

  await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ allowedPages: ["kanban", "money"] }),
  });
  const handEdited = await prisma.user.findUnique({ where: { id: userId } });
  check("hand-picked tabs override the preset", handEdited?.allowedPages.join(",") === "kanban,money", handEdited?.allowedPages);
  check("job role survives a tab edit", handEdited?.jobRole === "full-stack-dev");

  const roleOnly = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ jobRole: "producer", applyRolePreset: false }),
  });
  check("role can change without touching tabs", roleOnly.ok);
  const kept = await prisma.user.findUnique({ where: { id: userId } });
  check("tabs untouched when no preset applied", kept?.allowedPages.join(",") === "kanban,money", kept?.allowedPages);

  const bogusRole = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ jobRole: "chief-vibes-officer" }),
  });
  check("unknown job role rejected", bogusRole.status === 400, bogusRole.status);

  console.log("\n4. Assignment is picked from real accounts");
  const assignable = await fetch(`${BASE}/api/users/assignable`, { headers: { cookie } });
  const assignableJson = await assignable.json();
  check("assignable list available to any member", assignable.ok && assignableJson.success);
  check(
    "assignable list carries names, colours and job roles",
    assignableJson.data.every((u: Record<string, unknown>) => "name" in u && "color" in u && "jobRole" in u)
  );
  check("the new member is assignable", assignableJson.data.some((u: { name: string }) => u.name === "ZZ Flow Tester"));

  const task = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ title: "ZZ flow task", status: "TODO", assignedTo: "ZZ Flow Tester" }),
  });
  const taskJson = await task.json();
  check("task created with an assignee", task.ok && taskJson.success, taskJson);
  const taskId: string = taskJson.data.id;

  console.log("\n5. The personal home reads what it needs");
  const tasksRes = await fetch(`${BASE}/api/tasks`, { headers: { cookie } });
  const tasksJson = await tasksRes.json();
  const mine = (tasksJson.data as Array<{ assignedTo: string | null; status: string }>).filter(
    (t) => t.assignedTo?.toLowerCase() === "zz flow tester" && t.status !== "DONE"
  );
  check("assigned task shows up for that person", mine.length === 1, mine.length);
  check(
    "task payload carries what My Work renders",
    tasksJson.data.every((t: Record<string, unknown>) => "title" in t && "dueDate" in t && "priority" in t && "assignedTo" in t)
  );

  const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
  const meJson = await me.json();
  check("/me exposes the job role for the greeting", "jobRole" in meJson.user, meJson.user);

  console.log("\n6. Case differences don't hide work");
  await prisma.task.update({ where: { id: taskId }, data: { assignedTo: "zz flow tester" } });
  const tasks2 = await (await fetch(`${BASE}/api/tasks`, { headers: { cookie } })).json();
  const mineLower = (tasks2.data as Array<{ assignedTo: string | null; status: string }>).filter(
    (t) => t.assignedTo?.toLowerCase() === "zz flow tester" && t.status !== "DONE"
  );
  check("lowercase legacy assignee still matches", mineLower.length === 1, mineLower.length);

  console.log("\nCleaning up…");
  await prisma.task.deleteMany({ where: { title: { startsWith: "ZZ flow task" } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.activityLog.deleteMany({ where: { details: { contains: "ZZ flow task" } } });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.task.deleteMany({ where: { title: { startsWith: "ZZ flow task" } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  process.exit(1);
});
