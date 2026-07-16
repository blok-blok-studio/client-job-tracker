import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/users/assignable — active team members for task assignment.
// Unlike /api/users (owner-only), any authenticated team member can read
// this: it exposes only id + name.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return NextResponse.json({ success: true, data: users });
}
