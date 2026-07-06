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
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: { name?: string; role?: string; isActive?: boolean; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: {
    name?: string;
    role?: "OWNER" | "MEMBER";
    isActive?: boolean;
    passwordHash?: string;
  } = {};

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
