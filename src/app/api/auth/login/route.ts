import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createSessionToken,
  getSessionCookieConfig,
  checkRateLimit,
} from "@/lib/auth";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";

  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${Math.ceil((rl.retryAfter || 900) / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 900) } }
    );
  }

  try {
    const { email, password } = await request.json();

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const meta = requestMeta(request);
    const user = await authenticateUser(email, password);
    if (!user) {
      // Audit trail: failed attempt with source IP
      await prisma.activityLog.create({
        data: { actor: email.slice(0, 100), action: "login_failed", details: "Failed sign-in attempt", ...meta },
      }).catch(() => {});
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Audit trail: successful sign-in with source IP
    await prisma.activityLog.create({
      data: { actor: user.name, action: "login", details: `${user.name} signed in`, ...meta },
    }).catch(() => {});

    const token = createSessionToken(user);
    const cookieConfig = getSessionCookieConfig(token);

    const response = NextResponse.json({
      success: true,
      user: { name: user.name, email: user.email, role: user.role },
    });
    response.cookies.set(cookieConfig);

    return response;
  } catch {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
