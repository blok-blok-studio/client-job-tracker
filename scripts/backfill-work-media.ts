import path from "node:path";
import { config as loadEnv } from "dotenv";

// Lists client-tagged Work uploads (videos, photos, audio) in the media
// gallery, for files uploaded before the Work routes started doing it
// themselves. Adds gallery rows only: nothing is changed or removed, and a
// file the gallery already has is skipped, so it is safe to run twice.
//
//   npx tsx scripts/backfill-work-media.ts          (dry run, prints the plan)
//   npx tsx scripts/backfill-work-media.ts --apply
//
// Thumbnails and playback copies are filled in afterwards by the 6-hourly
// cron and by the Files page itself.

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

async function main() {
  const apply = process.argv.includes("--apply");
  const { default: prisma } = await import("../src/lib/prisma");
  const { galleryMediaType, mirrorWorkFileToMedia } = await import("../src/lib/work-media");

  const work = await prisma.contractorWorkFile.findMany({
    where: { clientId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      clientId: true, clientName: true, uploadedBy: true, filename: true, url: true,
      fileSize: true, mimeType: true, note: true, createdAt: true,
    },
  });

  let added = 0;
  for (const w of work) {
    if (!w.clientId) continue;
    const label = `${w.clientName} / ${w.uploadedBy} / ${w.filename}`;
    if (!galleryMediaType(w.mimeType, w.filename)) {
      console.log(`skip (not media)      ${label}`);
      continue;
    }
    const existing = await prisma.clientMedia.findFirst({ where: { url: w.url }, select: { id: true } });
    if (existing) {
      console.log(`skip (already listed) ${label}`);
      continue;
    }
    if (!apply) {
      console.log(`would add             ${label}`);
      added++;
      continue;
    }
    const media = await mirrorWorkFileToMedia({
      clientId: w.clientId,
      url: w.url,
      filename: w.filename,
      mimeType: w.mimeType,
      fileSize: w.fileSize,
      folder: `From ${w.uploadedBy}`,
      notes: w.note,
      createdAt: w.createdAt,
    });
    if (media) {
      console.log(`added                 ${label}`);
      added++;
    }
  }
  console.log(`\n${apply ? "added" : "would add"} ${added} of ${work.length} client-tagged work files`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit());
