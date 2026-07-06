import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createSessionToken,
  getSessionCookieConfig,
  checkRateLimit,
} from "@/lib/auth";

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

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

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
