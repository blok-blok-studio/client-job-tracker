import path from "node:path";
import crypto from "node:crypto";
import { config as loadEnv } from "dotenv";

// Creates (or resets) the login Meta's App Review team uses to test the app.
//
//   npx tsx scripts/create-meta-reviewer.ts            dry run
//   npx tsx scripts/create-meta-reviewer.ts --apply    creates, prints the password once
//
// Meta requires working credentials in the submission so a reviewer can complete
// the OAuth flow themselves. Scoped as tightly as the app allows: MEMBER role
// and allowedPages ["content"], so the reviewer sees the Connections tab and the
// composer - the two screens the permissions are actually about - and not
// clients, files, money, contracts, meetings or the vault.
//
// Re-running with --apply issues a NEW password and prints it. The old one stops
// working, so only do that if the password was lost or the review is over.
//
// When review is finished, disable it:
//   UPDATE "User" SET "isActive" = false WHERE email = 'appreview@blokblokstudio.com';

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const APPLY = process.argv.includes("--apply");

// --youtube creates the separate login for the YouTube API Services audit team
// (same scope, own password, so one review ending never breaks the other).
// Both addresses are listed in src/lib/reviewer-accounts.ts, which is what lets
// them past the mandatory two-factor screen.
const YOUTUBE = process.argv.includes("--youtube");

const EMAIL = YOUTUBE ? "ytreview@blokblokstudio.com" : "appreview@blokblokstudio.com";
const NAME = YOUTUBE ? "YouTube API Review" : "Meta App Review";
const PAGES = ["content"];

/** 24 chars from an unambiguous alphabet - a reviewer may retype this by hand. */
function makePassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(24);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, name: true, role: true, isActive: true, allowedPages: true },
  });

  if (!APPLY) {
    console.log("DRY RUN - nothing will be written\n");
    if (existing) {
      console.log(`  would RESET the password for ${EMAIL}`);
      console.log(`  current: role=${existing.role} active=${existing.isActive} pages=[${existing.allowedPages.join(", ")}]`);
      console.log(`  would set pages=[${PAGES.join(", ")}]`);
    } else {
      console.log(`  would CREATE ${EMAIL}`);
      console.log(`  role=MEMBER  pages=[${PAGES.join(", ")}]`);
    }
    console.log("\nre-run with --apply");
    return;
  }

  const password = makePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      name: NAME,
      passwordHash,
      role: "MEMBER",
      allowedPages: PAGES,
      jobRole: null,
      isActive: true,
    },
    update: {
      name: NAME,
      passwordHash,
      role: "MEMBER",
      allowedPages: PAGES,
      isActive: true,
    },
    select: { id: true, email: true },
  });

  console.log(`${existing ? "RESET" : "CREATED"} ${user.email}\n`);
  console.log(YOUTUBE ? "  Send these to the YouTube API Services team:" : "  Paste these into the Meta App Review submission:");
  console.log(`    URL:      https://app.blokblokstudio.com/login`);
  console.log(`    Email:    ${EMAIL}`);
  console.log(`    Password: ${password}`);
  console.log("\n  This password is shown once and is not stored anywhere in plain text.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
