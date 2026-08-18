import prisma from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, allowedPages: true },
  });
  for (const u of users) {
    if (u.allowedPages.length > 0 && !u.allowedPages.includes("work")) {
      await prisma.user.update({
        where: { id: u.id },
        data: { allowedPages: [...u.allowedPages, "work"] },
      });
      console.log(`Granted work tab: ${u.name}`);
    } else {
      console.log(`No change (${u.allowedPages.length === 0 ? "all pages" : "already has it"}): ${u.name}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
