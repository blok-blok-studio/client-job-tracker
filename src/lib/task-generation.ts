/**
 * Auto-generates Kanban tasks from purchased packages when payment is confirmed.
 * Each package becomes 1 task; each deliverable becomes a checklist item on that task.
 * Custom items are grouped into a single "Custom Items — Initial Setup" task.
 */

import prisma from "./prisma";
import {
  SERVICE_PACKAGES,
  ADDON_PACKAGES,
  type PackageCategory,
} from "./contract-templates";

// --- Types ---

interface SelectedPackagesData {
  packages: string[];
  addons: string[];
  customItems: { name: string; price: number; recurring?: boolean }[];
  packageCustomizations?: Record<
    string,
    { priceOverride?: number; excludedDeliverables?: number[] }
  >;
}

// --- Category Mapping ---

const CATEGORY_MAP: Record<PackageCategory, string> = {
  "ai-agents": "DEVELOPMENT",
  "ai-agent-retainers": "DEVELOPMENT",
  "web-brand": "DESIGN",
  "social-setup": "SOCIAL_MEDIA",
  "social-management": "SOCIAL_MEDIA",
  "social-addons": "SOCIAL_MEDIA",
  "youtube": "CONTENT_CREATION",
  "marketing-retainers": "STRATEGY",
  "custom-development": "DEVELOPMENT",
  "dev-retainers": "DEVELOPMENT",
  "general-addons": "GENERAL",
  "dev-addons": "DEVELOPMENT",
};

// --- Timeline Parsing ---

/**
 * Parses timeline strings like "4-6 weeks", "1-2 weeks", "3-5 days" into days.
 * Uses the upper bound for the due date.
 */
function parseTimelineToDays(timeline: string): number {
  const match = timeline.match(
    /(\d+)\s*(?:[-–to]+\s*)?(\d+)?\s*(day|week|month)/i
  );
  if (!match) return 30; // safe default: 1 month
  const upperBound = match[2] ? parseInt(match[2]) : parseInt(match[1]);
  const unit = match[3].toLowerCase();
  if (unit.startsWith("day")) return upperBound;
  if (unit.startsWith("week")) return upperBound * 7;
  if (unit.startsWith("month")) return upperBound * 30;
  return 30;
}

// --- Main Export ---

/**
 * Auto-generates tasks from a contract's selected packages.
 * Idempotent — won't create duplicates if called multiple times.
 *
 * @returns Number of tasks created
 */
export async function generateTasksFromContract(
  clientId: string,
  contractId: string
): Promise<number> {
  // 1. Idempotency check — skip if tasks already generated for this contract
  const alreadyGenerated = await prisma.activityLog.findFirst({
    where: {
      clientId,
      action: "pipeline_tasks_generated",
      details: { contains: contractId },
    },
  });
  if (alreadyGenerated) {
    console.log(
      `[TaskGen] Tasks already generated for contract ${contractId}, skipping`
    );
    return 0;
  }

  // 2. Load the contract's structured package selection
  const contract = await prisma.contractSignature.findUnique({
    where: { id: contractId },
    select: { selectedPackages: true },
  });
  if (!contract?.selectedPackages) {
    console.log(
      `[TaskGen] No selectedPackages on contract ${contractId}, skipping`
    );
    return 0;
  }

  const data = contract.selectedPackages as unknown as SelectedPackagesData;
  const now = new Date();
  let tasksCreated = 0;

  // 3. Resolve selected packages + addons to their full definitions
  const allPackageIds = [...(data.packages || []), ...(data.addons || [])];
  const allPackageDefs = [
    ...SERVICE_PACKAGES.filter((p) => allPackageIds.includes(p.id)),
    ...ADDON_PACKAGES.filter((a) => allPackageIds.includes(a.id)),
  ];

  // 4. Create a task for each package
  for (const pkg of allPackageDefs) {
    // Filter out excluded deliverables
    const excluded =
      data.packageCustomizations?.[pkg.id]?.excludedDeliverables || [];
    const deliverables = pkg.deliverables.filter(
      (_, i) => !excluded.includes(i)
    );
    if (deliverables.length === 0) continue;

    const dueDays = parseTimelineToDays(pkg.timeline);
    const dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);
    const category = CATEGORY_MAP[pkg.category] || "GENERAL";
    const isRetainer = !!pkg.recurring;

    const task = await prisma.task.create({
      data: {
        clientId,
        title: isRetainer ? `${pkg.name} — Monthly Setup` : pkg.name,
        description: pkg.description,
        status: "TODO",
        priority: "HIGH",
        category: category as "DEVELOPMENT" | "DESIGN" | "SOCIAL_MEDIA" | "CONTENT_CREATION" | "STRATEGY" | "GENERAL",
        dueDate,
        assignedTo: "chase",
        isRecurring: false,
        tags: isRetainer
          ? ["retainer", "auto-generated"]
          : ["auto-generated"],
      },
    });

    // Create checklist items for each deliverable
    await prisma.checklistItem.createMany({
      data: deliverables.map((label, index) => ({
        taskId: task.id,
        label,
        sortOrder: index,
      })),
    });

    tasksCreated++;
  }

  // 5. Group custom items into a single task
  const customItems = data.customItems || [];
  if (customItems.length > 0) {
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks default

    const task = await prisma.task.create({
      data: {
        clientId,
        title: "Custom Items — Initial Setup",
        description: `${customItems.length} custom item(s) from contract.`,
        status: "TODO",
        priority: "MEDIUM",
        category: "GENERAL",
        dueDate,
        assignedTo: "chase",
        tags: ["auto-generated", "custom"],
      },
    });

    await prisma.checklistItem.createMany({
      data: customItems.map((item, index) => ({
        taskId: task.id,
        label: `${item.name}${item.recurring ? " (recurring)" : ""}`,
        sortOrder: index,
      })),
    });

    tasksCreated++;
  }

  // 6. Log for idempotency + activity feed
  await prisma.activityLog.create({
    data: {
      clientId,
      actor: "agent",
      action: "pipeline_tasks_generated",
      details: `Auto-generated ${tasksCreated} task(s) from contract ${contractId}`,
    },
  });

  console.log(
    `[TaskGen] Created ${tasksCreated} tasks for client ${clientId} from contract ${contractId}`
  );

  return tasksCreated;
}
