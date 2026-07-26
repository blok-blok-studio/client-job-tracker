/**
 * Sends a demo deliverable through the real production pipeline so the whole
 * per-item review flow can be seen end to end: linked kanban card in
 * In Review, Slack ping, review email, and the public /review/[token] page
 * with carousels, per-item marking, and comment threads.
 *
 * Uses a dedicated test client (email = chase@) so no real client is pinged.
 *
 *   npx tsx --env-file=.env scripts/send-test-deliverable.ts
 */
import { randomBytes } from "crypto";
import prisma from "../src/lib/prisma";
import { notifySlackDeliverableSent } from "../src/lib/slack";
import { sendDeliverableReviewEmail } from "../src/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

async function main() {
  // Test client — reused if it already exists, never a real client
  let client = await prisma.client.findFirst({
    where: { name: "BB Test Client" },
    select: { id: true, name: true, email: true },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: "BB Test Client",
        email: "chase@blokblokstudio.com",
        company: "Blok Blok Studio (internal)",
        type: "PROSPECT",
        notes: "Internal test client for trying out flows — safe to delete.",
      },
      select: { id: true, name: true, email: true },
    });
    console.log("Created test client:", client.id);
  } else {
    console.log("Reusing test client:", client.id);
  }

  const title = "Test — August content batch";
  const message =
    "This is a test deliverable so you can try the new per-item review. " +
    "Swipe through each carousel, Approve or Request changes on every item " +
    "(try leaving a note on one), then hit Submit at the bottom.";
  const files = [
    // "Carousel 1" — a 3-slide set
    ...[1, 2, 3].map((n) => ({
      url: `https://picsum.photos/seed/bbtest${n}/1080/1350`,
      filename: `slide-${n}.jpg`,
      fileSize: 250_000,
      mimeType: "image/jpeg",
      folder: "Carousel 1",
    })),
    // "Reel" — a sample video
    {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      filename: "reel-draft.mp4",
      fileSize: 2_500_000,
      mimeType: "video/mp4",
      folder: "Reel",
    },
    // A document at root — shows doc-row marking
    {
      url: "https://pdfobject.com/pdf/sample.pdf",
      filename: "caption-copy.pdf",
      fileSize: 20_000,
      mimeType: "application/pdf",
      folder: null,
    },
  ];

  const deliverable = await prisma.deliverable.create({
    data: {
      clientId: client.id,
      token: randomBytes(24).toString("base64url"),
      title,
      message,
      content:
        "Caption for slide set:\n\n“Building brands block by block 🧱 Here's what August looks like.”\n\n#blokblok #contentstudio",
      createdBy: "Chase",
      files: { create: files.map((f, i) => ({ ...f, sortOrder: i })) },
    },
  });
  console.log("Created deliverable:", deliverable.id);

  // Linked kanban card in In Review — same as the real route
  const task = await prisma.task.create({
    data: {
      clientId: client.id,
      title: `Client review: ${title}`,
      description: `Waiting on ${client.name} to review "${title}" (${files.length} files).\n\nReview link: ${APP_URL}/review/${deliverable.token}`,
      status: "IN_REVIEW",
      priority: "MEDIUM",
      category: "CONTENT_CREATION",
      tags: ["client-review"],
      assignedTo: "Chase",
    },
  });
  await prisma.deliverable.update({ where: { id: deliverable.id }, data: { taskId: task.id } });
  console.log("Linked kanban card:", task.id);

  let emailed = false;
  if (client.email) {
    try {
      await sendDeliverableReviewEmail({
        to: client.email,
        clientName: client.name,
        title,
        message,
        reviewUrl: `${APP_URL}/review/${deliverable.token}`,
      });
      emailed = true;
      console.log("Review email sent to", client.email);
    } catch (err) {
      console.error("Email failed:", err);
    }
  }

  await notifySlackDeliverableSent({
    title,
    clientName: client.name,
    clientId: client.id,
    fileCount: files.length,
    sentBy: "Chase",
    emailed,
  }).catch((err) => console.error("Slack failed:", err));
  console.log("Slack notified");

  console.log("\n──────────────────────────────────────────────");
  console.log("Review page:  ", `${APP_URL}/review/${deliverable.token}`);
  console.log("Client page:  ", `${APP_URL}/clients/${client.id}`);
  console.log("Kanban board: ", `${APP_URL}/kanban?task=${task.id}`);
  console.log("──────────────────────────────────────────────");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
