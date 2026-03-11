import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Default Agent Config
  await prisma.agentConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      isActive: true,
      runIntervalMins: 30,
      autoAssign: true,
      autoRemind: true,
      autoReport: true,
      allowedActions: [
        "create_task",
        "move_task",
        "send_reminder",
        "generate_report",
        "flag_overdue",
        "log_note",
        "suggest_action",
        "reply_support_ticket",
      ],
      claudeModel: "claude-sonnet-4-20250514",
      maxTokens: 4096,
    },
  });

  console.log("Seed complete!");
  console.log(`  - Default agent config`);
  console.log(`  - No clients, tasks, or invoices (clean slate)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
