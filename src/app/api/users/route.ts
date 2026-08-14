import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { TEAM_ROLE_KEYS, pagesForRole } from "@/lib/team-roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/users — list team members (owner only)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      slackUserId: true,
      color: true,
      allowedPages: true,
      jobRole: true,
    },
  });

  return NextResponse.json({ users });
}

// POST /api/users — invite/create a team member (owner only)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { name?: string; email?: string; password?: string; role?: string; jobRole?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const role = body.role === "OWNER" ? "OWNER" : "MEMBER";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return NextResponse.json(
      { error: "A user with that email already exists" },
      { status: 409 }
    );

  // A job role at creation also sets the tabs that job needs, so a new member
  // lands on a sensible sidebar instead of either everything or nothing.
  const jobRole = typeof body.jobRole === "string" && body.jobRole.trim() ? body.jobRole.trim() : null;
  if (jobRole && !TEAM_ROLE_KEYS.includes(jobRole))
    return NextResponse.json({ error: "Unknown job role" }, { status: 400 });
  const allowedPages = jobRole && role !== "OWNER" ? pagesForRole(jobRole) : [];

  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPassword(password), role, jobRole, allowedPages },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      slackUserId: true,
      color: true,
      allowedPages: true,
      jobRole: true,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
