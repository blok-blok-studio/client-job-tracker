import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PATCH /api/users/[id] — update name, role, active state, or password (owner only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { name?: string; role?: string; isActive?: boolean; password?: string; slackUserId?: string | null; color?: string | null; allowedPages?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Owners can edit anyone; members may only change their own profile color
  if (session.role !== "OWNER") {
    const onlyColor = Object.keys(body).every((k) => k === "color");
    if (session.id !== id || !onlyColor)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: {
    name?: string;
    role?: "OWNER" | "MEMBER";
    isActive?: boolean;
    passwordHash?: string;
    slackUserId?: string | null;
    color?: string | null;
    allowedPages?: string[];
  } = {};

  const VALID_PAGES = ["clients", "kanban", "my-tasks", "calendar", "content", "newsletter", "automation", "files", "vault", "money", "invoices", "activity", "reports", "monthly-reports", "support"];
  if (body.allowedPages !== undefined) {
    if (session.role !== "OWNER")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!Array.isArray(body.allowedPages) || !body.allowedPages.every((x) => VALID_PAGES.includes(x)))
      return NextResponse.json({ error: "Invalid page list" }, { status: 400 });
    data.allowedPages = body.allowedPages;
  }

  if (body.color !== undefined) {
    const c = typeof body.color === "string" ? body.color.trim() : "";
    if (c && !/^#[0-9a-fA-F]{6}$/.test(c))
      return NextResponse.json({ error: "Color must be a hex value like #FF6B00" }, { status: 400 });
    data.color = c || null;
  }

  if (body.slackUserId !== undefined) {
    const sid = typeof body.slackUserId === "string" ? body.slackUserId.trim() : "";
    if (sid && !/^[UW][A-Z0-9]{5,20}$/.test(sid))
      return NextResponse.json(
        { error: "Slack member ID should look like U0123ABCDEF" },
        { status: 400 }
      );
    data.slackUserId = sid || null;
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = name;
  }

  if (body.role === "OWNER" || body.role === "MEMBER") {
    data.role = body.role;
  }

  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8)
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    data.passwordHash = hashPassword(body.password);
  }

  // Guard: never leave the app without at least one active owner.
  const wouldRemoveOwner =
    target.role === "OWNER" &&
    ((data.role && data.role !== "OWNER") || data.isActive === false);
  if (wouldRemoveOwner) {
    const otherActiveOwners = await prisma.user.count({
      where: { role: "OWNER", isActive: true, id: { not: id } },
    });
    if (otherActiveOwners === 0)
      return NextResponse.json(
        { error: "Cannot remove the last active owner" },
        { status: 400 }
      );
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user });
}

// DELETE /api/users/[id] — remove a team member (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === session.id)
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.role === "OWNER") {
    const otherActiveOwners = await prisma.user.count({
      where: { role: "OWNER", isActive: true, id: { not: id } },
    });
    if (otherActiveOwners === 0)
      return NextResponse.json(
        { error: "Cannot delete the last active owner" },
        { status: 400 }
      );
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
