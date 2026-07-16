import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Owner account — provisioned from env so the first login works.
  // Password source: OWNER_PASSWORD (plaintext) or AUTH_PASSWORD_HASH (bcrypt).
  const ownerEmail = (process.env.OWNER_EMAIL || "chase@blokblokstudio.com")
    .trim()
    .toLowerCase();
  const ownerName = process.env.OWNER_NAME || "Chase";
  const ownerPasswordHash = process.env.OWNER_PASSWORD
    ? bcrypt.hashSync(process.env.OWNER_PASSWORD, 12)
    : process.env.AUTH_PASSWORD_HASH;

  if (ownerPasswordHash) {
    await prisma.user.upsert({
      where: { email: ownerEmail },
      update: {},
      create: {
        email: ownerEmail,
        name: ownerName,
        passwordHash: ownerPasswordHash,
        role: "OWNER",
      },
    });
    console.log(`  - Owner user: ${ownerEmail}`);
  } else {
    console.log(
      "  - Skipped owner user (set OWNER_PASSWORD or AUTH_PASSWORD_HASH). The app will bootstrap the owner on first login instead."
    );
  }

  console.log("Seed complete!");
  console.log(`  - No clients, tasks, or invoices (clean slate)`);
  console.log(`  - Add more team members from the Team page in the app.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
