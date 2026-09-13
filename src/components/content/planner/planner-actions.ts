import { readJson } from "@/lib/fetch-json";
import { isReschedulable, type PlannerPost, type PostGroup } from "./planner-utils";

async function patchPost(id: string, body: Record<string, unknown>): Promise<PlannerPost> {
  const res = await fetch(`/api/content-posts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await readJson<{ data: PlannerPost }>(res, "Couldn't update the post.");
  if (!result.ok || !result.data) throw new Error(result.error || "Couldn't update the post.");
  return result.data.data;
}

/** Move every movable post in a group to the new time. Returns the updated posts. */
export async function rescheduleGroup(group: PostGroup, when: Date): Promise<PlannerPost[]> {
  const movable = group.posts.filter(isReschedulable);
  return Promise.all(movable.map((p) => patchPost(p.id, { scheduledAt: when.toISOString() })));
}

export async function reschedulePosts(posts: PlannerPost[], when: Date): Promise<PlannerPost[]> {
  return Promise.all(posts.filter(isReschedulable).map((p) => patchPost(p.id, { scheduledAt: when.toISOString() })));
}

/** Queue a failed post again; a past time becomes two minutes from now. */
export async function retryPost(post: PlannerPost): Promise<PlannerPost> {
  const soon = new Date(Date.now() + 2 * 60 * 1000);
  const scheduled = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const when = !scheduled || scheduled < soon ? soon : scheduled;
  return patchPost(post.id, { status: "SCHEDULED", scheduledAt: when.toISOString() });
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/content-posts/${id}`, { method: "DELETE" });
  const result = await readJson(res, "Couldn't delete the post.");
  if (!result.ok) throw new Error(result.error || "Couldn't delete the post.");
}
