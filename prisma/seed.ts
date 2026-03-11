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
      ],
      claudeModel: "claude-sonnet-4-20250514",
      maxTokens: 4096,
    },
  });

  // Sample Clients
  const kofi = await prisma.client.create({
    data: {
      name: "Kofi Boateng",
      email: "kofi@boatengfitness.com",
      company: "Boateng Fitness",
      type: "ACTIVE",
      tier: "VIP",
      source: "Instagram DM",
      industry: "Fitness",
      monthlyRetainer: 3500,
      contractStart: new Date("2025-09-01"),
      contractEnd: new Date("2026-09-01"),
      timezone: "Europe/Berlin",
      notes: "High-profile fitness influencer in Berlin. Manages LinkedIn + Instagram presence. Very responsive.",
      checklistItems: {
        create: [
          { label: "Contract signed", checked: true, sortOrder: 0 },
          { label: "Onboarding call completed", checked: true, sortOrder: 1 },
          { label: "Credentials received", checked: true, sortOrder: 2 },
          { label: "Content calendar created", checked: true, sortOrder: 3 },
          { label: "First deliverable sent", checked: true, sortOrder: 4 },
          { label: "Payment method confirmed", checked: true, sortOrder: 5 },
        ],
      },
      contacts: {
        create: [
          { name: "Kofi Boateng", role: "CEO / Owner", email: "kofi@boatengfitness.com", phone: "+49 170 1234567", isPrimary: true },
          { name: "Amara N.", role: "Assistant", email: "amara@boatengfitness.com", isPrimary: false },
        ],
      },
    },
  });

  const prospect = await prisma.client.create({
    data: {
      name: "Sarah Chen",
      email: "sarah@techvault.io",
      company: "TechVault",
      type: "PROSPECT",
      tier: "STANDARD",
      source: "Cold outreach",
      industry: "SaaS",
      timezone: "America/New_York",
      notes: "Met at Web Summit Berlin. Interested in brand strategy and social media management.",
      checklistItems: {
        create: [
          { label: "Contract signed", checked: false, sortOrder: 0 },
          { label: "Onboarding call completed", checked: false, sortOrder: 1 },
          { label: "Credentials received", checked: false, sortOrder: 2 },
          { label: "Content calendar created", checked: false, sortOrder: 3 },
          { label: "First deliverable sent", checked: false, sortOrder: 4 },
          { label: "Payment method confirmed", checked: false, sortOrder: 5 },
        ],
      },
    },
  });

  const pastClient = await prisma.client.create({
    data: {
      name: "Marcus Reid",
      email: "marcus@reidconsulting.com",
      company: "Reid Consulting",
      type: "PAST",
      tier: "STANDARD",
      source: "Referral",
      industry: "Finance",
      monthlyRetainer: 2000,
      contractStart: new Date("2025-01-01"),
      contractEnd: new Date("2025-12-31"),
      timezone: "Europe/London",
      notes: "6-month engagement for LinkedIn strategy. Contract ended naturally.",
      checklistItems: {
        create: [
          { label: "Contract signed", checked: true, sortOrder: 0 },
          { label: "Onboarding call completed", checked: true, sortOrder: 1 },
          { label: "Credentials received", checked: true, sortOrder: 2 },
          { label: "Content calendar created", checked: true, sortOrder: 3 },
          { label: "First deliverable sent", checked: true, sortOrder: 4 },
          { label: "Payment method confirmed", checked: true, sortOrder: 5 },
        ],
      },
    },
  });

  // Sample Tasks
  const now = new Date();
  const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  await prisma.task.createMany({
    data: [
      {
        clientId: kofi.id,
        title: "Create March content calendar",
        description: "Design and schedule 20 posts for March across Instagram and LinkedIn",
        status: "IN_PROGRESS",
        priority: "HIGH",
        category: "CONTENT_CREATION",
        dueDate: inDays(3),
        assignedTo: "agent",
        sortOrder: 0,
        tags: ["content", "monthly"],
      },
      {
        clientId: kofi.id,
        title: "LinkedIn article: Fitness Tech Trends 2026",
        status: "TODO",
        priority: "MEDIUM",
        category: "CONTENT_CREATION",
        dueDate: inDays(7),
        assignedTo: "chase",
        sortOrder: 1,
        tags: ["linkedin", "article"],
      },
      {
        clientId: kofi.id,
        title: "Review Instagram analytics Q1",
        status: "BACKLOG",
        priority: "LOW",
        category: "REPORTING",
        dueDate: inDays(14),
        assignedTo: "agent",
        sortOrder: 2,
        tags: ["analytics", "quarterly"],
      },
      {
        clientId: prospect.id,
        title: "Send proposal to TechVault",
        status: "TODO",
        priority: "HIGH",
        category: "CLIENT_COMMS",
        dueDate: inDays(2),
        assignedTo: "chase",
        sortOrder: 0,
        tags: ["proposal", "prospect"],
      },
      {
        clientId: prospect.id,
        title: "Schedule discovery call with Sarah",
        status: "DONE",
        priority: "MEDIUM",
        category: "ONBOARDING",
        completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        assignedTo: "chase",
        sortOrder: 1,
        tags: ["call"],
      },
      {
        title: "Update Blok Blok website portfolio",
        status: "BACKLOG",
        priority: "LOW",
        category: "DEVELOPMENT",
        dueDate: inDays(21),
        assignedTo: "chase",
        sortOrder: 0,
        tags: ["internal", "website"],
      },
      {
        title: "Weekly client reporting automation",
        description: "Set up automated weekly reports for all active clients",
        status: "IN_REVIEW",
        priority: "MEDIUM",
        category: "STRATEGY",
        dueDate: inDays(5),
        assignedTo: "agent",
        sortOrder: 0,
        tags: ["automation", "reporting"],
      },
      {
        clientId: kofi.id,
        title: "Overdue: Respond to Kofi's brand guidelines feedback",
        status: "TODO",
        priority: "URGENT",
        category: "CLIENT_COMMS",
        dueDate: inDays(-2), // overdue
        assignedTo: "chase",
        sortOrder: 0,
        tags: ["urgent", "feedback"],
      },
    ],
  });

  // Sample Activity Logs
  await prisma.activityLog.createMany({
    data: [
      {
        clientId: kofi.id,
        actor: "agent",
        action: "created_task",
        details: "Created task: Create March content calendar",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        clientId: kofi.id,
        actor: "agent",
        action: "moved_task",
        details: 'Moved "Create March content calendar" from TODO to IN_PROGRESS. Reason: Work has begun on content planning.',
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      },
      {
        actor: "agent",
        action: "cycle_completed",
        details: JSON.stringify({ actionsExecuted: 5, errors: 0, duration: 3200, analysis: "All active clients reviewed. 1 overdue item flagged." }),
        createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      },
      {
        actor: "agent",
        action: "suggested_action",
        details: JSON.stringify({
          suggestion: "Schedule a Q1 review meeting with Kofi Boateng to discuss performance metrics and content strategy for Q2",
          reasoning: "Kofi's contract has been active for 6 months. A mid-engagement review would strengthen the relationship and identify optimization opportunities.",
          urgency: "medium",
        }),
        createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      },
      {
        clientId: prospect.id,
        actor: "chase",
        action: "created_client",
        details: "Created client: Sarah Chen (TechVault)",
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        actor: "agent",
        action: "flagged_overdue",
        details: "Flagged overdue task: Respond to Kofi's brand guidelines feedback (2 days overdue)",
        createdAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
    ],
  });

  // Sample Invoice
  await prisma.invoice.create({
    data: {
      clientId: kofi.id,
      amount: 3500,
      currency: "USD",
      status: "PAID",
      dueDate: new Date("2026-03-01"),
      paidAt: new Date("2026-02-28"),
    },
  });

  await prisma.invoice.create({
    data: {
      clientId: kofi.id,
      amount: 3500,
      currency: "USD",
      status: "SENT",
      dueDate: new Date("2026-04-01"),
    },
  });

  console.log("Seed complete!");
  console.log(`  - 3 clients (1 active, 1 prospect, 1 past)`);
  console.log(`  - 8 tasks across various statuses`);
  console.log(`  - 6 activity log entries`);
  console.log(`  - 2 invoices`);
  console.log(`  - Default agent config`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
