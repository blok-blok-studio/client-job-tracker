import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { socialPersonSchema } from "@/lib/validations";

export interface SocialPersonOption {
  id: string | null;
  handle: string;
  name: string | null;
  uses: number;
  lastUsedAt: string | null;
}

// GET /api/social-people?platform=INSTAGRAM
// Saved people plus every handle already tagged or invited on that platform's
// posts, so the composer can suggest them. Most recently used first.
export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform") || "INSTAGRAM";
  if (platform !== "INSTAGRAM") {
    return NextResponse.json({ success: true, data: [] });
  }

  const [saved, posts] = await Promise.all([
    prisma.socialPerson.findMany({ where: { platform } }),
    prisma.contentPost.findMany({
      where: {
        platform,
        OR: [{ taggedUsers: { isEmpty: false } }, { collaborators: { isEmpty: false } }],
      },
      select: { taggedUsers: true, collaborators: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
  ]);

  const byHandle = new Map<string, SocialPersonOption>();
  for (const p of saved) {
    byHandle.set(p.handle, { id: p.id, handle: p.handle, name: p.name, uses: 0, lastUsedAt: null });
  }
  for (const post of posts) {
    const handles = new Set([...post.taggedUsers, ...post.collaborators].map((h) => h.trim().replace(/^@+/, "").toLowerCase()).filter(Boolean));
    for (const handle of handles) {
      const entry = byHandle.get(handle) || { id: null, handle, name: null, uses: 0, lastUsedAt: null };
      entry.uses++;
      const used = post.updatedAt.toISOString();
      if (!entry.lastUsedAt || used > entry.lastUsedAt) entry.lastUsedAt = used;
      byHandle.set(handle, entry);
    }
  }

  const data = [...byHandle.values()].sort(
    (a, b) => (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "") || (a.name || a.handle).localeCompare(b.name || b.handle)
  );
  return NextResponse.json({ success: true, data });
}

// POST /api/social-people — save someone (or rename them) by handle
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const parsed = socialPersonSchema.parse(await request.json());
    const name = parsed.name || null;
    const person = await prisma.socialPerson.upsert({
      where: { platform_handle: { platform: parsed.platform, handle: parsed.handle } },
      create: { platform: parsed.platform, handle: parsed.handle, name, createdBy: session?.name || null },
      update: { name },
    });
    return NextResponse.json({ success: true, data: person });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ success: false, error: err.issues[0]?.message || "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Couldn't save that person" }, { status: 500 });
  }
}
