import path from "node:path";
import { config as loadEnv } from "dotenv";

// Read-only. Names only, so meeting action items can be attached to the right
// client without guessing. The duplicate guard on client creation is email-only,
// so a near-miss on a name silently makes a second client - look before writing.
//
// src/lib/prisma builds its client at module load, and ES imports are hoisted
// above this file's statements, so the env has to be loaded before it is
// imported - hence the dynamic import inside main().

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, company: true, type: true, role: true },
    orderBy: { name: "asc" },
  });
  console.log(`clients (${clients.length}):`);
  for (const client of clients) {
    console.log(
      `  ${client.id}  ${client.type.padEnd(8)} ${client.role.padEnd(10)} ${client.name}` +
        (client.company ? `  (${client.company})` : "")
    );
  }

  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } });
  console.log(`\nusers (${users.length}):`);
  for (const user of users) {
    console.log(`  ${user.role.padEnd(12)} ${user.name}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
