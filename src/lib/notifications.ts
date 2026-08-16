import prisma from "@/lib/prisma";

/**
 * In-app notification inbox. Every row lands in the recipient's bell menu in
 * the TopBar; Slack pings stay as-is — this is the persistent trail Slack
 * scrolls away from.
 *
 * Recipients are User.ids. Task assignment stores a display name, so
 * notifyUserByName resolves it the same case-insensitive way the kanban
 * assignee matching does.
 */

export type NotificationType = "task_assigned" | "mention" | "task_comment";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  taskId?: string | null;
  clientId?: string | null;
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body || null,
      link: input.link || null,
      taskId: input.taskId || null,
      clientId: input.clientId || null,
    },
  });
}

/** Resolve a display name (task assignee) to a user and notify them. No-op when nobody matches. */
export async function notifyUserByName(
  name: string | null | undefined,
  input: Omit<NotifyInput, "userId">
): Promise<void> {
  if (!name) return;
  const user = await prisma.user.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, isActive: true },
    select: { id: true },
  });
  if (!user) return;
  await notifyUser({ ...input, userId: user.id });
}

/**
 * Parse @mentions out of a comment body against the real team roster.
 * Matches "@Full Name" (longest name first so "@Kyle Talley" doesn't stop at a
 * hypothetical "@Kyle") and "@first-name" case-insensitively.
 */
export function extractMentions(
  body: string,
  users: Array<{ id: string; name: string }>
): Array<{ id: string; name: string }> {
  const found = new Map<string, { id: string; name: string }>();
  const sorted = [...users].sort((a, b) => b.name.length - a.name.length);
  for (const u of sorted) {
    const first = u.name.split(/\s+/)[0];
    for (const candidate of [u.name, first]) {
      if (!candidate) continue;
      const re = new RegExp(`@${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "i");
      if (re.test(body)) {
        found.set(u.id, { id: u.id, name: u.name });
        break;
      }
    }
  }
  return [...found.values()];
}
