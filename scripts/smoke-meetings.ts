/**
 * One-shot smoke test + access backfill for the Meetings hub (2026-08-17).
 *
 * 1. Exercises the new Meeting/MeetingComment models and the Task.meetingId
 *    link end-to-end against the real DB, then removes its own test rows.
 * 2. Grants the new "meetings" tab to active members who have a restricted
 *    allowedPages list (empty list already means full access).
 *
 * Run: npx tsx scripts/smoke-meetings.ts
 */
import prisma from "../src/lib/prisma";

async function main() {
  const MARKER = "[smoke-test] Meetings hub check";

  // --- CRUD smoke ---
  const meeting = await prisma.meeting.create({
    data: {
      title: MARKER,
      notes: "temporary row — created and deleted by scripts/smoke-meetings.ts",
      transcript: "00:00 Test transcript line",
      status: "NEW",
      createdByName: "smoke-test",
    },
  });
  console.log("created meeting", meeting.id);

  const task = await prisma.task.create({
    data: {
      title: MARKER,
      status: "TODO",
      meetingId: meeting.id,
      tags: ["meeting"],
    },
  });
  console.log("created linked task", task.id);

  const comment = await prisma.meetingComment.create({
    data: { meetingId: meeting.id, authorName: "smoke-test", body: "test comment" },
  });
  console.log("created comment", comment.id);

  const loaded = await prisma.meeting.findUnique({
    where: { id: meeting.id },
    include: { tasks: true, comments: true, _count: { select: { tasks: true, comments: true } } },
  });
  if (!loaded || loaded.tasks.length !== 1 || loaded.comments.length !== 1) {
    throw new Error("relations did not round-trip");
  }
  console.log("relations OK:", loaded._count);

  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "IN_PROGRESS" } });

  // Deleting the meeting must cascade comments but keep the task (meetingId -> null)
  await prisma.meeting.delete({ where: { id: meeting.id } });
  const orphanTask = await prisma.task.findUnique({ where: { id: task.id } });
  if (!orphanTask || orphanTask.meetingId !== null) {
    throw new Error("task did not survive meeting deletion with meetingId nulled");
  }
  console.log("delete semantics OK (task survives, meetingId nulled)");
  await prisma.task.delete({ where: { id: task.id } });
  console.log("test rows cleaned up");

  // --- Access backfill ---
  const members = await prisma.user.findMany({
    where: { isActive: true, role: "MEMBER" },
    select: { id: true, name: true, allowedPages: true },
  });
  for (const m of members) {
    if (m.allowedPages.length === 0 || m.allowedPages.includes("meetings")) {
      console.log(`- ${m.name}: already has access`);
      continue;
    }
    await prisma.user.update({
      where: { id: m.id },
      data: { allowedPages: [...m.allowedPages, "meetings"] },
    });
    console.log(`- ${m.name}: granted "meetings" tab`);
  }

  console.log("ALL OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
